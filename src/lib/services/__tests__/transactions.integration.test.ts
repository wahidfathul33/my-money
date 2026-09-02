// @vitest-environment node
/**
 * Integration tests for the transactions service — real Neon database (see
 * .env, loaded via vitest.config.ts). Same pattern as
 * src/lib/services/__tests__/wallets.integration.test.ts.
 *
 * Covers tasks/07-transactions-core/spec.md's acceptance criteria that can
 * only be proven against a real DB transaction: atomic rollback,
 * idempotency, cross-user isolation, edit/void/unvoid balance correctness,
 * and — the ultimate proof — zero reconciliation drift after a whole
 * sequence of record/edit/void/unvoid.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { ledgerEntries } from '@/lib/db/schema/transactions';
import { wallets } from '@/lib/db/schema/wallets';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { findWalletBalanceDrift } from '@/lib/db/reconcile';
import {
  createTestCategory,
  createTestUser,
  createTestWallet,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { getMonthlyTotals, getTransaction } from '@/features/transactions/queries';
import {
  createTransaction,
  unvoidTransaction,
  updateTransaction,
  voidTransaction,
} from '../transactions';

describe('transactions service', () => {
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

  describe('createTransaction', () => {
    it('applies a negative delta for expense and a positive delta for income', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const expenseCategory = await createTestCategory(userId, { type: 'expense' });
      const incomeCategory = await createTestCategory(userId, { type: 'income', name: 'Gaji' });

      await createTransaction(userId, {
        type: 'expense',
        amount: 50_000_00n,
        categoryId: expenseCategory,
        walletId,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(await walletBalance(walletId)).toBe(-50_000_00n);

      await createTransaction(userId, {
        type: 'income',
        amount: 200_000_00n,
        categoryId: incomeCategory,
        walletId,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(await walletBalance(walletId)).toBe(150_000_00n);
    });

    it('stores transactions.amount as positive even for an expense', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });

      const row = await createTransaction(userId, {
        type: 'expense',
        amount: 75_000_00n,
        categoryId,
        walletId,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(row.amount).toBe(75_000_00n); // positive, never -75_000_00n
      expect(row.type).toBe('expense');
    });

    it('rejects a category whose type does not match the transaction type — and rolls back cleanly', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const incomeCategory = await createTestCategory(userId, { type: 'income', name: 'Gaji' });

      await expect(
        createTransaction(userId, {
          type: 'expense',
          amount: 50_000_00n,
          categoryId: incomeCategory,
          walletId,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      // Rollback test: zero changes left anywhere.
      expect(await walletBalance(walletId)).toBe(0n);
      expect(await liveEntryCount(userId)).toBe(0);
    });

    it("rejects a wallet that doesn't belong to the caller — cross-user isolation, zero changes", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceWallet = await createTestWallet(alice);
      const bobCategory = await createTestCategory(bob, { type: 'expense' });

      await expect(
        createTransaction(bob, {
          type: 'expense',
          amount: 50_000_00n,
          categoryId: bobCategory,
          walletId: aliceWallet, // Bob attempts to record against Alice's wallet.
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(aliceWallet)).toBe(0n);
      expect(await liveEntryCount(alice)).toBe(0);
      expect(await liveEntryCount(bob)).toBe(0);
    });

    it("rejects a category that doesn't belong to the caller — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const bobWallet = await createTestWallet(bob);
      const aliceCategory = await createTestCategory(alice, { type: 'expense' });

      await expect(
        createTransaction(bob, {
          type: 'expense',
          amount: 50_000_00n,
          categoryId: aliceCategory,
          walletId: bobWallet,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(bobWallet)).toBe(0n);
    });

    it('rejects a non-positive amount', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });

      await expect(
        createTransaction(userId, {
          type: 'expense',
          amount: 0n,
          categoryId,
          walletId,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('is idempotent: the same idempotencyKey twice returns the SAME transaction and deducts the balance once', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });
      const idempotencyKey = crypto.randomUUID();

      const first = await createTransaction(userId, {
        type: 'expense',
        amount: 45_000_00n,
        categoryId,
        walletId,
        transactionDate: new Date(),
        note: null,
        idempotencyKey,
      });
      const second = await createTransaction(userId, {
        type: 'expense',
        amount: 45_000_00n,
        categoryId,
        walletId,
        transactionDate: new Date(),
        note: null,
        idempotencyKey,
      });

      expect(second.id).toBe(first.id);
      expect(await walletBalance(walletId)).toBe(-45_000_00n); // deducted exactly once
      expect(await liveEntryCount(userId)).toBe(1);
    });
  });

  describe('updateTransaction', () => {
    it('corrects the balance to reflect the new amount, keeping full audit history', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });

      const created = await createTransaction(userId, {
        type: 'expense',
        amount: 50_000_00n,
        categoryId,
        walletId,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(await walletBalance(walletId)).toBe(-50_000_00n);

      const updated = await updateTransaction(userId, created.id, {
        type: 'expense',
        amount: 70_000_00n,
        categoryId,
        walletId,
        transactionDate: new Date(),
        note: 'koreksi',
      });

      expect(updated.amount).toBe(70_000_00n);
      expect(await walletBalance(walletId)).toBe(-70_000_00n);

      // Audit trail: the DB still holds every entry ever written for this
      // transaction (old + its reversal + the new one) — none hard-deleted.
      const allEntries = await dbWrite
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.transactionId, created.id));
      expect(allEntries).toHaveLength(3);
      // Only the fresh entry stays live; old + its reversal are voided together.
      expect(allEntries.filter((e) => e.voidedAt === null)).toHaveLength(1);
    });

    it('moving the edit to a different wallet corrects BOTH wallets balances', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletA = await createTestWallet(userId, { name: 'A' });
      const walletB = await createTestWallet(userId, { name: 'B' });
      const categoryId = await createTestCategory(userId, { type: 'expense' });

      const created = await createTransaction(userId, {
        type: 'expense',
        amount: 50_000_00n,
        categoryId,
        walletId: walletA,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(await walletBalance(walletA)).toBe(-50_000_00n);

      await updateTransaction(userId, created.id, {
        type: 'expense',
        amount: 50_000_00n,
        categoryId,
        walletId: walletB,
        transactionDate: new Date(),
        note: null,
      });

      expect(await walletBalance(walletA)).toBe(0n); // fully reversed
      expect(await walletBalance(walletB)).toBe(-50_000_00n);
    });

    it('rejects editing a category whose type no longer matches, applying no change', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const expenseCategory = await createTestCategory(userId, { type: 'expense' });
      const incomeCategory = await createTestCategory(userId, { type: 'income', name: 'Gaji' });

      const created = await createTransaction(userId, {
        type: 'expense',
        amount: 50_000_00n,
        categoryId: expenseCategory,
        walletId,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(
        updateTransaction(userId, created.id, {
          type: 'expense',
          amount: 50_000_00n,
          categoryId: incomeCategory, // wrong type for an expense edit
          walletId,
          transactionDate: new Date(),
          note: null,
        }),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(walletId)).toBe(-50_000_00n); // unchanged
    });

    it("cannot edit another user's transaction — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceWallet = await createTestWallet(alice);
      const aliceCategory = await createTestCategory(alice, { type: 'expense' });
      const created = await createTransaction(alice, {
        type: 'expense',
        amount: 50_000_00n,
        categoryId: aliceCategory,
        walletId: aliceWallet,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(
        updateTransaction(bob, created.id, {
          type: 'expense',
          amount: 999_000_00n,
          categoryId: aliceCategory,
          walletId: aliceWallet,
          transactionDate: new Date(),
          note: null,
        }),
      ).rejects.toThrow(NotFoundError);

      expect(await walletBalance(aliceWallet)).toBe(-50_000_00n);
    });
  });

  describe('voidTransaction / unvoidTransaction', () => {
    it('void restores the balance to before the transaction; unvoid restores it back', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });

      const created = await createTransaction(userId, {
        type: 'expense',
        amount: 50_000_00n,
        categoryId,
        walletId,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(await walletBalance(walletId)).toBe(-50_000_00n);

      await voidTransaction(userId, created.id);
      expect(await walletBalance(walletId)).toBe(0n);

      await unvoidTransaction(userId, created.id);
      expect(await walletBalance(walletId)).toBe(-50_000_00n);
    });

    it('a voided transaction is excluded from getMonthlyTotals', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });
      const now = new Date();

      const created = await createTransaction(userId, {
        type: 'expense',
        amount: 50_000_00n,
        categoryId,
        walletId,
        transactionDate: now,
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      const period = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
      expect((await getMonthlyTotals(userId, period)).expense).toBe(50_000_00n);

      await voidTransaction(userId, created.id);

      expect((await getMonthlyTotals(userId, period)).expense).toBe(0n);
      expect(await getTransaction(userId, created.id)).toBeNull();
    });

    it("cannot void another user's transaction — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceWallet = await createTestWallet(alice);
      const aliceCategory = await createTestCategory(alice, { type: 'expense' });
      const created = await createTransaction(alice, {
        type: 'expense',
        amount: 50_000_00n,
        categoryId: aliceCategory,
        walletId: aliceWallet,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(voidTransaction(bob, created.id)).rejects.toThrow(NotFoundError);
      expect(await walletBalance(aliceWallet)).toBe(-50_000_00n);
    });
  });

  describe('reconciliation — zero drift after a record/edit/void/unvoid sequence', () => {
    it('leaves wallets.balance exactly equal to SUM(non-void ledger_entries)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletA = await createTestWallet(userId, { name: 'A' });
      const walletB = await createTestWallet(userId, { name: 'B' });
      const expenseCategory = await createTestCategory(userId, { type: 'expense' });
      const incomeCategory = await createTestCategory(userId, { type: 'income', name: 'Gaji' });

      const t1 = await createTransaction(userId, {
        type: 'expense',
        amount: 45_000_00n,
        categoryId: expenseCategory,
        walletId: walletA,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      const t2 = await createTransaction(userId, {
        type: 'income',
        amount: 500_000_00n,
        categoryId: incomeCategory,
        walletId: walletA,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await updateTransaction(userId, t1.id, {
        type: 'expense',
        amount: 60_000_00n,
        categoryId: expenseCategory,
        walletId: walletB, // moved wallets on edit
        transactionDate: new Date(),
        note: null,
      });
      await voidTransaction(userId, t2.id);
      await unvoidTransaction(userId, t2.id);
      const t3 = await createTransaction(userId, {
        type: 'expense',
        amount: 10_000_00n,
        categoryId: expenseCategory,
        walletId: walletB,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await voidTransaction(userId, t3.id);

      const drift = await findWalletBalanceDrift();
      const ourDrift = drift.filter((d) => d.walletId === walletA || d.walletId === walletB);
      expect(ourDrift).toHaveLength(0);

      // And the numbers are exactly what they should be:
      // walletA: +500_000_00 (income) - 45_000_00 (t1's original entry, now
      //          reversed away when t1 moved to walletB) = 500_000_00
      // walletB: -60_000_00 (t1, edited) + 10_000_00 - 10_000_00 (t3 voided) = -60_000_00
      expect(await walletBalance(walletA)).toBe(500_000_00n);
      expect(await walletBalance(walletB)).toBe(-60_000_00n);
    });
  });
});
