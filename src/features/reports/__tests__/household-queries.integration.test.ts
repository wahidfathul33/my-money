// @vitest-environment node
/**
 * Integration tests for household report queries
 * (src/features/reports/household-queries.ts) — real Neon database.
 * Covers tasks/21-reports/todo.md's "Query — Household" and "Test"
 * sections: exact `system_key` grouping across members (even after a
 * rename), custom categories staying as their own row with `ownerName`,
 * per-member activity, the household timezone boundary, and cross-household
 * isolation.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { ledgerEntries, transactions } from '@/lib/db/schema/transactions';
import { savingsContributions, savingsGoals } from '@/lib/db/schema/savings';
import { createHousehold } from '@/lib/services/households';
import {
  createTestCategory,
  createTestHouseholdMember,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import {
  getEarliestHouseholdTransactionDate,
  getHouseholdSummary,
  getHouseholdTrend,
} from '../household-queries';

const PERIOD = '2026-09';
// 2026-09-15 12:00 WIB = 05:00 UTC.
const MID_SEPTEMBER_WIB = new Date('2026-09-15T05:00:00.000Z');

async function insertTransaction(params: {
  userId: string;
  type: 'income' | 'expense' | 'transfer';
  categoryId: string | null;
  amount: bigint;
  transactionDate: Date;
  householdId?: string | null;
  voidedAt?: Date | null;
}): Promise<string> {
  const id = uuidv7();
  await dbWrite.insert(transactions).values({
    id,
    userId: params.userId,
    householdId: params.householdId ?? null,
    type: params.type,
    categoryId: params.categoryId,
    amount: params.amount,
    transactionDate: params.transactionDate,
    createdBy: params.userId,
    voidedAt: params.voidedAt ?? null,
  });
  return id;
}

async function insertHouseholdSavingsContribution(params: {
  userId: string;
  householdId: string;
  walletId: string;
  amount: bigint;
  date: Date;
}): Promise<void> {
  const goalId = uuidv7();
  await dbWrite
    .insert(savingsGoals)
    .values({ id: goalId, userId: params.userId, householdId: params.householdId, name: 'Goal Bersama', targetAmount: 10_000_000_00n });

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
  });
}

describe('reports household queries', () => {
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

  // I14: a transaction counts at most once in one household aggregation.
  // This describe block's tests each sum two different members' transactions
  // to an EXACT expected total (never doubled, never dropped) across two
  // different aggregation shapes (byCategory here, byMember below).
  describe('getHouseholdSummary — byCategory', () => {
    it('groups built-in categories by system_key EXACTLY, across members, even after a rename', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const memberId = await createTestUser();
      userIds.push(memberId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, memberId, { role: 'member', status: 'active' });

      const ownerCategoryId = await createTestCategory(ownerId, {
        name: 'Makan & Minum',
        type: 'expense',
        systemKey: 'food_drinks',
      });
      const memberCategoryId = await createTestCategory(memberId, {
        name: 'Makan dan Minum (rename)',
        type: 'expense',
        systemKey: 'food_drinks',
      });

      await insertTransaction({
        userId: ownerId,
        type: 'expense',
        categoryId: ownerCategoryId,
        amount: 400_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        householdId: household.id,
      });
      await insertTransaction({
        userId: memberId,
        type: 'expense',
        categoryId: memberCategoryId,
        amount: 300_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        householdId: household.id,
      });

      const summary = await getHouseholdSummary(household.id, PERIOD);
      const systemRows = summary.byCategory.filter((r) => r.kind === 'system');
      expect(systemRows).toHaveLength(1);
      expect(systemRows[0]!.systemKey).toBe('food_drinks');
      expect(systemRows[0]!.amount).toBe(700_000_00n);
      expect(summary.expense).toBe(700_000_00n);
    });

    it('a custom category from two members appears as TWO separate rows, each with its owner name — never matched by text', async () => {
      const ownerId = await createTestUser({ name: 'Wahid' });
      userIds.push(ownerId);
      const memberId = await createTestUser({ name: 'Istri' });
      userIds.push(memberId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, memberId, { role: 'member', status: 'active' });

      // Same NAME, different owners, both custom (no system_key) — must
      // NOT collapse into one row despite the identical text.
      const ownerCategoryId = await createTestCategory(ownerId, { name: 'Hobi', type: 'expense', systemKey: null });
      const memberCategoryId = await createTestCategory(memberId, { name: 'Hobi', type: 'expense', systemKey: null });

      await insertTransaction({
        userId: ownerId,
        type: 'expense',
        categoryId: ownerCategoryId,
        amount: 150_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        householdId: household.id,
      });
      await insertTransaction({
        userId: memberId,
        type: 'expense',
        categoryId: memberCategoryId,
        amount: 250_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        householdId: household.id,
      });

      const summary = await getHouseholdSummary(household.id, PERIOD);
      const customRows = summary.byCategory.filter((r) => r.kind === 'custom');
      expect(customRows).toHaveLength(2);

      const ownerRow = customRows.find((r) => r.ownerName === 'Wahid');
      const memberRow = customRows.find((r) => r.ownerName === 'Istri');
      expect(ownerRow?.amount).toBe(150_000_00n);
      expect(memberRow?.amount).toBe(250_000_00n);
    });

    it('an UNTAGGED transaction in a matching category never counts toward the household total', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const categoryId = await createTestCategory(ownerId, { type: 'expense', systemKey: 'food_drinks' });

      // No householdId — a purely personal transaction.
      await insertTransaction({ userId: ownerId, type: 'expense', categoryId, amount: 999_999_00n, transactionDate: MID_SEPTEMBER_WIB });

      const summary = await getHouseholdSummary(household.id, PERIOD);
      expect(summary.expense).toBe(0n);
      expect(summary.byCategory).toHaveLength(0);
    });
  });

  describe('getHouseholdSummary — byMember', () => {
    it('includes every active member, even one who did nothing this period, and separates savings contributed to the HOUSEHOLD goal', async () => {
      const ownerId = await createTestUser({ name: 'Wahid' });
      userIds.push(ownerId);
      const quietMemberId = await createTestUser({ name: 'Istri' });
      userIds.push(quietMemberId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, quietMemberId, { role: 'member', status: 'active' });

      const expenseCategoryId = await createTestCategory(ownerId, { type: 'expense' });
      const incomeCategoryId = await createTestCategory(ownerId, { type: 'income' });
      const walletId = await createTestWallet(ownerId);

      await insertTransaction({
        userId: ownerId,
        type: 'expense',
        categoryId: expenseCategoryId,
        amount: 300_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        householdId: household.id,
      });
      await insertTransaction({
        userId: ownerId,
        type: 'income',
        categoryId: incomeCategoryId,
        amount: 1_000_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        householdId: household.id,
      });
      await insertHouseholdSavingsContribution({
        userId: ownerId,
        householdId: household.id,
        walletId,
        amount: 200_000_00n,
        date: MID_SEPTEMBER_WIB,
      });

      const summary = await getHouseholdSummary(household.id, PERIOD);
      expect(summary.byMember).toHaveLength(2);

      const ownerActivity = summary.byMember.find((m) => m.userId === ownerId)!;
      expect(ownerActivity.expensePaid).toBe(300_000_00n);
      expect(ownerActivity.incomeContributed).toBe(1_000_000_00n);
      expect(ownerActivity.savingsContributed).toBe(200_000_00n);

      const quietActivity = summary.byMember.find((m) => m.userId === quietMemberId)!;
      expect(quietActivity.expensePaid).toBe(0n);
      expect(quietActivity.incomeContributed).toBe(0n);
      expect(quietActivity.savingsContributed).toBe(0n);
    });

    it('a contribution to the member\'s OWN personal goal is not counted as household savings', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const walletId = await createTestWallet(ownerId);

      // Personal goal — householdId NULL.
      const personalGoalId = uuidv7();
      await dbWrite
        .insert(savingsGoals)
        .values({ id: personalGoalId, userId: ownerId, name: 'Goal Pribadi', targetAmount: 5_000_000_00n });
      const ledgerEntryId = uuidv7();
      await dbWrite.insert(ledgerEntries).values({
        id: ledgerEntryId,
        userId: ownerId,
        walletId,
        amount: -500_000_00n,
        source: 'savings_contribution',
        entryDate: MID_SEPTEMBER_WIB,
      });
      await dbWrite.insert(savingsContributions).values({
        id: uuidv7(),
        savingsGoalId: personalGoalId,
        userId: ownerId,
        walletId,
        ledgerEntryId,
        amount: 500_000_00n,
        contributionDate: MID_SEPTEMBER_WIB,
      });

      const summary = await getHouseholdSummary(household.id, PERIOD);
      const ownerActivity = summary.byMember.find((m) => m.userId === ownerId)!;
      expect(ownerActivity.savingsContributed).toBe(0n);
    });
  });

  describe('getHouseholdSummary — batas periode (households.timezone)', () => {
    it('respects the HOUSEHOLD\'s own timezone, not any one member\'s', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      // Household timezone far from WIB, so a boundary WIB-correct instant
      // would land in the WRONG month if the household's own tz weren't used.
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Pacific/Honolulu' });
      householdIds.push(household.id);
      const categoryId = await createTestCategory(ownerId, { type: 'expense' });

      // 2026-09-01 00:30 WIB = 2026-08-31 17:30 UTC. In Honolulu (UTC-10)
      // that instant is 2026-08-31 07:30 — solidly August there too, so
      // this transaction should NOT count in September for this household.
      await insertTransaction({
        userId: ownerId,
        type: 'expense',
        categoryId,
        amount: 250_000_00n,
        transactionDate: new Date('2026-08-31T17:30:00.000Z'),
        householdId: household.id,
      });

      const august = await getHouseholdSummary(household.id, '2026-08');
      const september = await getHouseholdSummary(household.id, '2026-09');
      expect(august.expense).toBe(250_000_00n);
      expect(september.expense).toBe(0n);
    });
  });

  describe('getHouseholdTrend', () => {
    it('sums household-tagged income/expense per trailing month', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const expenseCategoryId = await createTestCategory(ownerId, { type: 'expense' });

      await insertTransaction({
        userId: ownerId,
        type: 'expense',
        categoryId: expenseCategoryId,
        amount: 400_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        householdId: household.id,
      });

      const trend = await getHouseholdTrend(household.id, 3, MID_SEPTEMBER_WIB);
      expect(trend.map((t) => t.period)).toEqual(['2026-07', '2026-08', '2026-09']);
      const september = trend.find((t) => t.period === '2026-09')!;
      expect(september.expense).toBe(400_000_00n);
      expect(september.label).toBe('Sep');
    });
  });

  describe('getEarliestHouseholdTransactionDate', () => {
    it('null when nothing is tagged to the household yet', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      expect(await getEarliestHouseholdTransactionDate(household.id)).toBeNull();
    });
  });

  describe('isolasi lintas-household', () => {
    it('another household\'s tagged transactions never count toward this household\'s summary', async () => {
      const ownerAId = await createTestUser();
      const ownerBId = await createTestUser();
      userIds.push(ownerAId, ownerBId);
      const householdA = await createHousehold(ownerAId, { name: 'Keluarga A', timezone: 'Asia/Jakarta' });
      const householdB = await createHousehold(ownerBId, { name: 'Keluarga B', timezone: 'Asia/Jakarta' });
      householdIds.push(householdA.id, householdB.id);

      const categoryAId = await createTestCategory(ownerAId, { type: 'expense', systemKey: 'food_drinks' });
      const categoryBId = await createTestCategory(ownerBId, { type: 'expense', systemKey: 'food_drinks' });

      await insertTransaction({
        userId: ownerAId,
        type: 'expense',
        categoryId: categoryAId,
        amount: 100_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        householdId: householdA.id,
      });
      await insertTransaction({
        userId: ownerBId,
        type: 'expense',
        categoryId: categoryBId,
        amount: 50_000_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        householdId: householdB.id,
      });

      const summaryA = await getHouseholdSummary(householdA.id, PERIOD);
      expect(summaryA.expense).toBe(100_000_00n);
      expect(summaryA.byMember.every((m) => m.userId !== ownerBId)).toBe(true);
    });
  });
});
