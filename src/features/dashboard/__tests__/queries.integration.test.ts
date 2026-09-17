// @vitest-environment node
/**
 * Integration tests for src/features/dashboard/queries.ts — real Neon
 * database. Covers todo.md's explicit integration-test items: "getDashboardData
 * mengembalikan angka yang benar", "Kas mengecualikan kartu kredit", and
 * "delta memakai snapshot bulan sebelumnya".
 *
 * Transaction fixtures are inserted directly via `dbWrite` (not through
 * `src/lib/services/transactions.ts`) — same rationale as
 * src/features/budgets/__tests__/queries.integration.test.ts's own file
 * header: sufficient for every read this module does (monthly totals,
 * recent-transaction listing), and lets each test set an exact
 * `transactionDate` without fighting "too far in the future" validation.
 * Wallet balances are set directly via `createTestWallet`'s `balance`
 * override, since `getDashboardData`'s cash figure reads that column
 * straight off `wallets`, not derived from ledger entries.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { netWorthSnapshots, transactions } from '@/lib/db/schema';
import {
  createTestCategory,
  createTestUser,
  createTestWallet,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { getDashboardData } from '../queries';

const TZ = 'Asia/Jakarta';
const NOW = new Date('2026-09-16T04:00:00Z'); // 2026-09-16 11:00 WIB

async function insertTransaction(params: {
  userId: string;
  type: 'income' | 'expense';
  categoryId: string;
  amount: bigint;
  transactionDate: Date;
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
  });
  return id;
}

describe('features/dashboard/queries — integration', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  it('a brand-new user with no wallet has hasAnyWallet=false and every figure at zero', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    const result = await getDashboardData(userId, NOW, TZ);

    expect(result.hasAnyWallet).toBe(false);
    expect(result.hasAnyTransactionEver).toBe(false);
    expect(result.cashTotal).toBe(0n);
    expect(result.monthlyIncome).toBe(0n);
    expect(result.monthlyExpense).toBe(0n);
    expect(result.recentTransactions).toEqual([]);
  });

  it('cash total excludes credit cards; combined data matches the underlying rows', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    await createTestWallet(userId, { type: 'cash', balance: 3_000_000_00n });
    await createTestWallet(userId, { type: 'bank', balance: 5_000_000_00n });
    await createTestWallet(userId, { type: 'credit_card', balance: -1_500_000_00n });

    const expenseCategory = await createTestCategory(userId, { type: 'expense' });
    const incomeCategory = await createTestCategory(userId, { type: 'income' });

    await insertTransaction({
      userId,
      type: 'expense',
      categoryId: expenseCategory,
      amount: 450_000_00n,
      transactionDate: new Date('2026-09-10T02:00:00Z'),
    });
    await insertTransaction({
      userId,
      type: 'income',
      categoryId: incomeCategory,
      amount: 15_000_000_00n,
      transactionDate: new Date('2026-09-01T02:00:00Z'),
    });

    const result = await getDashboardData(userId, NOW, TZ);

    expect(result.hasAnyWallet).toBe(true);
    // 3,000,000 + 5,000,000 — the -1,500,000 credit card is NOT included.
    expect(result.cashTotal).toBe(8_000_000_00n);
    expect(result.monthlyIncome).toBe(15_000_000_00n);
    expect(result.monthlyExpense).toBe(450_000_00n);
    expect(result.hasAnyTransactionEver).toBe(true);
    expect(result.recentTransactions).toHaveLength(2);
  });

  it('recentTransactions returns exactly 5, newest first, when more than 5 exist', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    await createTestWallet(userId, { type: 'cash', balance: 1_000_000_00n });
    const categoryId = await createTestCategory(userId, { type: 'expense' });

    for (let day = 1; day <= 7; day++) {
      await insertTransaction({
        userId,
        type: 'expense',
        categoryId,
        amount: BigInt(day) * 10_000_00n,
        transactionDate: new Date(`2026-09-0${day}T02:00:00Z`),
      });
    }

    const result = await getDashboardData(userId, NOW, TZ);
    expect(result.recentTransactions).toHaveLength(5);
    // Newest first — day 7 down to day 3.
    const days = result.recentTransactions.map((t) => t.transactionDate.getUTCDate());
    expect(days).toEqual([7, 6, 5, 4, 3]);
  });

  it("delta uses the last snapshot of the previous month, not just a fixed trailing window", async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    await createTestWallet(userId, { type: 'cash', balance: 1_000_000_00n });

    const augustEarly = {
      id: uuidv7(),
      userId,
      snapshotDate: '2026-08-05',
      totalAssets: 170_000_000_00n,
      totalLiabilities: 0n,
      netWorth: 170_000_000_00n,
      breakdown: { assets: {}, liabilities: {} },
    };
    const augustLast = {
      id: uuidv7(),
      userId,
      snapshotDate: '2026-08-28',
      totalAssets: 180_000_000_00n,
      totalLiabilities: 0n,
      netWorth: 180_000_000_00n,
      breakdown: { assets: {}, liabilities: {} },
    };
    const septemberToday = {
      id: uuidv7(),
      userId,
      snapshotDate: '2026-09-16',
      totalAssets: 191_650_000_00n,
      totalLiabilities: 0n,
      netWorth: 191_650_000_00n,
      breakdown: { assets: {}, liabilities: {} },
    };
    await dbWrite.insert(netWorthSnapshots).values([augustEarly, augustLast, septemberToday]);

    const result = await getDashboardData(userId, NOW, TZ);

    // The EARLY-August point must be dropped — only the LAST snapshot of
    // the previous month (Aug 28) through today survives.
    expect(result.netWorthTrend.map((h) => h.date)).toEqual(['2026-08-28', '2026-09-16']);
    expect(result.netWorthTrend[0]!.netWorth).toBe(180_000_000_00n);
    expect(result.netWorthTrend[1]!.netWorth).toBe(191_650_000_00n);
  });
});
