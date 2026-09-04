// @vitest-environment node
/**
 * Integration tests for the transfers service — real Neon database (see
 * .env, loaded via vitest.config.ts). Same pattern as
 * src/lib/services/__tests__/transactions.integration.test.ts.
 *
 * Covers tasks/08-transfers-self/spec.md's and todo.md's acceptance
 * criteria that can only be proven against a real DB transaction: atomic
 * rollback, idempotency, cross-user isolation, void correctness, the
 * `tx_category_rule`/`ledger_amount_nonzero` CHECKs, and — the ultimate
 * proof — net worth held exactly constant across an arbitrary sequence of
 * transfers (property test).
 */
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { and, eq, isNull } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { ledgerEntries, transactions } from '@/lib/db/schema/transactions';
import { wallets } from '@/lib/db/schema/wallets';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { findWalletBalanceDrift } from '@/lib/db/reconcile';
import {
  createTestCategory,
  createTestUser,
  createTestWallet,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { getMonthlyTotals } from '@/features/transactions/queries';
import { createTransaction } from '../transactions';
import { archiveWallet } from '../wallets';
import { createSelfTransfer, unvoidTransfer, voidTransfer } from '../transfers';

describe('transfers service', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  async function walletBalance(walletId: string): Promise<bigint> {
    const [row] = await dbWrite.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.id, walletId));
    return row?.balance ?? 0n;
  }

  async function liveEntryCount(userId: string): Promise<number> {
    const rows = await dbWrite
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.userId, userId), isNull(ledgerEntries.voidedAt)));
    return rows.length;
  }

  describe('createSelfTransfer', () => {
    it('moves the balance out of the source wallet and into the destination by the same amount', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });

      await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 500_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(await walletBalance(bca)).toBe(-500_000_00n);
      expect(await walletBalance(gopay)).toBe(500_000_00n);
    });

    it('writes exactly one transactions row (type=transfer, category_id NULL, counterparty_user_id NULL) and two ledger_entries summing to zero', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });

      const row = await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 500_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(row.type).toBe('transfer');
      expect(row.categoryId).toBeNull();
      expect(row.counterpartyUserId).toBeNull();
      expect(row.amount).toBe(500_000_00n); // positive — sign lives on the ledger

      const txRows = await dbWrite.select().from(transactions).where(eq(transactions.id, row.id));
      expect(txRows).toHaveLength(1);

      const entries = await dbWrite.select().from(ledgerEntries).where(eq(ledgerEntries.transactionId, row.id));
      expect(entries).toHaveLength(2);
      const sum = entries.reduce((acc, e) => acc + e.amount, 0n);
      expect(sum).toBe(0n); // invariant I2
      expect(entries.every((e) => e.amount !== 0n)).toBe(true);
    });

    it('rejects an amount that is not positive', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });

      await expect(
        createSelfTransfer(userId, {
          fromWalletId: bca,
          toWalletId: gopay,
          amount: 0n,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects fromWalletId === toWalletId, applying no change', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });

      await expect(
        createSelfTransfer(userId, {
          fromWalletId: bca,
          toWalletId: bca,
          amount: 50_000_00n,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(bca)).toBe(0n);
      expect(await liveEntryCount(userId)).toBe(0);
    });

    it('rejects an archived destination wallet — and rolls back cleanly (zero change to the source)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });
      await archiveWallet(userId, gopay);

      await expect(
        createSelfTransfer(userId, {
          fromWalletId: bca,
          toWalletId: gopay,
          amount: 50_000_00n,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      // Rollback test: the source wallet's balance is untouched, and no
      // ledger entry from the aborted attempt was left behind.
      expect(await walletBalance(bca)).toBe(0n);
      expect(await liveEntryCount(userId)).toBe(0);
    });

    it('rejects an archived source wallet', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });
      await archiveWallet(userId, bca);

      await expect(
        createSelfTransfer(userId, {
          fromWalletId: bca,
          toWalletId: gopay,
          amount: 50_000_00n,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects a destination wallet that doesn't belong to the caller — cross-user isolation, zero changes", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceWallet = await createTestWallet(alice, { name: 'Alice BCA' });
      const bobWallet = await createTestWallet(bob, { name: 'Bob Tunai' });

      await expect(
        createSelfTransfer(bob, {
          fromWalletId: bobWallet,
          toWalletId: aliceWallet, // Bob attempts to transfer INTO Alice's wallet.
          amount: 50_000_00n,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(bobWallet)).toBe(0n);
      expect(await walletBalance(aliceWallet)).toBe(0n);
      expect(await liveEntryCount(alice)).toBe(0);
      expect(await liveEntryCount(bob)).toBe(0);
    });

    it("rejects a source wallet that doesn't belong to the caller — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceWallet = await createTestWallet(alice, { name: 'Alice BCA' });
      const bobWallet = await createTestWallet(bob, { name: 'Bob Tunai' });

      await expect(
        createSelfTransfer(bob, {
          fromWalletId: aliceWallet, // Bob attempts to transfer FROM Alice's wallet.
          toWalletId: bobWallet,
          amount: 50_000_00n,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(aliceWallet)).toBe(0n);
    });

    it('is idempotent: the same idempotencyKey twice returns the SAME transfer and moves the balance once', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });
      const idempotencyKey = crypto.randomUUID();

      const first = await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 45_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey,
      });
      const second = await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 45_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey,
      });

      expect(second.id).toBe(first.id);
      expect(await walletBalance(bca)).toBe(-45_000_00n); // moved exactly once
      expect(await walletBalance(gopay)).toBe(45_000_00n);
      expect(await liveEntryCount(userId)).toBe(2); // one pair, not two
    });

    it('never appears in getMonthlyTotals income or expense — docs/03 §9.4', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });
      const category = await createTestCategory(userId, { type: 'expense' });
      const now = new Date();

      await createTransaction(userId, {
        type: 'expense',
        amount: 20_000_00n,
        categoryId: category,
        walletId: bca,
        transactionDate: now,
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 9_999_999_00n, // deliberately huge — would blow up totals if miscounted
        transactionDate: now,
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      const period = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
      const totals = await getMonthlyTotals(userId, period);
      expect(totals.expense).toBe(20_000_00n); // only the real expense — the transfer is invisible here
      expect(totals.income).toBe(0n);
    });
  });

  describe('the DB CHECK itself (tx_category_rule / ledger_amount_nonzero)', () => {
    it('rejects a raw INSERT of a transfer transaction with a non-null category_id, independent of application code', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const category = await createTestCategory(userId, { type: 'expense' });

      await expect(
        dbWrite.insert(transactions).values({
          id: crypto.randomUUID(),
          userId,
          type: 'transfer',
          categoryId: category, // invalid for a transfer — tx_category_rule
          amount: 10_000_00n,
          transactionDate: new Date(),
          createdBy: userId,
        }),
      ).rejects.toThrow();
    });

    it('rejects a raw INSERT of a zero-amount ledger entry, independent of application code', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);

      await expect(
        dbWrite.insert(ledgerEntries).values({
          id: crypto.randomUUID(),
          userId,
          walletId,
          amount: 0n, // ledger_amount_nonzero
          source: 'transaction',
          entryDate: new Date(),
        }),
      ).rejects.toThrow();
    });
  });

  describe('voidTransfer / unvoidTransfer', () => {
    it('void restores BOTH wallets to before the transfer, atomically; unvoid restores it back', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });

      const transfer = await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 500_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(await walletBalance(bca)).toBe(-500_000_00n);
      expect(await walletBalance(gopay)).toBe(500_000_00n);

      await voidTransfer(userId, transfer.id);
      expect(await walletBalance(bca)).toBe(0n);
      expect(await walletBalance(gopay)).toBe(0n);

      await unvoidTransfer(userId, transfer.id);
      expect(await walletBalance(bca)).toBe(-500_000_00n);
      expect(await walletBalance(gopay)).toBe(500_000_00n);
    });

    it("cannot void another user's transfer — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const bca = await createTestWallet(alice, { name: 'BCA' });
      const gopay = await createTestWallet(alice, { name: 'GoPay' });
      const transfer = await createSelfTransfer(alice, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 500_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(voidTransfer(bob, transfer.id)).rejects.toThrow(NotFoundError);
      expect(await walletBalance(bca)).toBe(-500_000_00n);
      expect(await walletBalance(gopay)).toBe(500_000_00n);
    });
  });

  describe('reconciliation — wallets.balance always equals SUM(ledger_entries.amount)', () => {
    it('shows zero drift after a sequence of transfer/void/unvoid operations', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });
      const cash = await createTestWallet(userId, { name: 'Tunai' });

      const t1 = await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 300_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await createSelfTransfer(userId, {
        fromWalletId: gopay,
        toWalletId: cash,
        amount: 100_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await voidTransfer(userId, t1.id);
      await unvoidTransfer(userId, t1.id);

      const drift = await findWalletBalanceDrift();
      const ourDrift = drift.filter((d) => d.walletId === bca || d.walletId === gopay || d.walletId === cash);
      expect(ourDrift).toHaveLength(0);

      expect(await walletBalance(bca)).toBe(-300_000_00n);
      expect(await walletBalance(gopay)).toBe(200_000_00n);
      expect(await walletBalance(cash)).toBe(100_000_00n);
    });
  });

  describe('property: net worth is unchanged by any sequence of self-transfers', () => {
    // Up to 5 property runs x 5 moves each = up to 25 real dbWrite.transaction
    // round trips to Neon — comfortably exceeds the global 30s testTimeout
    // (vitest.config.ts) under real network conditions, not a hang.
    it('holds for a random sequence of transfers between 3 wallets', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const openingBalance = 10_000_000_00n;
      const walletIds = [
        await createTestWallet(userId, { name: 'W1', balance: openingBalance }),
        await createTestWallet(userId, { name: 'W2', balance: 0n }),
        await createTestWallet(userId, { name: 'W3', balance: 0n }),
      ];

      async function netWorth(): Promise<bigint> {
        const rows = await dbWrite
          .select({ balance: wallets.balance })
          .from(wallets)
          .where(eq(wallets.userId, userId));
        return rows.reduce((acc, r) => acc + r.balance, 0n);
      }

      const before = await netWorth();
      expect(before).toBe(openingBalance);

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              fromIndex: fc.integer({ min: 0, max: 2 }),
              toOffset: fc.integer({ min: 1, max: 2 }),
              amount: fc.bigInt({ min: 1n, max: 1_000_00n }),
            }),
            { minLength: 1, maxLength: 5 },
          ),
          async (moves) => {
            for (const move of moves) {
              const fromWalletId = walletIds[move.fromIndex]!;
              const toWalletId = walletIds[(move.fromIndex + move.toOffset) % 3]!;
              await createSelfTransfer(userId, {
                fromWalletId,
                toWalletId,
                amount: move.amount,
                transactionDate: new Date(),
                note: null,
                idempotencyKey: crypto.randomUUID(),
              });
            }
            expect(await netWorth()).toBe(before);
          },
        ),
        { numRuns: 5 }, // real DB round trips per move — kept small deliberately
      );

      expect(await netWorth()).toBe(before);
    }, 90_000);
  });
});
