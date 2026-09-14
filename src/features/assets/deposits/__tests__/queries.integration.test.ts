// @vitest-environment node
/**
 * Integration tests for the deposits read queries — real Neon database
 * (see .env, loaded via vitest.config.ts). Same pattern as
 * src/features/savings/__tests__/queries.integration.test.ts. Builds data
 * through the service layer (src/lib/services/deposits.ts) wherever
 * possible; falls back to the direct-insert test helper only where a
 * specific status/date combination needs precise control.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createDeposit, withdrawDeposit } from '@/lib/services/deposits';
import {
  createTestDeposit,
  createTestUser,
  createTestWallet,
  deleteTestDeposit,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { getDeposit, getTotalDepositValue, getUpcomingMaturities, listDeposits } from '../queries';

describe('deposits queries', () => {
  const userIds: string[] = [];
  const depositIds: string[] = [];

  afterEach(async () => {
    for (const id of depositIds.splice(0)) {
      await deleteTestDeposit(id).catch(() => {});
    }
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  describe('listDeposits', () => {
    it("lists only the caller's own deposits, excluding withdrawn ones", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);

      const aliceActive = await createTestDeposit(alice, { bankName: 'Alice Active', status: 'active' });
      const aliceMatured = await createTestDeposit(alice, { bankName: 'Alice Matured', status: 'matured' });
      const aliceWithdrawn = await createTestDeposit(alice, { bankName: 'Alice Withdrawn', status: 'withdrawn' });
      const bobActive = await createTestDeposit(bob, { bankName: 'Bob Active', status: 'active' });
      depositIds.push(aliceActive, aliceMatured, aliceWithdrawn, bobActive);

      const aliceList = await listDeposits(alice);
      expect(aliceList.map((d) => d.bankName).sort()).toEqual(['Alice Active', 'Alice Matured']);

      const bobList = await listDeposits(bob);
      expect(bobList.map((d) => d.bankName)).toEqual(['Bob Active']);
    });
  });

  describe('getTotalDepositValue', () => {
    it('sums principal of `active` deposits ONLY — matured and withdrawn are excluded, docs/03 §14.1', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      const active1 = await createTestDeposit(userId, { principal: 10_000_000_00n, status: 'active' });
      const active2 = await createTestDeposit(userId, { principal: 5_000_000_00n, status: 'active' });
      const matured = await createTestDeposit(userId, { principal: 999_999_999_00n, status: 'matured' });
      const withdrawn = await createTestDeposit(userId, { principal: 999_999_999_00n, status: 'withdrawn' });
      depositIds.push(active1, active2, matured, withdrawn);

      expect(await getTotalDepositValue(userId)).toBe(15_000_000_00n);
    });

    it('a deposit with large accrued interest still contributes only its principal (ADR-013, todo.md)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const wallet = await createTestWallet(userId, { balance: 200_000_000_00n });

      // Rp100.000.000 @ 4,25%/tahun, hampir jatuh tempo setahun — bunga
      // akrual bersih mendekati Rp3.400.000 (lihat
      // src/lib/finance/__tests__/deposit.test.ts untuk perhitungannya).
      const deposit = await createDeposit(userId, {
        bankName: 'BCA',
        principal: 100_000_000_00n,
        interestRateAnnual: '4.2500',
        startDate: '2020-01-01',
        maturityDate: '2099-01-01', // jauh di masa depan, murni supaya bunga terus terakumulasi tanpa cron menandainya matured
        payoutSchedule: 'at_maturity',
        aroEnabled: false,
        aroIncludeInterest: false,
        walletId: wallet,
        idempotencyKey: crypto.randomUUID(),
      });
      depositIds.push(deposit.id);

      expect(await getTotalDepositValue(userId)).toBe(100_000_000_00n); // BUKAN pokok + bunga akrual
    });
  });

  describe('getUpcomingMaturities', () => {
    it('returns only `active` deposits maturing within the given window, soonest first', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const today = new Date('2026-06-01T00:00:00.000Z');

      const in3Days = await createTestDeposit(userId, {
        bankName: 'Segera',
        startDate: '2026-01-01',
        maturityDate: '2026-06-04',
        status: 'active',
      });
      const in6Days = await createTestDeposit(userId, {
        bankName: 'Hampir',
        startDate: '2026-01-01',
        maturityDate: '2026-06-07',
        status: 'active',
      });
      const in30Days = await createTestDeposit(userId, {
        bankName: 'Jauh',
        startDate: '2026-01-01',
        maturityDate: '2026-07-01',
        status: 'active',
      });
      const alreadyMatured = await createTestDeposit(userId, {
        bankName: 'Sudah Matured',
        startDate: '2020-01-01',
        maturityDate: '2026-05-01',
        status: 'matured',
      });
      depositIds.push(in3Days, in6Days, in30Days, alreadyMatured);

      const upcoming = await getUpcomingMaturities(userId, 7, today);
      expect(upcoming.map((d) => d.bankName)).toEqual(['Segera', 'Hampir']); // 3 dan 6 hari, urut terdekat dulu
    });
  });

  describe('getDeposit', () => {
    it("returns null for another user's deposit — not found, never forbidden", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const depositId = await createTestDeposit(alice);
      depositIds.push(depositId);

      expect(await getDeposit(bob, depositId)).toBeNull();
      expect(await getDeposit(alice, depositId)).not.toBeNull();
    });

    it('includes the rolled-from bank name for an ARO successor, null otherwise', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const original = await createTestDeposit(userId, { bankName: 'BCA Original', status: 'withdrawn' });
      const successor = await createTestDeposit(userId, { bankName: 'BCA Original', rolledFromId: original });
      depositIds.push(original, successor);

      const successorDetail = await getDeposit(userId, successor);
      expect(successorDetail?.rolledFromBankName).toBe('BCA Original');

      const originalDetail = await getDeposit(userId, original);
      expect(originalDetail?.rolledFromBankName).toBeNull();
    });

    it('still resolves an already-withdrawn deposit (unlike listDeposits, which excludes it)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const wallet = await createTestWallet(userId, { balance: 0n });
      const dest = await createTestWallet(userId, { balance: 0n });
      const deposit = await createDeposit(userId, {
        bankName: 'BCA',
        principal: 10_000_000_00n,
        interestRateAnnual: '4.2500',
        startDate: '2026-01-01',
        maturityDate: '2026-04-01',
        payoutSchedule: 'at_maturity',
        aroEnabled: false,
        aroIncludeInterest: false,
        walletId: wallet,
        idempotencyKey: crypto.randomUUID(),
      });
      depositIds.push(deposit.id);
      await withdrawDeposit(userId, deposit.id, {
        walletId: dest,
        withdrawalDate: new Date('2026-04-01T00:00:00.000Z'),
        idempotencyKey: crypto.randomUUID(),
      });

      expect(await getDeposit(userId, deposit.id)).not.toBeNull();
      expect((await listDeposits(userId)).find((d) => d.id === deposit.id)).toBeUndefined();
    });
  });
});
