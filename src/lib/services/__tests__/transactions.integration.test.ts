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
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { ledgerEntries, transactions } from '@/lib/db/schema/transactions';
import { wallets } from '@/lib/db/schema/wallets';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { findWalletBalanceDrift } from '@/lib/db/reconcile';
import {
  createTestCategory,
  createTestHousehold,
  createTestHouseholdMember,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { getMonthlyTotals, getTransaction } from '@/features/transactions/queries';
import {
  bulkTagTransactions,
  createTransaction,
  setTransactionHousehold,
  unvoidTransaction,
  updateTransaction,
  voidTransaction,
} from '../transactions';

describe('transactions service', () => {
  const userIds: string[] = [];
  const householdIds: string[] = [];

  afterEach(async () => {
    for (const id of householdIds.splice(0)) {
      await deleteTestHousehold(id);
    }
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

  describe('household tagging — tasks/12-sharing-and-privacy', () => {
    async function taggedHouseholdId(transactionId: string): Promise<string | null> {
      const [row] = await dbWrite
        .select({ householdId: transactions.householdId })
        .from(transactions)
        .where(eq(transactions.id, transactionId));
      return row?.householdId ?? null;
    }

    describe('createTransaction', () => {
      it('tags the new transaction when the caller is an active member of the given household', async () => {
        const owner = await createTestUser();
        userIds.push(owner);
        const household = await createTestHousehold(owner);
        householdIds.push(household);
        await createTestHouseholdMember(household, owner, { role: 'owner' });
        const walletId = await createTestWallet(owner);
        const categoryId = await createTestCategory(owner, { type: 'expense' });

        const row = await createTransaction(owner, {
          type: 'expense',
          amount: 20_000_00n,
          categoryId,
          walletId,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
          householdId: household,
        });

        expect(row.householdId).toBe(household);
      });

      it("rejects tagging to a household the caller is NOT an active member of — 'household yang bukan miliknya ditolak', and rolls back the whole write", async () => {
        const owner = await createTestUser();
        const stranger = await createTestUser();
        userIds.push(owner, stranger);
        const household = await createTestHousehold(owner);
        householdIds.push(household);
        const walletId = await createTestWallet(stranger);
        const categoryId = await createTestCategory(stranger, { type: 'expense' });

        await expect(
          createTransaction(stranger, {
            type: 'expense',
            amount: 20_000_00n,
            categoryId,
            walletId,
            transactionDate: new Date(),
            note: null,
            idempotencyKey: crypto.randomUUID(),
            householdId: household,
          }),
        ).rejects.toThrow(NotFoundError);

        // Rollback proof: neither the transaction row nor the wallet balance exist.
        expect(await walletBalance(walletId)).toBe(0n);
        expect(await liveEntryCount(stranger)).toBe(0);
      });

      it('defaults to untagged (household_id NULL) when householdId is omitted', async () => {
        const userId = await createTestUser();
        userIds.push(userId);
        const walletId = await createTestWallet(userId);
        const categoryId = await createTestCategory(userId, { type: 'expense' });

        const row = await createTransaction(userId, {
          type: 'expense',
          amount: 20_000_00n,
          categoryId,
          walletId,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        });

        expect(row.householdId).toBeNull();
      });
    });

    describe('updateTransaction', () => {
      it('re-tags to a different household the caller actively belongs to', async () => {
        const owner = await createTestUser();
        userIds.push(owner);
        const household = await createTestHousehold(owner);
        householdIds.push(household);
        await createTestHouseholdMember(household, owner, { role: 'owner' });
        const walletId = await createTestWallet(owner);
        const categoryId = await createTestCategory(owner, { type: 'expense' });

        const created = await createTransaction(owner, {
          type: 'expense',
          amount: 20_000_00n,
          categoryId,
          walletId,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        });
        expect(await taggedHouseholdId(created.id)).toBeNull();

        await updateTransaction(owner, created.id, {
          type: 'expense',
          amount: 20_000_00n,
          categoryId,
          walletId,
          transactionDate: new Date(),
          note: null,
          householdId: household,
        });
        expect(await taggedHouseholdId(created.id)).toBe(household);
      });

      it('rejects re-tagging to a household the caller is not an active member of, leaving the existing tag untouched', async () => {
        const owner = await createTestUser();
        const outsiderHouseholdOwner = await createTestUser();
        userIds.push(owner, outsiderHouseholdOwner);
        const ownHousehold = await createTestHousehold(owner);
        const outsiderHousehold = await createTestHousehold(outsiderHouseholdOwner);
        householdIds.push(ownHousehold, outsiderHousehold);
        await createTestHouseholdMember(ownHousehold, owner, { role: 'owner' });
        const walletId = await createTestWallet(owner);
        const categoryId = await createTestCategory(owner, { type: 'expense' });

        const created = await createTransaction(owner, {
          type: 'expense',
          amount: 20_000_00n,
          categoryId,
          walletId,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
          householdId: ownHousehold,
        });

        await expect(
          updateTransaction(owner, created.id, {
            type: 'expense',
            amount: 20_000_00n,
            categoryId,
            walletId,
            transactionDate: new Date(),
            note: null,
            householdId: outsiderHousehold,
          }),
        ).rejects.toThrow(NotFoundError);

        expect(await taggedHouseholdId(created.id)).toBe(ownHousehold); // untouched
      });

      it('omitting householdId leaves the existing tag untouched; passing null clears it', async () => {
        const owner = await createTestUser();
        userIds.push(owner);
        const household = await createTestHousehold(owner);
        householdIds.push(household);
        await createTestHouseholdMember(household, owner, { role: 'owner' });
        const walletId = await createTestWallet(owner);
        const categoryId = await createTestCategory(owner, { type: 'expense' });

        const created = await createTransaction(owner, {
          type: 'expense',
          amount: 20_000_00n,
          categoryId,
          walletId,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
          householdId: household,
        });

        // Full field replace WITHOUT householdId — the key itself is absent.
        await updateTransaction(owner, created.id, {
          type: 'expense',
          amount: 25_000_00n,
          categoryId,
          walletId,
          transactionDate: new Date(),
          note: 'masih tertandai',
        });
        expect(await taggedHouseholdId(created.id)).toBe(household); // unchanged

        await updateTransaction(owner, created.id, {
          type: 'expense',
          amount: 25_000_00n,
          categoryId,
          walletId,
          transactionDate: new Date(),
          note: 'lepas tag',
          householdId: null,
        });
        expect(await taggedHouseholdId(created.id)).toBeNull();
      });
    });

    describe('setTransactionHousehold', () => {
      it('tags and untags a transaction independently of its other fields', async () => {
        const owner = await createTestUser();
        userIds.push(owner);
        const household = await createTestHousehold(owner);
        householdIds.push(household);
        await createTestHouseholdMember(household, owner, { role: 'owner' });
        const walletId = await createTestWallet(owner);
        const categoryId = await createTestCategory(owner, { type: 'expense' });
        const created = await createTransaction(owner, {
          type: 'expense',
          amount: 20_000_00n,
          categoryId,
          walletId,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        });

        await setTransactionHousehold(owner, created.id, household);
        expect(await taggedHouseholdId(created.id)).toBe(household);

        await setTransactionHousehold(owner, created.id, null);
        expect(await taggedHouseholdId(created.id)).toBeNull();
      });

      it("rejects tagging to a household the caller isn't an active member of", async () => {
        const owner = await createTestUser();
        const outsiderOwner = await createTestUser();
        userIds.push(owner, outsiderOwner);
        const outsiderHousehold = await createTestHousehold(outsiderOwner);
        householdIds.push(outsiderHousehold);
        const walletId = await createTestWallet(owner);
        const categoryId = await createTestCategory(owner, { type: 'expense' });
        const created = await createTransaction(owner, {
          type: 'expense',
          amount: 20_000_00n,
          categoryId,
          walletId,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        });

        await expect(setTransactionHousehold(owner, created.id, outsiderHousehold)).rejects.toThrow(
          NotFoundError,
        );
        expect(await taggedHouseholdId(created.id)).toBeNull();
      });

      it("cannot tag another user's transaction — cross-user isolation", async () => {
        const owner = await createTestUser();
        const attacker = await createTestUser();
        userIds.push(owner, attacker);
        const household = await createTestHousehold(attacker);
        householdIds.push(household);
        await createTestHouseholdMember(household, attacker, { role: 'owner' });
        const walletId = await createTestWallet(owner);
        const categoryId = await createTestCategory(owner, { type: 'expense' });
        const created = await createTransaction(owner, {
          type: 'expense',
          amount: 20_000_00n,
          categoryId,
          walletId,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        });

        await expect(setTransactionHousehold(attacker, created.id, household)).rejects.toThrow(
          NotFoundError,
        );
        expect(await taggedHouseholdId(created.id)).toBeNull();
      });
    });

    describe('bulkTagTransactions', () => {
      async function makeExpense(userId: string, walletId: string, categoryId: string) {
        const row = await createTransaction(userId, {
          type: 'expense',
          amount: 15_000_00n,
          categoryId,
          walletId,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        });
        return row.id;
      }

      it('tags every one of the caller\'s own listed transactions and reports the exact count', async () => {
        const owner = await createTestUser();
        userIds.push(owner);
        const household = await createTestHousehold(owner);
        householdIds.push(household);
        await createTestHouseholdMember(household, owner, { role: 'owner' });
        const walletId = await createTestWallet(owner);
        const categoryId = await createTestCategory(owner, { type: 'expense' });
        const ids = await Promise.all([
          makeExpense(owner, walletId, categoryId),
          makeExpense(owner, walletId, categoryId),
          makeExpense(owner, walletId, categoryId),
        ]);

        const result = await bulkTagTransactions(owner, ids, household);

        expect(result.taggedCount).toBe(3);
        for (const id of ids) {
          expect(await taggedHouseholdId(id)).toBe(household);
        }
      });

      it("silently skips ids that don't belong to the caller — cross-user isolation, not an error", async () => {
        const owner = await createTestUser();
        const other = await createTestUser();
        userIds.push(owner, other);
        const household = await createTestHousehold(owner);
        householdIds.push(household);
        await createTestHouseholdMember(household, owner, { role: 'owner' });
        const ownWalletId = await createTestWallet(owner);
        const ownCategoryId = await createTestCategory(owner, { type: 'expense' });
        const otherWalletId = await createTestWallet(other);
        const otherCategoryId = await createTestCategory(other, { type: 'expense' });

        const mine = await makeExpense(owner, ownWalletId, ownCategoryId);
        const notMine = await makeExpense(other, otherWalletId, otherCategoryId);

        const result = await bulkTagTransactions(owner, [mine, notMine], household);

        expect(result.taggedCount).toBe(1);
        expect(await taggedHouseholdId(mine)).toBe(household);
        expect(await taggedHouseholdId(notMine)).toBeNull(); // untouched
      });

      it("rejects the WHOLE call when the caller isn't an active member of the target household — nothing partially applied", async () => {
        const owner = await createTestUser();
        const outsiderOwner = await createTestUser();
        userIds.push(owner, outsiderOwner);
        const outsiderHousehold = await createTestHousehold(outsiderOwner);
        householdIds.push(outsiderHousehold);
        const walletId = await createTestWallet(owner);
        const categoryId = await createTestCategory(owner, { type: 'expense' });
        const id = await makeExpense(owner, walletId, categoryId);

        await expect(bulkTagTransactions(owner, [id], outsiderHousehold)).rejects.toThrow(NotFoundError);
        expect(await taggedHouseholdId(id)).toBeNull();
      });

      it('rejects more than the per-call cap outright, before touching the database', async () => {
        const owner = await createTestUser();
        userIds.push(owner);
        const household = await createTestHousehold(owner);
        householdIds.push(household);
        await createTestHouseholdMember(household, owner, { role: 'owner' });
        const tooMany = Array.from({ length: 201 }, () => uuidv7());

        await expect(bulkTagTransactions(owner, tooMany, household)).rejects.toThrow(ValidationError);
      });

      it('returns taggedCount 0 for an empty id list without touching membership at all', async () => {
        const soloUser = await createTestUser();
        userIds.push(soloUser);

        const result = await bulkTagTransactions(soloUser, [], 'not-a-real-household-id-but-never-checked');
        expect(result.taggedCount).toBe(0);
      });
    });
  });
});
