// @vitest-environment node
/**
 * Integration tests for the deposits service — real Neon database (see
 * .env, loaded via vitest.config.ts). Same pattern as
 * src/lib/services/__tests__/savings.integration.test.ts.
 *
 * Covers what unit tests on src/lib/finance/deposit.ts's pure math CAN'T:
 * atomic wallet-balance movement through `postEntries`, the CHECK
 * constraints as a real DB backstop (not just Zod), cron idempotency
 * against real rows, ARO successor creation, cross-user isolation, and
 * reconciliation.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { assets, deposits, ledgerEntries, wallets } from '@/lib/db/schema';
import { findWalletBalanceDrift } from '@/lib/db/reconcile';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  createTestAsset,
  createTestDeposit,
  createTestUser,
  createTestWallet,
  deleteTestDeposit,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { createDeposit, payMonthlyInterest, processMaturities, updateDeposit, withdrawDeposit } from '../deposits';

describe('deposits service', () => {
  const userIds: string[] = [];
  const depositIds: string[] = [];

  afterEach(async () => {
    for (const id of depositIds.splice(0)) {
      await deleteTestDeposit(id).catch(() => {}); // already deleted by deleteTestUser below, in some tests
    }
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  async function walletBalance(walletId: string): Promise<bigint> {
    const [row] = await dbWrite.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.id, walletId));
    return row?.balance ?? 0n;
  }

  async function depositRow(depositId: string) {
    const [row] = await dbWrite.select().from(deposits).where(eq(deposits.id, depositId));
    return row;
  }

  async function assetRow(assetId: string) {
    const [row] = await dbWrite.select().from(assets).where(eq(assets.id, assetId));
    return row;
  }

  describe('createDeposit', () => {
    it('funded from a wallet: wallet balance drops by exactly principal, via a deposit_placement ledger entry', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 50_000_000_00n });

      const deposit = await createDeposit(userId, {
        bankName: 'BCA',
        principal: 10_000_000_00n,
        interestRateAnnual: '4.2500',
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
        payoutSchedule: 'at_maturity',
        aroEnabled: false,
        aroIncludeInterest: false,
        walletId,
        idempotencyKey: crypto.randomUUID(),
      });
      depositIds.push(deposit.id);

      expect(await walletBalance(walletId)).toBe(40_000_000_00n);

      const [entry] = await dbWrite
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.source, 'deposit_placement'), eq(ledgerEntries.sourceId, deposit.id)));
      expect(entry?.amount).toBe(-10_000_000_00n);
      expect(entry?.walletId).toBe(walletId);

      const asset = await assetRow(deposit.assetId);
      expect(asset?.assetType).toBe('deposit');
      expect(asset?.status).toBe('active');
      expect(asset?.cachedValue).toBe(10_000_000_00n);
    });

    it('without a wallet: creates the asset+deposit, touches no ledger entry or wallet balance', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 1_000_000_00n });

      const deposit = await createDeposit(userId, {
        bankName: 'Mandiri',
        principal: 20_000_000_00n,
        interestRateAnnual: '5.0000',
        startDate: '2026-01-01',
        maturityDate: '2026-07-01',
        payoutSchedule: 'at_maturity',
        aroEnabled: false,
        aroIncludeInterest: false,
        walletId: null,
        idempotencyKey: crypto.randomUUID(),
      });
      depositIds.push(deposit.id);

      expect(deposit.walletId).toBeNull();
      expect(await walletBalance(walletId)).toBe(1_000_000_00n); // untouched

      const [entry] = await dbWrite.select().from(ledgerEntries).where(eq(ledgerEntries.sourceId, deposit.id));
      expect(entry).toBeUndefined();
    });

    it('tax_rate: auto 0.2000 above Rp7.500.000, auto 0.0000 at or below it', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      const above = await createDeposit(userId, {
        bankName: 'BCA',
        principal: 7_500_000_01n, // 1 sen above the threshold
        interestRateAnnual: '4.0000',
        startDate: '2026-01-01',
        maturityDate: '2026-02-01',
        payoutSchedule: 'at_maturity',
        aroEnabled: false,
        aroIncludeInterest: false,
        walletId: null,
        idempotencyKey: crypto.randomUUID(),
      });
      depositIds.push(above.id);
      expect(above.taxRate).toBe('0.2000');

      const atThreshold = await createDeposit(userId, {
        bankName: 'BCA',
        principal: 7_500_000_00n, // exactly at the threshold — still exempt
        interestRateAnnual: '4.0000',
        startDate: '2026-01-01',
        maturityDate: '2026-02-01',
        payoutSchedule: 'at_maturity',
        aroEnabled: false,
        aroIncludeInterest: false,
        walletId: null,
        idempotencyKey: crypto.randomUUID(),
      });
      depositIds.push(atThreshold.id);
      expect(atThreshold.taxRate).toBe('0.0000');
    });

    it('idempotent: two calls with the SAME key create exactly one deposit, one asset, one ledger entry', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 50_000_000_00n });
      const idempotencyKey = crypto.randomUUID();

      const input = {
        bankName: 'BCA',
        principal: 10_000_000_00n,
        interestRateAnnual: '4.2500',
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
        payoutSchedule: 'at_maturity' as const,
        aroEnabled: false,
        aroIncludeInterest: false,
        walletId,
        idempotencyKey,
      };

      const first = await createDeposit(userId, input);
      const second = await createDeposit(userId, input);
      depositIds.push(first.id);

      expect(second.id).toBe(first.id);
      expect(await walletBalance(walletId)).toBe(40_000_000_00n); // debited exactly ONCE, not twice

      const allForKey = await dbWrite.select().from(deposits).where(eq(deposits.idempotencyKey, idempotencyKey));
      expect(allForKey).toHaveLength(1);
    });

    it('`monthly` schedule without a wallet is rejected — nowhere to credit interest', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await expect(
        createDeposit(userId, {
          bankName: 'BCA',
          principal: 10_000_000_00n,
          interestRateAnnual: '4.2500',
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
          payoutSchedule: 'monthly',
          aroEnabled: false,
          aroIncludeInterest: false,
          walletId: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('maturityDate at or before startDate is rejected', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await expect(
        createDeposit(userId, {
          bankName: 'BCA',
          principal: 10_000_000_00n,
          interestRateAnnual: '4.2500',
          startDate: '2026-01-01',
          maturityDate: '2026-01-01',
          payoutSchedule: 'at_maturity',
          aroEnabled: false,
          aroIncludeInterest: false,
          walletId: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('updateDeposit', () => {
    it('edits an active deposit', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const deposit = await createDeposit(userId, {
        bankName: 'BCA',
        principal: 10_000_000_00n,
        interestRateAnnual: '4.2500',
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
        payoutSchedule: 'at_maturity',
        aroEnabled: false,
        aroIncludeInterest: false,
        walletId: null,
        idempotencyKey: crypto.randomUUID(),
      });
      depositIds.push(deposit.id);

      const updated = await updateDeposit(userId, deposit.id, {
        bankName: 'BCA Prioritas',
        interestRateAnnual: '4.5000',
        maturityDate: '2027-06-01',
        payoutSchedule: 'at_maturity',
        aroEnabled: true,
        aroIncludeInterest: true,
      });

      expect(updated.bankName).toBe('BCA Prioritas');
      expect(updated.interestRateAnnual).toBe('4.5000');
      expect(updated.maturityDate).toBe('2027-06-01');
      expect(updated.aroEnabled).toBe(true);
      // principal/startDate/walletId are locked — not part of UpdateDepositInput at all.
      expect(updated.principal).toBe(10_000_000_00n);
      expect(updated.startDate).toBe('2026-01-01');
    });

    it('rejects editing a non-active deposit', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const depositId = await createTestDeposit(userId, { status: 'matured' });
      depositIds.push(depositId);

      await expect(
        updateDeposit(userId, depositId, {
          bankName: 'BCA',
          interestRateAnnual: '4.0000',
          maturityDate: '2027-01-01',
          payoutSchedule: 'at_maturity',
          aroEnabled: false,
          aroIncludeInterest: false,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("cross-user isolation: user B cannot update user A's deposit — NotFoundError, not ForbiddenError", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const depositId = await createTestDeposit(alice);
      depositIds.push(depositId);

      await expect(
        updateDeposit(bob, depositId, {
          bankName: 'Hacked',
          interestRateAnnual: '4.0000',
          maturityDate: '2027-01-01',
          payoutSchedule: 'at_maturity',
          aroEnabled: false,
          aroIncludeInterest: false,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('withdrawDeposit', () => {
    // Same fixture as src/lib/finance/__tests__/deposit.test.ts's FLAT_DEPOSIT
    // — 200-day tenor, exactly 100.000 sen/hari gross so every prorated
    // figure below is exact, hand-verifiable arithmetic (see that file for
    // the derivation): 100 days → 8.000.000 bersih; full 200 days → 16.000.000 bersih.
    async function createFlatDeposit(userId: string, walletId: string | null) {
      return createDeposit(userId, {
        bankName: 'BCA',
        principal: 3_650_000_000n,
        interestRateAnnual: '1.0000',
        startDate: '2026-01-01',
        maturityDate: '2026-07-20',
        payoutSchedule: 'at_maturity',
        aroEnabled: false,
        aroIncludeInterest: false,
        walletId,
        idempotencyKey: crypto.randomUUID(),
      });
    }

    it('early withdrawal (day 100 of 200): credits principal + net interest prorated to the withdrawal date, marks withdrawn, disposes the asset', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const sourceWallet = await createTestWallet(userId, { balance: 50_000_000_00n });
      const destWallet = await createTestWallet(userId, { balance: 0n });
      const deposit = await createFlatDeposit(userId, sourceWallet);
      depositIds.push(deposit.id);

      const result = await withdrawDeposit(userId, deposit.id, {
        walletId: destWallet,
        withdrawalDate: new Date('2026-04-11T00:00:00.000Z'), // +100 hari
        idempotencyKey: crypto.randomUUID(),
      });

      expect(result.principal).toBe(3_650_000_000n);
      expect(result.netInterest).toBe(8_000_000n); // dihitung tangan — lihat komentar di atas
      expect(result.totalCredited).toBe(3_658_000_000n);

      expect(await walletBalance(destWallet)).toBe(3_658_000_000n);
      const updated = await depositRow(deposit.id);
      expect(updated?.status).toBe('withdrawn');
      const asset = await assetRow(deposit.assetId);
      expect(asset?.status).toBe('disposed');
      expect(asset?.cachedValue).toBe(0n);
    });

    it('withdrawal at/after maturity caps interest at the full tenor — no bonus for waiting', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const destWallet = await createTestWallet(userId, { balance: 0n });
      const deposit = await createFlatDeposit(userId, null);
      depositIds.push(deposit.id);

      const result = await withdrawDeposit(userId, deposit.id, {
        walletId: destWallet,
        withdrawalDate: new Date('2027-01-01T00:00:00.000Z'), // well past maturity (2026-07-20)
        idempotencyKey: crypto.randomUUID(),
      });

      expect(result.netInterest).toBe(16_000_000n); // tenor penuh 200 hari — lihat deposit.test.ts
      expect(result.totalCredited).toBe(3_666_000_000n);
    });

    it('idempotent: a retry with the SAME key returns the identical result and credits the wallet only once', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const destWallet = await createTestWallet(userId, { balance: 0n });
      const deposit = await createFlatDeposit(userId, null);
      depositIds.push(deposit.id);
      const idempotencyKey = crypto.randomUUID();

      const first = await withdrawDeposit(userId, deposit.id, {
        walletId: destWallet,
        withdrawalDate: new Date('2026-04-11T00:00:00.000Z'),
        idempotencyKey,
      });
      const second = await withdrawDeposit(userId, deposit.id, {
        walletId: destWallet,
        withdrawalDate: new Date('2026-04-11T00:00:00.000Z'),
        idempotencyKey,
      });

      expect(second.totalCredited).toBe(first.totalCredited);
      expect(second.ledgerEntryId).toBe(first.ledgerEntryId);
      expect(await walletBalance(destWallet)).toBe(first.totalCredited); // credited ONCE
    });

    it('withdrawing an already-withdrawn deposit with a DIFFERENT key is rejected, not silently re-processed', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const destWallet = await createTestWallet(userId, { balance: 0n });
      const deposit = await createFlatDeposit(userId, null);
      depositIds.push(deposit.id);

      await withdrawDeposit(userId, deposit.id, {
        walletId: destWallet,
        withdrawalDate: new Date('2026-04-11T00:00:00.000Z'),
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(
        withdrawDeposit(userId, deposit.id, {
          walletId: destWallet,
          withdrawalDate: new Date('2026-05-01T00:00:00.000Z'),
          idempotencyKey: crypto.randomUUID(), // a DIFFERENT key
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("cross-user isolation: user B cannot withdraw user A's deposit", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const bobWallet = await createTestWallet(bob);
      const deposit = await createFlatDeposit(alice, null);
      depositIds.push(deposit.id);

      await expect(
        withdrawDeposit(bob, deposit.id, {
          walletId: bobWallet,
          withdrawalDate: new Date(),
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('`monthly` schedule: withdrawal only pays interest accrued SINCE the last monthly credit, never re-paying already-credited months', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const wallet = await createTestWallet(userId, { balance: 0n });
      const deposit = await createDeposit(userId, {
        bankName: 'BCA',
        principal: 3_650_000_000n,
        interestRateAnnual: '1.0000',
        startDate: '2026-01-01',
        maturityDate: '2026-07-20',
        payoutSchedule: 'monthly',
        aroEnabled: false,
        aroIncludeInterest: false,
        walletId: wallet,
        idempotencyKey: crypto.randomUUID(),
      });
      depositIds.push(deposit.id);

      // Simulate a monthly credit already having happened through day 90 —
      // directly set lastInterestPaymentDate (the cron itself is tested
      // separately below).
      await dbWrite.update(deposits).set({ lastInterestPaymentDate: '2026-04-01' }).where(eq(deposits.id, deposit.id));

      const result = await withdrawDeposit(userId, deposit.id, {
        walletId: wallet,
        withdrawalDate: new Date('2026-04-11T00:00:00.000Z'), // 10 hari sejak pembayaran terakhir
        idempotencyKey: crypto.randomUUID(),
      });

      // 10 hari × 100.000 sen/hari = 1.000.000 kotor; pajak 20% = 200.000;
      // bersih = 800.000 — BUKAN 8.000.000 (yang akan terjadi bila salah
      // memprorata dari startDate, mengulang bunga yang sudah dibayar).
      expect(result.netInterest).toBe(800_000n);
    });
  });

  describe('processMaturities', () => {
    it('marks an overdue `active` deposit `matured`, leaves a not-yet-due one `active`', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const overdue = await createTestDeposit(userId, { startDate: '2020-01-01', maturityDate: '2020-06-01', status: 'active' });
      const notYetDue = await createTestDeposit(userId, { startDate: '2020-01-01', maturityDate: '2099-06-01', status: 'active' });
      depositIds.push(overdue, notYetDue);

      const result = await processMaturities(new Date('2020-06-01T00:00:00.000Z'));

      expect(result.maturedCount).toBeGreaterThanOrEqual(1);
      expect((await depositRow(overdue))?.status).toBe('matured');
      expect((await depositRow(notYetDue))?.status).toBe('active');

      const asset = await assetRow((await depositRow(overdue))!.assetId);
      expect(asset?.status).toBe('active'); // still findable/withdrawable
      expect(asset?.cachedValue).toBe(0n); // but no longer counted — see file header
    });

    it('idempotent: calling twice has exactly one effect', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const depositId = await createTestDeposit(userId, { startDate: '2020-01-01', maturityDate: '2020-06-01', status: 'active' });
      depositIds.push(depositId);

      const today = new Date('2020-06-02T00:00:00.000Z');
      const first = await processMaturities(today);
      const second = await processMaturities(today);

      expect(first.maturedCount).toBeGreaterThanOrEqual(1);
      expect(second.maturedCount).toBe(0); // nothing left in `active` + overdue on the second pass
    });

    it('ARO without aro_include_interest: successor principal = old principal; settlement interest is credited to the linked wallet instead', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const wallet = await createTestWallet(userId, { balance: 0n });
      // 200-hari tenor, 100.000 sen/hari — tenor penuh bersih = 16.000.000 (lihat deposit.test.ts).
      const oldId = await createTestDeposit(userId, {
        principal: 3_650_000_000n,
        interestRateAnnual: '1.0000',
        taxRate: '0.2000',
        startDate: '2026-01-01',
        maturityDate: '2026-07-20',
        status: 'active',
        aroEnabled: true,
        aroIncludeInterest: false,
        walletId: wallet,
      });
      depositIds.push(oldId);

      await processMaturities(new Date('2026-07-20T00:00:00.000Z'));

      const old = await depositRow(oldId);
      expect(old?.status).toBe('matured');

      const [successor] = await dbWrite.select().from(deposits).where(eq(deposits.rolledFromId, oldId));
      expect(successor).toBeDefined();
      depositIds.push(successor!.id);
      expect(successor!.principal).toBe(3_650_000_000n); // unchanged — interest paid out, not rolled in
      expect(successor!.startDate).toBe('2026-07-20');
      expect(successor!.maturityDate).toBe('2027-02-05'); // same 200-day tenor, rolled forward
      expect(successor!.status).toBe('active');

      expect(await walletBalance(wallet)).toBe(16_000_000n); // settlement interest paid out
    });

    it('ARO with aro_include_interest: successor principal = old principal + net interest', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const oldId = await createTestDeposit(userId, {
        principal: 3_650_000_000n,
        interestRateAnnual: '1.0000',
        taxRate: '0.2000',
        startDate: '2026-01-01',
        maturityDate: '2026-07-20',
        status: 'active',
        aroEnabled: true,
        aroIncludeInterest: true,
        walletId: null,
      });
      depositIds.push(oldId);

      await processMaturities(new Date('2026-07-20T00:00:00.000Z'));

      const [successor] = await dbWrite.select().from(deposits).where(eq(deposits.rolledFromId, oldId));
      depositIds.push(successor!.id);
      expect(successor!.principal).toBe(3_666_000_000n); // 3.650.000.000 + 16.000.000 bersih
    });

    it('ARO idempotent: calling processMaturities twice creates exactly ONE successor', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const oldId = await createTestDeposit(userId, {
        startDate: '2020-01-01',
        maturityDate: '2020-06-01',
        status: 'active',
        aroEnabled: true,
        aroIncludeInterest: false,
        walletId: null,
      });
      depositIds.push(oldId);

      const today = new Date('2020-06-02T00:00:00.000Z');
      await processMaturities(today);
      await processMaturities(today);

      const successors = await dbWrite.select().from(deposits).where(eq(deposits.rolledFromId, oldId));
      expect(successors).toHaveLength(1);
      depositIds.push(...successors.map((s) => s.id));
    });
  });

  describe('payMonthlyInterest', () => {
    it('credits the linked wallet once a full period has elapsed, and advances lastInterestPaymentDate', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const wallet = await createTestWallet(userId, { balance: 0n });
      const depositId = await createTestDeposit(userId, {
        principal: 3_650_000_000n,
        interestRateAnnual: '1.0000',
        taxRate: '0.2000',
        startDate: '2026-01-01',
        maturityDate: '2026-07-20',
        payoutSchedule: 'monthly',
        status: 'active',
        walletId: wallet,
      });
      depositIds.push(depositId);

      // Exactly 30 days after start — the minimum period this module uses.
      const result = await payMonthlyInterest(new Date('2026-01-31T00:00:00.000Z'));

      expect(result.paidCount).toBeGreaterThanOrEqual(1);
      // 30 hari × 100.000 sen/hari kotor = 3.000.000; pajak 20% = 600.000;
      // bersih = 2.400.000.
      expect(await walletBalance(wallet)).toBe(2_400_000n);
      expect((await depositRow(depositId))?.lastInterestPaymentDate).toBe('2026-01-31');
    });

    it('idempotent: calling twice on the same day credits the wallet only once', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const wallet = await createTestWallet(userId, { balance: 0n });
      const depositId = await createTestDeposit(userId, {
        principal: 3_650_000_000n,
        interestRateAnnual: '1.0000',
        taxRate: '0.2000',
        startDate: '2026-01-01',
        maturityDate: '2026-07-20',
        payoutSchedule: 'monthly',
        status: 'active',
        walletId: wallet,
      });
      depositIds.push(depositId);

      const today = new Date('2026-01-31T00:00:00.000Z');
      await payMonthlyInterest(today);
      const second = await payMonthlyInterest(today);

      expect(second.paidCount).toBe(0);
      expect(await walletBalance(wallet)).toBe(2_400_000n); // still just the one credit
    });

    it('does not pay a deposit whose last period is under 30 days old', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const wallet = await createTestWallet(userId, { balance: 0n });
      const depositId = await createTestDeposit(userId, {
        startDate: '2026-01-01',
        maturityDate: '2026-07-20',
        payoutSchedule: 'monthly',
        status: 'active',
        walletId: wallet,
      });
      depositIds.push(depositId);

      const result = await payMonthlyInterest(new Date('2026-01-15T00:00:00.000Z')); // only 14 days in
      expect(result.paidCount).toBe(0);
      expect(await walletBalance(wallet)).toBe(0n);
    });
  });

  describe('CHECK constraints — the database is the final backstop, not just Zod', () => {
    it('rejects maturity_date <= start_date', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const assetId = await createTestAsset(userId);

      await expect(
        dbWrite.insert(deposits).values({
          id: crypto.randomUUID(),
          assetId,
          userId,
          bankName: 'BCA',
          principal: 10_000_000_00n,
          interestRateAnnual: '4.2500',
          startDate: '2026-06-01',
          maturityDate: '2026-01-01', // before start
        }),
      ).rejects.toThrow();
    });

    it('rejects interest_rate_annual outside 0–100', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const assetId = await createTestAsset(userId);

      await expect(
        dbWrite.insert(deposits).values({
          id: crypto.randomUUID(),
          assetId,
          userId,
          bankName: 'BCA',
          principal: 10_000_000_00n,
          interestRateAnnual: '150.0000', // > 100
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      ).rejects.toThrow();
    });

    it('rejects tax_rate outside 0–1', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const assetId = await createTestAsset(userId);

      await expect(
        dbWrite.insert(deposits).values({
          id: crypto.randomUUID(),
          assetId,
          userId,
          bankName: 'BCA',
          principal: 10_000_000_00n,
          interestRateAnnual: '4.0000',
          taxRate: '1.5000', // > 1
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      ).rejects.toThrow();
    });
  });

  describe('reconciliation', () => {
    it('create funded from a wallet, then withdraw: wallet cache never drifts from SUM(ledger_entries)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      // No `balance` override — defaults to 0, matching
      // savings.integration.test.ts's own reconciliation test reasoning:
      // a non-zero cached balance with no matching ledger entry would show
      // a drift unrelated to this test.
      const sourceWallet = await createTestWallet(userId);
      const destWallet = await createTestWallet(userId);

      const deposit = await createDeposit(userId, {
        bankName: 'BCA',
        principal: 10_000_000_00n,
        interestRateAnnual: '4.2500',
        startDate: '2026-01-01',
        maturityDate: '2026-04-01',
        payoutSchedule: 'at_maturity',
        aroEnabled: false,
        aroIncludeInterest: false,
        walletId: sourceWallet,
        idempotencyKey: crypto.randomUUID(),
      });
      depositIds.push(deposit.id);

      await withdrawDeposit(userId, deposit.id, {
        walletId: destWallet,
        withdrawalDate: new Date('2026-04-01T00:00:00.000Z'),
        idempotencyKey: crypto.randomUUID(),
      });

      const drift = await findWalletBalanceDrift();
      expect(drift.filter((d) => d.walletId === sourceWallet || d.walletId === destWallet)).toHaveLength(0);
    });
  });
});
