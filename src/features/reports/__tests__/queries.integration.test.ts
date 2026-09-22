// @vitest-environment node
/**
 * Integration tests for personal report queries (src/features/reports/queries.ts)
 * — real Neon database. Covers tasks/21-reports/todo.md's "Query — Pribadi"
 * and "Test" sections: aggregation correctness, the transfer/savings/void
 * exclusions, WIB period boundaries, the savings-growth ↔ net-worth parity
 * requirement, and cross-user isolation.
 *
 * Fixture transactions are inserted directly via `dbWrite` — same rationale
 * as src/features/budgets/__tests__/queries.integration.test.ts's file
 * header (no service accepts a raw `transactionDate`/`householdId` the way
 * these tests need).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { ledgerEntries, transactions } from '@/lib/db/schema/transactions';
import { savingsContributions, savingsGoals } from '@/lib/db/schema/savings';
import {
  createTestCategory,
  createTestUser,
  createTestWallet,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { getTotalSavings } from '@/features/savings/queries';
import {
  getCashFlow,
  getEarliestTransactionDate,
  getExpenseByCategory,
  getIncomeVsExpense,
  getSavingsGrowth,
  getTopCategories,
} from '../queries';

/** Direct fixture insert — see file header. */
async function insertTransaction(params: {
  userId: string;
  type: 'income' | 'expense' | 'transfer';
  categoryId: string | null;
  amount: bigint;
  transactionDate: Date;
  voidedAt?: Date | null;
}): Promise<string> {
  const id = uuidv7();
  await dbWrite.insert(transactions).values({
    id,
    userId: params.userId,
    type: params.type,
    categoryId: params.categoryId,
    amount: params.amount,
    transactionDate: params.transactionDate,
    createdBy: params.userId,
    voidedAt: params.voidedAt ?? null,
  });
  return id;
}

async function insertSavingsContribution(params: {
  userId: string;
  walletId: string;
  amount: bigint;
  date: Date;
  voidedAt?: Date | null;
}): Promise<void> {
  const goalId = uuidv7();
  await dbWrite
    .insert(savingsGoals)
    .values({ id: goalId, userId: params.userId, name: 'Test Goal', targetAmount: 10_000_000_00n });

  const ledgerEntryId = uuidv7();
  await dbWrite.insert(ledgerEntries).values({
    id: ledgerEntryId,
    userId: params.userId,
    walletId: params.walletId,
    amount: -params.amount,
    source: 'savings_contribution',
    entryDate: params.date,
  });

  await dbWrite.insert(savingsContributions).values({
    id: uuidv7(),
    savingsGoalId: goalId,
    userId: params.userId,
    walletId: params.walletId,
    ledgerEntryId,
    amount: params.amount,
    contributionDate: params.date,
    voidedAt: params.voidedAt ?? null,
  });
}

// 2026-09-15 12:00 WIB = 05:00 UTC — comfortably mid-period.
const MID_SEPTEMBER_WIB = new Date('2026-09-15T05:00:00.000Z');
const NOW = MID_SEPTEMBER_WIB;

describe('reports queries — personal', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  describe('getIncomeVsExpense', () => {
    it('sums income/expense per month, excludes transfer and void, includes empty months at 0', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const incomeCategory = await createTestCategory(userId, { type: 'income' });
      const expenseCategory = await createTestCategory(userId, { type: 'expense' });

      await insertTransaction({ userId, type: 'income', categoryId: incomeCategory, amount: 5_000_000_00n, transactionDate: MID_SEPTEMBER_WIB });
      await insertTransaction({ userId, type: 'expense', categoryId: expenseCategory, amount: 2_000_000_00n, transactionDate: MID_SEPTEMBER_WIB });
      // Transfer — never counted.
      await insertTransaction({ userId, type: 'transfer', categoryId: null, amount: 1_000_000_00n, transactionDate: MID_SEPTEMBER_WIB });
      // Voided expense — never counted.
      await insertTransaction({
        userId,
        type: 'expense',
        categoryId: expenseCategory,
        amount: 9_000_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        voidedAt: MID_SEPTEMBER_WIB,
      });

      const result = await getIncomeVsExpense(userId, 3, NOW);
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.period)).toEqual(['2026-07', '2026-08', '2026-09']);

      const september = result.find((r) => r.period === '2026-09')!;
      expect(september.income).toBe(5_000_000_00n);
      expect(september.expense).toBe(2_000_000_00n);
      expect(september.label).toBe('Sep');

      // Quiet months are still present, at zero — not omitted.
      const july = result.find((r) => r.period === '2026-07')!;
      expect(july.income).toBe(0n);
      expect(july.expense).toBe(0n);
    });

    it('a transaction at 00:30 WIB on the 1st belongs to the NEW month, not the previous UTC calendar day', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });
      // 2026-09-01 00:30 WIB = 2026-08-31 17:30 UTC.
      const boundary = new Date('2026-08-31T17:30:00.000Z');
      await insertTransaction({ userId, type: 'expense', categoryId, amount: 100_000_00n, transactionDate: boundary });

      const result = await getIncomeVsExpense(userId, 2, new Date('2026-09-05T05:00:00.000Z'));
      const september = result.find((r) => r.period === '2026-09')!;
      const august = result.find((r) => r.period === '2026-08')!;
      expect(september.expense).toBe(100_000_00n);
      expect(august.expense).toBe(0n);
    });
  });

  describe('getExpenseByCategory', () => {
    it('sorts descending by amount', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const lowId = await createTestCategory(userId, { type: 'expense', name: 'Low' });
      const highId = await createTestCategory(userId, { type: 'expense', name: 'High' });

      await insertTransaction({ userId, type: 'expense', categoryId: lowId, amount: 100_000_00n, transactionDate: MID_SEPTEMBER_WIB });
      await insertTransaction({ userId, type: 'expense', categoryId: highId, amount: 900_000_00n, transactionDate: MID_SEPTEMBER_WIB });

      const result = await getExpenseByCategory(userId, '2026-09');
      expect(result.map((r) => r.name)).toEqual(['High', 'Low']);
    });

    it('excludes income, transfer, and voided rows', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const expenseCategory = await createTestCategory(userId, { type: 'expense' });
      const incomeCategory = await createTestCategory(userId, { type: 'income' });

      await insertTransaction({ userId, type: 'expense', categoryId: expenseCategory, amount: 100_000_00n, transactionDate: MID_SEPTEMBER_WIB });
      await insertTransaction({ userId, type: 'income', categoryId: incomeCategory, amount: 5_000_000_00n, transactionDate: MID_SEPTEMBER_WIB });
      await insertTransaction({ userId, type: 'transfer', categoryId: null, amount: 1_000_000_00n, transactionDate: MID_SEPTEMBER_WIB });
      await insertTransaction({
        userId,
        type: 'expense',
        categoryId: expenseCategory,
        amount: 9_000_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        voidedAt: MID_SEPTEMBER_WIB,
      });

      const result = await getExpenseByCategory(userId, '2026-09');
      expect(result).toHaveLength(1);
      expect(result[0]!.amount).toBe(100_000_00n);
    });
  });

  describe('getTopCategories', () => {
    it('ranks by current period and attaches the SAME category\'s previous-period amount', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });

      // August (previous period).
      await insertTransaction({
        userId,
        type: 'expense',
        categoryId,
        amount: 500_000_00n,
        transactionDate: new Date('2026-08-15T05:00:00.000Z'),
      });
      // September (current period) — doubled.
      await insertTransaction({ userId, type: 'expense', categoryId, amount: 1_000_000_00n, transactionDate: MID_SEPTEMBER_WIB });

      const result = await getTopCategories(userId, '2026-09', 3);
      expect(result).toHaveLength(1);
      expect(result[0]!.amount).toBe(1_000_000_00n);
      expect(result[0]!.previousAmount).toBe(500_000_00n);
      expect(result[0]!.changePercent).toBeCloseTo(100, 5); // doubled = +100%
    });

    it('changePercent is null when there is nothing to compare against', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });
      await insertTransaction({ userId, type: 'expense', categoryId, amount: 200_000_00n, transactionDate: MID_SEPTEMBER_WIB });

      const result = await getTopCategories(userId, '2026-09', 3);
      expect(result[0]!.changePercent).toBeNull();
    });
  });

  describe('getCashFlow', () => {
    it('produces one point per calendar day of the period, cumulative', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const incomeCategory = await createTestCategory(userId, { type: 'income' });
      const expenseCategory = await createTestCategory(userId, { type: 'expense' });

      // Sep 1: +1.000.000. Sep 3: -400.000.
      await insertTransaction({
        userId,
        type: 'income',
        categoryId: incomeCategory,
        amount: 1_000_000_00n,
        transactionDate: new Date('2026-09-01T05:00:00.000Z'),
      });
      await insertTransaction({
        userId,
        type: 'expense',
        categoryId: expenseCategory,
        amount: 400_000_00n,
        transactionDate: new Date('2026-09-03T05:00:00.000Z'),
      });

      const result = await getCashFlow(userId, '2026-09');
      expect(result).toHaveLength(30); // September has 30 days.

      const day1 = result.find((p) => p.date === '2026-09-01')!;
      expect(day1.net).toBe(1_000_000_00n);
      expect(day1.cumulative).toBe(1_000_000_00n);

      const day2 = result.find((p) => p.date === '2026-09-02')!;
      expect(day2.net).toBe(0n);
      expect(day2.cumulative).toBe(1_000_000_00n); // carries forward, no gap.

      const day3 = result.find((p) => p.date === '2026-09-03')!;
      expect(day3.net).toBe(-400_000_00n);
      expect(day3.cumulative).toBe(600_000_00n);

      const lastDay = result.at(-1)!;
      expect(lastDay.date).toBe('2026-09-30');
      expect(lastDay.cumulative).toBe(600_000_00n);
    });
  });

  describe('getSavingsGrowth — paritas dengan net worth (spec.md "Catatan")', () => {
    it('titik terakhir persis sama dengan getTotalSavings(userId)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);

      await insertSavingsContribution({ userId, walletId, amount: 500_000_00n, date: new Date('2026-07-10T05:00:00.000Z') });
      await insertSavingsContribution({ userId, walletId, amount: 300_000_00n, date: new Date('2026-08-10T05:00:00.000Z') });
      await insertSavingsContribution({ userId, walletId, amount: 200_000_00n, date: MID_SEPTEMBER_WIB });
      // Voided — must not count toward either figure.
      await insertSavingsContribution({
        userId,
        walletId,
        amount: 9_000_000_00n,
        date: MID_SEPTEMBER_WIB,
        voidedAt: MID_SEPTEMBER_WIB,
      });

      const [growth, totalSavings] = await Promise.all([getSavingsGrowth(userId, 6, NOW), getTotalSavings(userId)]);

      expect(totalSavings).toBe(1_000_000_00n); // 500k + 300k + 200k, voided excluded.
      const lastPoint = growth.at(-1)!;
      expect(lastPoint.period).toBe('2026-09');
      expect(lastPoint.cumulative).toBe(totalSavings);
    });

    it('titik-titik sebelumnya berkurang mundur sesuai kontribusi bulan tersebut', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);

      await insertSavingsContribution({ userId, walletId, amount: 500_000_00n, date: new Date('2026-07-10T05:00:00.000Z') });
      await insertSavingsContribution({ userId, walletId, amount: 300_000_00n, date: new Date('2026-08-10T05:00:00.000Z') });
      await insertSavingsContribution({ userId, walletId, amount: 200_000_00n, date: MID_SEPTEMBER_WIB });

      const growth = await getSavingsGrowth(userId, 3, NOW); // Jul, Aug, Sep
      const july = growth.find((g) => g.period === '2026-07')!;
      const august = growth.find((g) => g.period === '2026-08')!;
      const september = growth.find((g) => g.period === '2026-09')!;

      expect(july.cumulative).toBe(500_000_00n);
      expect(august.cumulative).toBe(800_000_00n);
      expect(september.cumulative).toBe(1_000_000_00n);
      expect(july.contribution).toBe(500_000_00n);
      expect(august.contribution).toBe(300_000_00n);
      expect(september.contribution).toBe(200_000_00n);
    });
  });

  describe('getEarliestTransactionDate', () => {
    it('null untuk akun baru tanpa transaksi', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      expect(await getEarliestTransactionDate(userId)).toBeNull();
    });

    it('mengembalikan tanggal transaksi tertua yang tidak void', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });
      const older = new Date('2026-01-05T05:00:00.000Z');
      const newer = MID_SEPTEMBER_WIB;
      // Older still, but voided — must be ignored.
      const evenOlderVoided = new Date('2025-01-01T05:00:00.000Z');

      await insertTransaction({ userId, type: 'expense', categoryId, amount: 100_000_00n, transactionDate: newer });
      await insertTransaction({ userId, type: 'expense', categoryId, amount: 100_000_00n, transactionDate: older });
      await insertTransaction({
        userId,
        type: 'expense',
        categoryId,
        amount: 100_000_00n,
        transactionDate: evenOlderVoided,
        voidedAt: evenOlderVoided,
      });

      const earliest = await getEarliestTransactionDate(userId);
      expect(earliest?.toISOString()).toBe(older.toISOString());
    });
  });

  describe('isolasi lintas-user', () => {
    it('transaksi user lain tidak pernah muncul di laporan pribadi', async () => {
      const userAId = await createTestUser();
      const userBId = await createTestUser();
      userIds.push(userAId, userBId);
      const categoryAId = await createTestCategory(userAId, { type: 'expense' });
      const categoryBId = await createTestCategory(userBId, { type: 'expense' });

      await insertTransaction({ userId: userAId, type: 'expense', categoryId: categoryAId, amount: 100_000_00n, transactionDate: MID_SEPTEMBER_WIB });
      await insertTransaction({ userId: userBId, type: 'expense', categoryId: categoryBId, amount: 50_000_000_00n, transactionDate: MID_SEPTEMBER_WIB });

      const [expenseA, incomeExpenseA] = await Promise.all([
        getExpenseByCategory(userAId, '2026-09'),
        getIncomeVsExpense(userAId, 1, NOW),
      ]);

      expect(expenseA).toHaveLength(1);
      expect(expenseA[0]!.amount).toBe(100_000_00n);
      expect(incomeExpenseA[0]!.expense).toBe(100_000_00n);
    });
  });
});
