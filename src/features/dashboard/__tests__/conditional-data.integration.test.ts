// @vitest-environment node
/**
 * Integration tests for getDashboardConditionalData
 * (src/features/dashboard/queries.ts) — real Neon database. Covers the
 * conditional-display rules that decide whether a section renders at all:
 * budget >= 80%, obligations due <= 7 days or overdue, and (indirectly,
 * since the sort/cap itself is already unit-tested in queries.test.ts) that
 * savings goals actually flow through from `listGoals`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { savingsGoals, transactions } from '@/lib/db/schema';
import { upsertPersonalBudget } from '@/lib/services/budgets';
import {
  createTestCategory,
  createTestDebt,
  createTestUser,
  deleteTestDebt,
  deleteTestSavingsGoal,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { getDashboardConditionalData } from '../queries';

const TZ = 'Asia/Jakarta';
const NOW = new Date('2026-09-16T04:00:00Z'); // 2026-09-16 11:00 WIB
const PERIOD = '2026-09';

async function insertExpense(userId: string, categoryId: string, amount: bigint, date: Date): Promise<void> {
  await dbWrite.insert(transactions).values({
    id: uuidv7(),
    userId,
    type: 'expense',
    categoryId,
    amount,
    transactionDate: date,
    createdBy: userId,
  });
}

describe('features/dashboard/queries — getDashboardConditionalData integration', () => {
  const userIds: string[] = [];
  const debtIds: string[] = [];
  const goalIds: string[] = [];

  afterEach(async () => {
    for (const id of debtIds.splice(0)) await deleteTestDebt(id);
    for (const id of goalIds.splice(0)) await deleteTestSavingsGoal(id);
    for (const id of userIds.splice(0)) await deleteTestUser(id);
  });

  it('only includes budgets >= 80% used, excluding a healthy one', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    const hotCategory = await createTestCategory(userId, { type: 'expense', name: 'Makan & Minum' });
    const safeCategory = await createTestCategory(userId, { type: 'expense', name: 'Transportasi' });

    await upsertPersonalBudget(userId, { categoryId: hotCategory, amount: 1_000_000_00n, period: PERIOD, isRecurring: false });
    await upsertPersonalBudget(userId, { categoryId: safeCategory, amount: 1_000_000_00n, period: PERIOD, isRecurring: false });

    await insertExpense(userId, hotCategory, 850_000_00n, new Date('2026-09-05T02:00:00Z')); // 85%
    await insertExpense(userId, safeCategory, 100_000_00n, new Date('2026-09-05T02:00:00Z')); // 10%

    const result = await getDashboardConditionalData(userId, NOW, TZ);

    expect(result.budgetsNeedingAttention.map((b) => b.categoryId)).toEqual([hotCategory]);
  });

  it('includes an obligation due within 7 days and one already overdue, excludes one due far out', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    const soonDebt = await createTestDebt(userId, { creditorName: 'Cicilan motor', dueDate: '2026-09-19' }); // 3 days
    const overdueDebt = await createTestDebt(userId, { creditorName: 'Telat bayar', dueDate: '2026-09-01' });
    const farDebt = await createTestDebt(userId, { creditorName: 'Jauh', dueDate: '2026-12-01' });
    debtIds.push(soonDebt, overdueDebt, farDebt);

    const result = await getDashboardConditionalData(userId, NOW, TZ);

    const ids = result.upcomingObligations.map((o) => o.id);
    expect(ids).toContain(soonDebt);
    expect(ids).toContain(overdueDebt);
    expect(ids).not.toContain(farDebt);
    expect(result.upcomingObligations.find((o) => o.id === overdueDebt)?.overdue).toBe(true);
  });

  it('returns an empty upcomingObligations/budgetsNeedingAttention when everything is healthy/far off', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    const result = await getDashboardConditionalData(userId, NOW, TZ);

    expect(result.budgetsNeedingAttention).toEqual([]);
    expect(result.upcomingObligations).toEqual([]);
    expect(result.pendingTransferCount).toBe(0);
  });

  it('surfaces active savings goals, nearest target date first, capped at 2', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    const far = uuidv7();
    const near = uuidv7();
    const mid = uuidv7();
    await dbWrite.insert(savingsGoals).values([
      { id: far, userId, name: 'Far', targetAmount: 10_000_000_00n, targetDate: '2027-06-01' },
      { id: near, userId, name: 'Near', targetAmount: 10_000_000_00n, targetDate: '2026-10-01' },
      { id: mid, userId, name: 'Mid', targetAmount: 10_000_000_00n, targetDate: '2026-12-01' },
    ]);
    goalIds.push(far, near, mid);

    const result = await getDashboardConditionalData(userId, NOW, TZ);

    expect(result.savingsGoals.map((g) => g.id)).toEqual([near, mid]);
  });
});
