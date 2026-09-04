// @vitest-environment node
/**
 * Integration tests for the budget read queries (src/features/budgets/queries.ts)
 * — real Neon database. This is where tasks/14-budgets/spec.md's core
 * correctness claims live: sub-category rollup, exact `system_key` matching
 * across members, the transfer/savings/debt-payment/void exclusions, WIB
 * period boundaries, and cross-user/cross-household isolation.
 *
 * Fixture transactions are inserted directly via `dbWrite` rather than
 * through `src/lib/services/transactions.ts` — that service doesn't (yet)
 * accept a `householdId` tag (task 12/13 territory, not this task's — see
 * briefing), and `transactions` has no `wallet_id` column at all (wallet
 * linkage lives only on `ledger_entries`, which budgets never reads), so a
 * direct insert is both necessary for household-tagged fixtures and
 * sufficient for every scenario below.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { ledgerEntries, transactions } from '@/lib/db/schema/transactions';
import { savingsContributions, savingsGoals } from '@/lib/db/schema/savings';
import { debtPayments, debts } from '@/lib/db/schema/obligations';
import { createHousehold } from '@/lib/services/households';
import { upsertHouseholdBudget, upsertPersonalBudget } from '@/lib/services/budgets';
import {
  createTestCategory,
  createTestHouseholdMember,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import {
  getHouseholdBudgets,
  getPersonalBudgets,
  listBudgetableCategories,
  listBudgetableCategoryKeys,
} from '../queries';

const PERIOD = '2026-09';

/** Direct fixture insert — see file header for why this bypasses the service. */
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

/** A `savings_contributions` row with a real `ledger_entries` row behind it
 * (NOT NULL FK — src/lib/db/schema/savings.ts) but no `transactions` row at
 * all, matching how the real savings feature will eventually write these. */
async function insertSavingsContribution(params: {
  userId: string;
  walletId: string;
  amount: bigint;
  date: Date;
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
  });
}

/** Same idea as `insertSavingsContribution`, for `debt_payments`. */
async function insertDebtPayment(params: {
  userId: string;
  walletId: string;
  amount: bigint;
  date: Date;
}): Promise<void> {
  const debtId = uuidv7();
  await dbWrite.insert(debts).values({
    id: debtId,
    userId: params.userId,
    creditorName: 'Test Creditor',
    initialAmount: 5_000_000_00n,
    remainingAmount: 5_000_000_00n,
    startDate: '2026-01-01',
  });

  const ledgerEntryId = uuidv7();
  await dbWrite.insert(ledgerEntries).values({
    id: ledgerEntryId,
    userId: params.userId,
    walletId: params.walletId,
    amount: -params.amount,
    source: 'debt_payment',
    entryDate: params.date,
  });

  await dbWrite.insert(debtPayments).values({
    id: uuidv7(),
    debtId,
    userId: params.userId,
    walletId: params.walletId,
    ledgerEntryId,
    amount: params.amount,
    paymentDate: '2026-09-15',
  });
}

// A time comfortably mid-period, in WIB — 2026-09-15 12:00 WIB = 05:00 UTC.
const MID_SEPTEMBER_WIB = new Date('2026-09-15T05:00:00.000Z');

describe('budgets queries', () => {
  const userIds: string[] = [];
  const householdIds: string[] = [];

  afterEach(async () => {
    for (const id of householdIds.splice(0)) {
      await deleteTestHousehold(id);
    }
    for (const id of userIds.splice(0)) {
      // `deleteTestUser` (shared helper) deletes `ledger_entries` for the
      // user but knows nothing about savings/debt fixtures THIS file adds
      // on top — both link to `ledger_entries` via `ON DELETE RESTRICT`
      // (src/lib/db/schema/savings.ts / obligations.ts), so those must go
      // first or the ledger delete inside `deleteTestUser` itself fails.
      await dbWrite.delete(savingsContributions).where(eq(savingsContributions.userId, id));
      await dbWrite.delete(savingsGoals).where(eq(savingsGoals.userId, id));
      await dbWrite.delete(debtPayments).where(eq(debtPayments.userId, id));
      await dbWrite.delete(debts).where(eq(debts.userId, id));
      await deleteTestUser(id);
    }
  });

  describe('getPersonalBudgets — spent calculation', () => {
    it('sums the caller\'s own expense transactions in the budgeted category, for the period', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan & Minum', type: 'expense' });
      await upsertPersonalBudget(userId, {
        categoryId,
        amount: 1_000_000_00n,
        period: PERIOD,
        isRecurring: true,
      });

      await insertTransaction({
        userId,
        type: 'expense',
        categoryId,
        amount: 300_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
      });
      await insertTransaction({
        userId,
        type: 'expense',
        categoryId,
        amount: 200_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
      });

      const [budget] = await getPersonalBudgets(userId, PERIOD);
      expect(budget!.spent).toBe(500_000_00n);
      expect(budget!.status).toBe('safe');
      expect(budget!.percent).toBeCloseTo(50, 5);
    });

    it('includes SUB-CATEGORY transactions in the parent budget\'s spent total', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const parentId = await createTestCategory(userId, { name: 'Makan & Minum', type: 'expense' });
      const childId = await createTestCategory(userId, {
        name: 'Kopi',
        type: 'expense',
        parentId,
      });
      await upsertPersonalBudget(userId, {
        categoryId: parentId,
        amount: 1_000_000_00n,
        period: PERIOD,
        isRecurring: true,
      });

      await insertTransaction({
        userId,
        type: 'expense',
        categoryId: parentId,
        amount: 300_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
      });
      await insertTransaction({
        userId,
        type: 'expense',
        categoryId: childId,
        amount: 150_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
      });

      const [budget] = await getPersonalBudgets(userId, PERIOD);
      expect(budget!.spent).toBe(450_000_00n); // 300k (parent) + 150k (child)
    });

    it('a budget on the CHILD category only sums that child\'s own transactions, not its sibling\'s', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const parentId = await createTestCategory(userId, { name: 'Makan & Minum', type: 'expense' });
      const childId = await createTestCategory(userId, { name: 'Kopi', type: 'expense', parentId });
      await upsertPersonalBudget(userId, {
        categoryId: childId,
        amount: 500_000_00n,
        period: PERIOD,
        isRecurring: true,
      });

      await insertTransaction({
        userId,
        type: 'expense',
        categoryId: parentId, // NOT the budgeted category
        amount: 999_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
      });
      await insertTransaction({
        userId,
        type: 'expense',
        categoryId: childId,
        amount: 40_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
      });

      const [budget] = await getPersonalBudgets(userId, PERIOD);
      expect(budget!.spent).toBe(40_000_00n);
    });

    it('sorts by percent used, descending', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const lowId = await createTestCategory(userId, { name: 'Hiburan', type: 'expense' });
      const highId = await createTestCategory(userId, { name: 'Makan & Minum', type: 'expense' });
      await upsertPersonalBudget(userId, { categoryId: lowId, amount: 1_000_000_00n, period: PERIOD, isRecurring: true });
      await upsertPersonalBudget(userId, { categoryId: highId, amount: 1_000_000_00n, period: PERIOD, isRecurring: true });

      await insertTransaction({ userId, type: 'expense', categoryId: lowId, amount: 100_000_00n, transactionDate: MID_SEPTEMBER_WIB });
      await insertTransaction({ userId, type: 'expense', categoryId: highId, amount: 900_000_00n, transactionDate: MID_SEPTEMBER_WIB });

      const result = await getPersonalBudgets(userId, PERIOD);
      expect(result.map((b) => b.categoryId)).toEqual([highId, lowId]);
    });
  });

  describe('getPersonalBudgets — pengecualian (tidak pernah terhitung)', () => {
    it('TRANSFER transactions are never counted', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan & Minum', type: 'expense' });
      await upsertPersonalBudget(userId, { categoryId, amount: 1_000_000_00n, period: PERIOD, isRecurring: true });

      await insertTransaction({ userId, type: 'expense', categoryId, amount: 100_000_00n, transactionDate: MID_SEPTEMBER_WIB });
      // A large transfer, same period, same user — must not leak into spent.
      await insertTransaction({
        userId,
        type: 'transfer',
        categoryId: null,
        amount: 5_000_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
      });

      const [budget] = await getPersonalBudgets(userId, PERIOD);
      expect(budget!.spent).toBe(100_000_00n);
    });

    it('SAVINGS CONTRIBUTIONS are never counted — they never produce a `transactions` row at all', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan & Minum', type: 'expense' });
      await upsertPersonalBudget(userId, { categoryId, amount: 1_000_000_00n, period: PERIOD, isRecurring: true });

      await insertTransaction({ userId, type: 'expense', categoryId, amount: 100_000_00n, transactionDate: MID_SEPTEMBER_WIB });
      await insertSavingsContribution({ userId, walletId, amount: 2_000_000_00n, date: MID_SEPTEMBER_WIB });

      const [budget] = await getPersonalBudgets(userId, PERIOD);
      expect(budget!.spent).toBe(100_000_00n);
    });

    it('DEBT PAYMENTS are never counted — they never produce a `transactions` row at all', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan & Minum', type: 'expense' });
      await upsertPersonalBudget(userId, { categoryId, amount: 1_000_000_00n, period: PERIOD, isRecurring: true });

      await insertTransaction({ userId, type: 'expense', categoryId, amount: 100_000_00n, transactionDate: MID_SEPTEMBER_WIB });
      await insertDebtPayment({ userId, walletId, amount: 3_000_000_00n, date: MID_SEPTEMBER_WIB });

      const [budget] = await getPersonalBudgets(userId, PERIOD);
      expect(budget!.spent).toBe(100_000_00n);
    });

    it('VOIDED transactions are excluded', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan & Minum', type: 'expense' });
      await upsertPersonalBudget(userId, { categoryId, amount: 1_000_000_00n, period: PERIOD, isRecurring: true });

      await insertTransaction({ userId, type: 'expense', categoryId, amount: 100_000_00n, transactionDate: MID_SEPTEMBER_WIB });
      await insertTransaction({
        userId,
        type: 'expense',
        categoryId,
        amount: 700_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        voidedAt: new Date(),
      });

      const [budget] = await getPersonalBudgets(userId, PERIOD);
      expect(budget!.spent).toBe(100_000_00n);
    });

    it('an INCOME transaction in the same category id space never counts (type filter, not just category)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan & Minum', type: 'expense' });
      await upsertPersonalBudget(userId, { categoryId, amount: 1_000_000_00n, period: PERIOD, isRecurring: true });

      await insertTransaction({ userId, type: 'expense', categoryId, amount: 100_000_00n, transactionDate: MID_SEPTEMBER_WIB });
      // Data-integrity edge case: a row whose type/category don't actually
      // agree (never producible via src/lib/services/transactions.ts, which
      // enforces this — see `assertCategoryMatchesType` — but not a DB-level
      // CHECK, so the query itself must stay defensive).
      await insertTransaction({ userId, type: 'income', categoryId, amount: 2_000_000_00n, transactionDate: MID_SEPTEMBER_WIB });

      const [budget] = await getPersonalBudgets(userId, PERIOD);
      expect(budget!.spent).toBe(100_000_00n);
    });
  });

  describe('getPersonalBudgets — batas periode (zona waktu user)', () => {
    it('a transaction at 23:30 WIB on the 31st belongs to THAT month, not the next', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan & Minum', type: 'expense' });
      await upsertPersonalBudget(userId, { categoryId, amount: 1_000_000_00n, period: '2026-08', isRecurring: true });
      await upsertPersonalBudget(userId, { categoryId, amount: 1_000_000_00n, period: '2026-09', isRecurring: true });

      // 2026-08-31 23:30 WIB = 2026-08-31 16:30 UTC.
      await insertTransaction({
        userId,
        type: 'expense',
        categoryId,
        amount: 250_000_00n,
        transactionDate: new Date('2026-08-31T16:30:00.000Z'),
      });

      const august = await getPersonalBudgets(userId, '2026-08');
      const september = await getPersonalBudgets(userId, '2026-09');
      expect(august[0]!.spent).toBe(250_000_00n);
      expect(september[0]!.spent).toBe(0n);
    });

    it('a transaction at 00:30 WIB on the 1st belongs to the NEW month, even though it is still the PREVIOUS calendar day in UTC', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan & Minum', type: 'expense' });
      await upsertPersonalBudget(userId, { categoryId, amount: 1_000_000_00n, period: '2026-08', isRecurring: true });
      await upsertPersonalBudget(userId, { categoryId, amount: 1_000_000_00n, period: '2026-09', isRecurring: true });

      // 2026-09-01 00:30 WIB = 2026-08-31 17:30 UTC — the exact bug
      // src/lib/date/timezone.ts exists to prevent: naive UTC-date grouping
      // would place this on Aug 31, not Sep 1.
      await insertTransaction({
        userId,
        type: 'expense',
        categoryId,
        amount: 250_000_00n,
        transactionDate: new Date('2026-08-31T17:30:00.000Z'),
      });

      const august = await getPersonalBudgets(userId, '2026-08');
      const september = await getPersonalBudgets(userId, '2026-09');
      expect(august[0]!.spent).toBe(0n);
      expect(september[0]!.spent).toBe(250_000_00n);
    });
  });

  describe('getHouseholdBudgets — rincian per anggota & pencocokan system_key eksak', () => {
    it('sums tagged expense transactions from ALL members, matched by system_key even after a rename', async () => {
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
      // The member's OWN copy of the same built-in category, RENAMED —
      // still must match via system_key, exactly docs/03 §13's point.
      const memberCategoryId = await createTestCategory(memberId, {
        name: 'Makan dan Minum (custom rename)',
        type: 'expense',
        systemKey: 'food_drinks',
      });

      await upsertHouseholdBudget(ownerId, household.id, {
        categoryKey: 'food_drinks',
        amount: 2_000_000_00n,
        period: PERIOD,
        isRecurring: true,
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

      const [budget] = await getHouseholdBudgets(household.id, PERIOD);
      expect(budget!.spent).toBe(700_000_00n);

      const ownerBreakdown = budget!.byMember.find((m) => m.userId === ownerId);
      const memberBreakdown = budget!.byMember.find((m) => m.userId === memberId);
      expect(ownerBreakdown?.spent).toBe(400_000_00n);
      expect(memberBreakdown?.spent).toBe(300_000_00n);
    });

    it('byMember includes an active member who spent NOTHING this period, at 0', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const memberId = await createTestUser();
      userIds.push(memberId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, memberId, { role: 'member', status: 'active' });

      await upsertHouseholdBudget(ownerId, household.id, {
        categoryKey: 'food_drinks',
        amount: 1_000_000_00n,
        period: PERIOD,
        isRecurring: true,
      });

      const [budget] = await getHouseholdBudgets(household.id, PERIOD);
      expect(budget!.byMember).toHaveLength(2);
      const memberBreakdown = budget!.byMember.find((m) => m.userId === memberId);
      expect(memberBreakdown?.spent).toBe(0n);
    });

    it('a CUSTOM category is never rolled up into the household budget, even if nested under the matching built-in parent', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      const builtInId = await createTestCategory(ownerId, {
        name: 'Makan & Minum',
        type: 'expense',
        systemKey: 'food_drinks',
      });
      const customChildId = await createTestCategory(ownerId, {
        name: 'Kopi Spesialti',
        type: 'expense',
        parentId: builtInId, // nested under the matching built-in — system_key is still NULL.
      });

      await upsertHouseholdBudget(ownerId, household.id, {
        categoryKey: 'food_drinks',
        amount: 1_000_000_00n,
        period: PERIOD,
        isRecurring: true,
      });

      await insertTransaction({
        userId: ownerId,
        type: 'expense',
        categoryId: builtInId,
        amount: 200_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        householdId: household.id,
      });
      await insertTransaction({
        userId: ownerId,
        type: 'expense',
        categoryId: customChildId,
        amount: 900_000_00n, // deliberately large — would dominate the total if wrongly rolled up
        transactionDate: MID_SEPTEMBER_WIB,
        householdId: household.id,
      });

      const [budget] = await getHouseholdBudgets(household.id, PERIOD);
      expect(budget!.spent).toBe(200_000_00n); // the custom child's 900k is excluded
    });
  });

  describe('getHouseholdBudgets — pengecualian & batas periode', () => {
    it('only HOUSEHOLD-TAGGED transactions count — an untagged expense in a matching category is excluded', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const categoryId = await createTestCategory(ownerId, {
        name: 'Makan & Minum',
        type: 'expense',
        systemKey: 'food_drinks',
      });

      await upsertHouseholdBudget(ownerId, household.id, {
        categoryKey: 'food_drinks',
        amount: 1_000_000_00n,
        period: PERIOD,
        isRecurring: true,
      });

      await insertTransaction({
        userId: ownerId,
        type: 'expense',
        categoryId,
        amount: 800_000_00n, // NOT tagged to the household
        transactionDate: MID_SEPTEMBER_WIB,
      });

      const [budget] = await getHouseholdBudgets(household.id, PERIOD);
      expect(budget!.spent).toBe(0n);
    });

    it('household spent respects the HOUSEHOLD\'s own timezone at the month boundary, not any member\'s', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      // Household timezone is far from WIB — the member's own (default WIB)
      // timezone must NOT be what decides the boundary here.
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Pacific/Honolulu' });
      householdIds.push(household.id);
      const categoryId = await createTestCategory(ownerId, {
        name: 'Makan & Minum',
        type: 'expense',
        systemKey: 'food_drinks',
      });

      await upsertHouseholdBudget(ownerId, household.id, {
        categoryKey: 'food_drinks',
        amount: 1_000_000_00n,
        period: '2026-09',
        isRecurring: true,
      });

      // 2026-09-01 00:30 WIB = 2026-08-31 17:30 UTC. In Honolulu (UTC-10)
      // that instant is 2026-08-31 07:30 — still AUGUST there, so this must
      // NOT land in the household's September budget.
      await insertTransaction({
        userId: ownerId,
        type: 'expense',
        categoryId,
        amount: 250_000_00n,
        transactionDate: new Date('2026-08-31T17:30:00.000Z'),
        householdId: household.id,
      });

      const [budget] = await getHouseholdBudgets(household.id, '2026-09');
      expect(budget!.spent).toBe(0n);
    });
  });

  describe('isolasi lintas-user & lintas-household', () => {
    it('lintas-user: another user\'s spending in an identically-named category never counts toward the caller\'s budget', async () => {
      const userAId = await createTestUser();
      userIds.push(userAId);
      const userBId = await createTestUser();
      userIds.push(userBId);
      const categoryAId = await createTestCategory(userAId, { name: 'Makan & Minum', type: 'expense' });
      const categoryBId = await createTestCategory(userBId, { name: 'Makan & Minum', type: 'expense' });

      await upsertPersonalBudget(userAId, { categoryId: categoryAId, amount: 1_000_000_00n, period: PERIOD, isRecurring: true });

      await insertTransaction({ userId: userAId, type: 'expense', categoryId: categoryAId, amount: 100_000_00n, transactionDate: MID_SEPTEMBER_WIB });
      await insertTransaction({ userId: userBId, type: 'expense', categoryId: categoryBId, amount: 5_000_000_00n, transactionDate: MID_SEPTEMBER_WIB });

      const [budgetA] = await getPersonalBudgets(userAId, PERIOD);
      expect(budgetA!.spent).toBe(100_000_00n);

      // User B has no budget of their own — confirm isolation both ways.
      const budgetsB = await getPersonalBudgets(userBId, PERIOD);
      expect(budgetsB).toHaveLength(0);
    });

    it('lintas-household: a household budget never sums another household\'s tagged transactions for the same system_key', async () => {
      const ownerAId = await createTestUser();
      userIds.push(ownerAId);
      const ownerBId = await createTestUser();
      userIds.push(ownerBId);
      const householdA = await createHousehold(ownerAId, { name: 'Keluarga A', timezone: 'Asia/Jakarta' });
      householdIds.push(householdA.id);
      const householdB = await createHousehold(ownerBId, { name: 'Keluarga B', timezone: 'Asia/Jakarta' });
      householdIds.push(householdB.id);

      const categoryAId = await createTestCategory(ownerAId, { name: 'Makan & Minum', type: 'expense', systemKey: 'food_drinks' });
      const categoryBId = await createTestCategory(ownerBId, { name: 'Makan & Minum', type: 'expense', systemKey: 'food_drinks' });

      await upsertHouseholdBudget(ownerAId, householdA.id, {
        categoryKey: 'food_drinks',
        amount: 1_000_000_00n,
        period: PERIOD,
        isRecurring: true,
      });

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
        amount: 9_000_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        householdId: householdB.id,
      });

      const [budgetA] = await getHouseholdBudgets(householdA.id, PERIOD);
      expect(budgetA!.spent).toBe(100_000_00n);

      const budgetsB = await getHouseholdBudgets(householdB.id, PERIOD);
      expect(budgetsB).toHaveLength(0);
    });
  });

  describe('bukan double counting — satu transaksi bertanda muncul di budget pribadi DAN household, dengan angka yang benar di keduanya', () => {
    it('a single household-tagged transaction is counted, independently and correctly, by both queries', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const categoryId = await createTestCategory(ownerId, {
        name: 'Makan & Minum',
        type: 'expense',
        systemKey: 'food_drinks',
      });

      await upsertPersonalBudget(ownerId, { categoryId, amount: 1_000_000_00n, period: PERIOD, isRecurring: true });
      await upsertHouseholdBudget(ownerId, household.id, {
        categoryKey: 'food_drinks',
        amount: 3_000_000_00n,
        period: PERIOD,
        isRecurring: true,
      });

      await insertTransaction({
        userId: ownerId,
        type: 'expense',
        categoryId,
        amount: 350_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        householdId: household.id, // tagged — counts toward BOTH.
      });

      const [personal] = await getPersonalBudgets(ownerId, PERIOD);
      const [household_] = await getHouseholdBudgets(household.id, PERIOD);

      expect(personal!.spent).toBe(350_000_00n);
      expect(household_!.spent).toBe(350_000_00n);
      // Not summed together anywhere — each answers its own question.
      expect(personal!.amount).toBe(1_000_000_00n);
      expect(household_!.amount).toBe(3_000_000_00n);
    });
  });

  describe('listBudgetableCategories / listBudgetableCategoryKeys', () => {
    it('excludes an expense category that already has a budget this period', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const budgetedId = await createTestCategory(userId, { name: 'Makan & Minum', type: 'expense' });
      const freeId = await createTestCategory(userId, { name: 'Transportasi', type: 'expense' });
      await upsertPersonalBudget(userId, { categoryId: budgetedId, amount: 1_000_000_00n, period: PERIOD, isRecurring: true });

      const budgetable = await listBudgetableCategories(userId, PERIOD);
      const ids = budgetable.map((c) => c.id);
      expect(ids).toContain(freeId);
      expect(ids).not.toContain(budgetedId);
    });

    it('excludes an income category entirely', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await createTestCategory(userId, { name: 'Gaji', type: 'income' });

      const budgetable = await listBudgetableCategories(userId, PERIOD);
      expect(budgetable.every((c) => c.name !== 'Gaji')).toBe(true);
    });

    it('household: excludes a system_key that already has a budget this period, and never returns income keys', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await upsertHouseholdBudget(ownerId, household.id, {
        categoryKey: 'food_drinks',
        amount: 1_000_000_00n,
        period: PERIOD,
        isRecurring: true,
      });

      const budgetable = await listBudgetableCategoryKeys(household.id, PERIOD);
      const keys = budgetable.map((c) => c.key);
      expect(keys).not.toContain('food_drinks');
      expect(keys).toContain('transport');
      expect(keys).not.toContain('salary');
    });
  });
});
