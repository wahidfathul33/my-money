// @vitest-environment node
/**
 * Integration tests for getHouseholdSummary (src/features/household/summary-queries.ts)
 * — real Neon database. Covers the two aggregates with no prior owner
 * (spending by member, spending by category — including the built-in
 * cross-member merge vs. custom single-owner rule from docs/09-screen-specs.md
 * §12) plus the household >= 80% budget filter and the overall wiring.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { ledgerEntries, savingsContributions, savingsGoals, transactions } from '@/lib/db/schema';
import { upsertHouseholdBudget } from '@/lib/services/budgets';
import {
  createTestCategory,
  createTestHousehold,
  createTestHouseholdMember,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestSavingsGoal,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { getHouseholdSummary } from '../summary-queries';

const PERIOD = '2026-09';

async function insertHouseholdExpense(params: {
  userId: string;
  householdId: string;
  categoryId: string;
  amount: bigint;
  date: Date;
}): Promise<void> {
  await dbWrite.insert(transactions).values({
    id: uuidv7(),
    userId: params.userId,
    householdId: params.householdId,
    type: 'expense',
    categoryId: params.categoryId,
    amount: params.amount,
    transactionDate: params.date,
    createdBy: params.userId,
  });
}

describe('features/household/summary-queries — integration', () => {
  const userIds: string[] = [];
  const householdIds: string[] = [];
  const goalIds: string[] = [];

  afterEach(async () => {
    for (const id of goalIds.splice(0)) await deleteTestSavingsGoal(id);
    for (const id of householdIds.splice(0)) await deleteTestHousehold(id);
    for (const id of userIds.splice(0)) await deleteTestUser(id);
  });

  it('merges built-in categories across members but keeps a custom category as its own owner-labeled row', async () => {
    const owner = await createTestUser({ name: 'Wahid' });
    const member = await createTestUser({ name: 'Istri' });
    userIds.push(owner, member);

    const householdId = await createTestHousehold(owner);
    householdIds.push(householdId);
    await createTestHouseholdMember(householdId, owner, { role: 'owner' });
    await createTestHouseholdMember(householdId, member, { role: 'member' });

    const ownerFood = await createTestCategory(owner, { type: 'expense', systemKey: 'food_drinks', name: 'Makan & Minum' });
    const memberFood = await createTestCategory(member, { type: 'expense', systemKey: 'food_drinks', name: 'Makan & Minum' });
    const ownerCustom = await createTestCategory(owner, { type: 'expense', name: 'Hobi Custom' });

    await insertHouseholdExpense({ userId: owner, householdId, categoryId: ownerFood, amount: 400_000_00n, date: new Date('2026-09-05T02:00:00Z') });
    await insertHouseholdExpense({ userId: member, householdId, categoryId: memberFood, amount: 300_000_00n, date: new Date('2026-09-06T02:00:00Z') });
    await insertHouseholdExpense({ userId: owner, householdId, categoryId: ownerCustom, amount: 150_000_00n, date: new Date('2026-09-07T02:00:00Z') });

    const summary = await getHouseholdSummary(householdId, PERIOD);

    const foodRow = summary.categorySpending.find((r) => r.key === 'food_drinks');
    expect(foodRow?.total).toBe(700_000_00n); // merged across owner + member
    expect(foodRow?.ownerName).toBeNull(); // built-in — no single owner

    const customRow = summary.categorySpending.find((r) => r.key === ownerCustom);
    expect(customRow?.total).toBe(150_000_00n);
    expect(customRow?.ownerName).toBe('Wahid');

    expect(summary.periodExpense).toBe(850_000_00n);
    expect(summary.hasAnyTaggedTransactionEver).toBe(true);
  });

  it('"Siapa Membayar Apa" only lists members who actually spent this period, sorted descending', async () => {
    const spender = await createTestUser({ name: 'Wahid' });
    const silent = await createTestUser({ name: 'Adi' });
    userIds.push(spender, silent);

    const householdId = await createTestHousehold(spender);
    householdIds.push(householdId);
    await createTestHouseholdMember(householdId, spender, { role: 'owner' });
    await createTestHouseholdMember(householdId, silent, { role: 'member' });

    const category = await createTestCategory(spender, { type: 'expense' });
    await insertHouseholdExpense({ userId: spender, householdId, categoryId: category, amount: 200_000_00n, date: new Date('2026-09-05T02:00:00Z') });

    const summary = await getHouseholdSummary(householdId, PERIOD);

    expect(summary.memberSpending).toHaveLength(1);
    expect(summary.memberSpending[0]!.userId).toBe(spender);
    expect(summary.memberSpending[0]!.total).toBe(200_000_00n);
  });

  it('only surfaces household budgets >= 80% used', async () => {
    const owner = await createTestUser();
    userIds.push(owner);
    const householdId = await createTestHousehold(owner);
    householdIds.push(householdId);
    await createTestHouseholdMember(householdId, owner, { role: 'owner' });

    await upsertHouseholdBudget(owner, householdId, { categoryKey: 'food_drinks', amount: 1_000_000_00n, period: PERIOD, isRecurring: false });
    await upsertHouseholdBudget(owner, householdId, { categoryKey: 'transport', amount: 1_000_000_00n, period: PERIOD, isRecurring: false });

    const foodCategory = await createTestCategory(owner, { type: 'expense', systemKey: 'food_drinks', name: 'Makan & Minum' });
    const transportCategory = await createTestCategory(owner, { type: 'expense', systemKey: 'transport', name: 'Transportasi' });

    await insertHouseholdExpense({ userId: owner, householdId, categoryId: foodCategory, amount: 900_000_00n, date: new Date('2026-09-05T02:00:00Z') }); // 90%
    await insertHouseholdExpense({ userId: owner, householdId, categoryId: transportCategory, amount: 50_000_00n, date: new Date('2026-09-05T02:00:00Z') }); // 5%

    const summary = await getHouseholdSummary(householdId, PERIOD);

    expect(summary.budgetsNeedingAttention.map((b) => b.categoryKey)).toEqual(['food_drinks']);
  });

  it('surfaces shared savings goals with per-member contribution breakdown', async () => {
    const a = await createTestUser({ name: 'Wahid' });
    const b = await createTestUser({ name: 'Istri' });
    userIds.push(a, b);
    const householdId = await createTestHousehold(a);
    householdIds.push(householdId);
    await createTestHouseholdMember(householdId, a, { role: 'owner' });
    await createTestHouseholdMember(householdId, b, { role: 'member' });

    const goalId = uuidv7();
    await dbWrite.insert(savingsGoals).values({
      id: goalId,
      userId: a,
      householdId,
      name: 'Liburan Keluarga',
      targetAmount: 20_000_000_00n,
    });
    goalIds.push(goalId);

    const walletId = await createTestWallet(a, { type: 'cash', balance: 5_000_000_00n });
    const ledgerEntryId = uuidv7();
    await dbWrite.insert(ledgerEntries).values({
      id: ledgerEntryId,
      userId: a,
      walletId,
      amount: -5_000_000_00n,
      source: 'savings_contribution',
      entryDate: new Date('2026-09-01T02:00:00Z'),
    });
    await dbWrite.insert(savingsContributions).values([
      {
        id: uuidv7(),
        savingsGoalId: goalId,
        userId: a,
        walletId,
        ledgerEntryId,
        amount: 5_000_000_00n,
        contributionDate: new Date('2026-09-01T02:00:00Z'),
      },
    ]);

    const summary = await getHouseholdSummary(householdId, PERIOD);

    expect(summary.savingsGoals.map((g) => g.id)).toContain(goalId);
    const contribution = summary.savingsContributions.find((c) => c.goalId === goalId);
    expect(contribution?.members.some((m) => m.userId === a && m.total === 5_000_000_00n)).toBe(true);
  });

  it('hasAnyTaggedTransactionEver is false and spending arrays are empty for a brand-new household', async () => {
    const owner = await createTestUser();
    userIds.push(owner);
    const householdId = await createTestHousehold(owner);
    householdIds.push(householdId);
    await createTestHouseholdMember(householdId, owner, { role: 'owner' });

    const summary = await getHouseholdSummary(householdId, PERIOD);

    expect(summary.hasAnyTaggedTransactionEver).toBe(false);
    expect(summary.memberSpending).toEqual([]);
    expect(summary.categorySpending).toEqual([]);
    expect(summary.periodExpense).toBe(0n);
    expect(summary.members).toHaveLength(1);
  });
});
