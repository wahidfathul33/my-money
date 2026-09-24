// @vitest-environment node
/**
 * Service-level integration tests for src/lib/services/recurring-transactions.ts —
 * tasks/24-recurring-transactions. Mirrors the structure of
 * src/lib/services/__tests__/budgets.integration.test.ts (its own
 * `materializeRecurringBudgets` tests are the direct template for the
 * materialization assertions here).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { recurringTransactions } from '@/lib/db/schema/recurring';
import { transactions } from '@/lib/db/schema/transactions';
import { wallets } from '@/lib/db/schema/wallets';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  createRecurringTransaction,
  deleteRecurringTransaction,
  materializeRecurringTransactions,
  pauseRecurringTransaction,
  resumeRecurringTransaction,
} from '@/lib/services/recurring-transactions';
import {
  createTestCategory,
  createTestHousehold,
  createTestHouseholdMember,
  createTestRecurringTransaction,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';

const AMOUNT = 100_000_00n; // Rp100.000

async function walletBalance(walletId: string): Promise<bigint> {
  const [row] = await dbWrite.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.id, walletId));
  return row!.balance;
}

async function todayLocalDate(): Promise<string> {
  // Same default timezone `createTestUser` leaves in place (users.timezone
  // column default) — src/lib/date/timezone.ts's DEFAULT_TIMEZONE.
  const { toLocalDate } = await import('@/lib/date/timezone');
  return toLocalDate(new Date());
}

describe('recurring-transactions service', () => {
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

  describe('createRecurringTransaction', () => {
    it('creates a future-dated rule with next_run_date = start_date, no synchronous materialization', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });

      const row = await createRecurringTransaction(userId, {
        type: 'expense',
        amount: AMOUNT,
        categoryId,
        walletId,
        note: null,
        frequency: 'monthly',
        startDate: '2099-01-01', // safely in the future for any test run date
        endDate: null,
      });

      expect(row.status).toBe('active');
      expect(row.nextRunDate).toBe('2099-01-01');
      expect(await walletBalance(walletId)).toBe(0n); // untouched — nothing materialized yet
    });

    it('materializes the first occurrence synchronously when start_date is today', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'income' });
      const today = await todayLocalDate();

      const row = await createRecurringTransaction(userId, {
        type: 'income',
        amount: AMOUNT,
        categoryId,
        walletId,
        note: 'Gaji',
        frequency: 'monthly',
        startDate: today,
        endDate: null,
      });

      // Wallet balance moved immediately — this is the whole point of the
      // synchronous path (spec.md: "gaji hari ini" shouldn't wait for
      // tomorrow's cron).
      expect(await walletBalance(walletId)).toBe(AMOUNT);
      // next_run_date already advanced past today.
      expect(row.nextRunDate > today).toBe(true);

      const [tx] = await dbWrite.select().from(transactions).where(eq(transactions.userId, userId));
      expect(tx).toBeDefined();
      expect(tx!.amount).toBe(AMOUNT);
      expect(tx!.note).toBe('Gaji');
    });

    it('rejects a wallet owned by someone else', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const otherId = await createTestUser();
      userIds.push(otherId);
      const walletId = await createTestWallet(ownerId);
      const categoryId = await createTestCategory(otherId, { type: 'expense' });

      await expect(
        createRecurringTransaction(otherId, {
          type: 'expense',
          amount: AMOUNT,
          categoryId,
          walletId,
          note: null,
          frequency: 'daily',
          startDate: '2099-01-01',
          endDate: null,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects a category whose type does not match', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'income' });

      await expect(
        createRecurringTransaction(userId, {
          type: 'expense',
          amount: AMOUNT,
          categoryId,
          walletId,
          note: null,
          frequency: 'daily',
          startDate: '2099-01-01',
          endDate: null,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects end_date before start_date', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });

      await expect(
        createRecurringTransaction(userId, {
          type: 'expense',
          amount: AMOUNT,
          categoryId,
          walletId,
          note: null,
          frequency: 'daily',
          startDate: '2099-01-10',
          endDate: '2099-01-01',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects a non-positive amount', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });

      await expect(
        createRecurringTransaction(userId, {
          type: 'expense',
          amount: 0n,
          categoryId,
          walletId,
          note: null,
          frequency: 'daily',
          startDate: '2099-01-01',
          endDate: null,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('tags the materialized transaction to a household the user is an active member of', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const memberId = await createTestUser();
      userIds.push(memberId);
      const householdId = await createTestHousehold(ownerId);
      householdIds.push(householdId);
      await createTestHouseholdMember(householdId, memberId);

      const walletId = await createTestWallet(memberId);
      const categoryId = await createTestCategory(memberId, { type: 'expense' });
      const today = await todayLocalDate();

      await createRecurringTransaction(memberId, {
        type: 'expense',
        amount: AMOUNT,
        categoryId,
        walletId,
        note: null,
        frequency: 'monthly',
        startDate: today,
        endDate: null,
        householdId,
      });

      const [tx] = await dbWrite.select().from(transactions).where(eq(transactions.userId, memberId));
      expect(tx!.householdId).toBe(householdId);
    });
  });

  describe('pause / resume / delete', () => {
    it('pauses and resumes, preserving next_run_date across the pause (never resets to today)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const ruleId = await createTestRecurringTransaction(userId, { nextRunDate: '2099-06-15' });

      const paused = await pauseRecurringTransaction(userId, ruleId);
      expect(paused.status).toBe('paused');
      expect(paused.nextRunDate).toBe('2099-06-15');

      const resumed = await resumeRecurringTransaction(userId, ruleId);
      expect(resumed.status).toBe('active');
      expect(resumed.nextRunDate).toBe('2099-06-15'); // unchanged — not reset to "today"
    });

    it('rejects pausing a rule owned by someone else (NotFoundError, not ForbiddenError)', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const otherId = await createTestUser();
      userIds.push(otherId);
      const ruleId = await createTestRecurringTransaction(ownerId);

      await expect(pauseRecurringTransaction(otherId, ruleId)).rejects.toThrow(NotFoundError);
    });

    it('rejects resuming a rule that is not paused', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const ruleId = await createTestRecurringTransaction(userId, { status: 'active' });

      await expect(resumeRecurringTransaction(userId, ruleId)).rejects.toThrow(ValidationError);
    });

    it('deletes a rule', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const ruleId = await createTestRecurringTransaction(userId);

      await deleteRecurringTransaction(userId, ruleId);

      const [row] = await dbWrite.select().from(recurringTransactions).where(eq(recurringTransactions.id, ruleId));
      expect(row).toBeUndefined();
    });

    it('rejects deleting a rule owned by someone else', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const otherId = await createTestUser();
      userIds.push(otherId);
      const ruleId = await createTestRecurringTransaction(ownerId);

      await expect(deleteRecurringTransaction(otherId, ruleId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('materializeRecurringTransactions', () => {
    it('materializes a due row, moves the wallet balance, and advances next_run_date per frequency', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });
      const ruleId = await createTestRecurringTransaction(userId, {
        walletId,
        categoryId,
        type: 'expense',
        amount: AMOUNT,
        frequency: 'monthly',
        startDate: '2026-01-31',
        nextRunDate: '2026-01-31',
      });

      const result = await materializeRecurringTransactions(new Date('2026-02-01T12:00:00Z'));
      expect(result.succeeded).toBeGreaterThanOrEqual(1);

      expect(await walletBalance(walletId)).toBe(-AMOUNT);

      const [rule] = await dbWrite.select().from(recurringTransactions).where(eq(recurringTransactions.id, ruleId));
      // Monthly clamp: 31 Jan -> 28/29 Feb (never March, never an error) —
      // this IS the acceptance criterion the property test also covers, now
      // exercised through the full materialization path end to end.
      expect(rule!.nextRunDate.startsWith('2026-02-')).toBe(true);
      expect(rule!.nextRunDate).not.toBe('2026-03-01');
    });

    it('is idempotent: calling twice for the same due date never creates a duplicate transaction', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'income' });
      await createTestRecurringTransaction(userId, {
        walletId,
        categoryId,
        type: 'income',
        amount: AMOUNT,
        frequency: 'daily',
        startDate: '2026-01-01',
        nextRunDate: '2026-01-01',
      });

      const now = new Date('2026-01-01T12:00:00Z');
      const first = await materializeRecurringTransactions(now);
      const second = await materializeRecurringTransactions(now);

      expect(first.succeeded).toBeGreaterThanOrEqual(1);
      // Second run: the row's next_run_date already advanced past "today"
      // for `now`, so nothing is due anymore — 0 new successes from THIS rule.
      expect(await walletBalance(walletId)).toBe(AMOUNT); // moved exactly ONCE

      const postedCount = await dbWrite.select().from(transactions).where(eq(transactions.userId, userId));
      expect(postedCount).toHaveLength(1);
      void second;
    });

    it('a failing row (category deleted out from under it) does not affect other due rows, and its next_run_date is not advanced', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const goodWalletId = await createTestWallet(userId);
      const goodCategoryId = await createTestCategory(userId, { name: 'Kategori Baik', type: 'expense' });
      await createTestRecurringTransaction(userId, {
        walletId: goodWalletId,
        categoryId: goodCategoryId,
        type: 'expense',
        amount: AMOUNT,
        frequency: 'daily',
        startDate: '2026-03-01',
        nextRunDate: '2026-03-01',
      });

      // A wallet owned by someone else — `createTransaction`'s own
      // `assertWalletOwned` only rejects on OWNERSHIP (not archived state,
      // per transactions.ts), so this is the deterministic way to force a
      // guaranteed failure for this row specifically.
      const strangerId = await createTestUser();
      userIds.push(strangerId);
      const badWalletId = await createTestWallet(strangerId);
      const badCategoryId = await createTestCategory(userId, { name: 'Kategori Buruk', type: 'expense' });
      const badRuleId = await createTestRecurringTransaction(userId, {
        walletId: badWalletId,
        categoryId: badCategoryId,
        type: 'expense',
        amount: AMOUNT,
        frequency: 'daily',
        startDate: '2026-03-01',
        nextRunDate: '2026-03-01',
      });

      const result = await materializeRecurringTransactions(new Date('2026-03-01T12:00:00Z'));
      expect(result.succeeded).toBeGreaterThanOrEqual(1);
      expect(result.failed).toBeGreaterThanOrEqual(1);

      // The good row succeeded.
      expect(await walletBalance(goodWalletId)).toBe(-AMOUNT);

      // The bad row's next_run_date is untouched — retried next run, not skipped forever.
      const [badRule] = await dbWrite
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.id, badRuleId));
      expect(badRule!.nextRunDate).toBe('2026-03-01');
      expect(badRule!.status).toBe('active');
    });

    it('a paused rule is never materialized', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });
      const ruleId = await createTestRecurringTransaction(userId, {
        walletId,
        categoryId,
        status: 'paused',
        frequency: 'daily',
        startDate: '2026-04-01',
        nextRunDate: '2026-04-01',
      });

      await materializeRecurringTransactions(new Date('2026-04-05T12:00:00Z'));

      expect(await walletBalance(walletId)).toBe(0n);
      const [rule] = await dbWrite.select().from(recurringTransactions).where(eq(recurringTransactions.id, ruleId));
      expect(rule!.nextRunDate).toBe('2026-04-01'); // untouched
    });

    it('transitions to `ended` once the next computed run date would pass end_date', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });
      const ruleId = await createTestRecurringTransaction(userId, {
        walletId,
        categoryId,
        frequency: 'monthly',
        startDate: '2026-05-01',
        nextRunDate: '2026-05-01',
        endDate: '2026-05-15', // next monthly occurrence (2026-06-01) is past this
      });

      await materializeRecurringTransactions(new Date('2026-05-01T12:00:00Z'));

      const [rule] = await dbWrite.select().from(recurringTransactions).where(eq(recurringTransactions.id, ruleId));
      expect(rule!.status).toBe('ended');
    });
  });
});
