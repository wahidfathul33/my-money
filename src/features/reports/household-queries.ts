/**
 * Household report reads — `dbRead` only (docs/11-tech-architecture.md §2).
 * Backs `GET /api/households/[id]/summary` (docs/06-api-contracts.md §6).
 *
 * Callers MUST already have verified ACTIVE membership themselves
 * (`requireHouseholdAccess`, src/lib/services/households.ts) — same
 * convention as every other query under src/features/household/** and
 * src/features/budgets/queries.ts's `getHouseholdBudgets`: this module
 * never re-checks membership.
 *
 * Period boundaries always use `households.timezone`, never any one
 * member's own timezone — docs §6's exact words: "Agregasi memakai
 * households.timezone untuk batas periode, bukan zona waktu masing-masing
 * anggota." Category grouping follows docs/03-domain-model.md §13's rule,
 * the same one `getHouseholdBudgets` already implements: built-in
 * categories collapse across members by EXACT `system_key` match; a custom
 * category is always its own row, tagged with its owner's name, and is
 * NEVER matched by name against another member's custom category. Per
 * docs/06 §6, `byCategory` here is NOT merged into "Lainnya" and nothing is
 * matched by text — that folding is a chart-rendering concern
 * (src/lib/finance/report-aggregation.ts), applied by the UI layer, not
 * baked into this API-shaped query.
 *
 * `features/A tidak boleh mengimpor dari features/B`
 * (docs/11-tech-architecture.md §3) — this file duplicates small pieces of
 * src/features/budgets/queries.ts (member roster, spent-by-member) rather
 * than importing them, same as that file already duplicates
 * src/features/household/queries.ts's `listActiveMembers`.
 */
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { budgets, categories, householdMembers, households, savingsContributions, savingsGoals, transactions, users } from '@/lib/db/schema';
import type { Money } from '@/lib/finance/money';
import { calculateBudgetStatus, type BudgetStatus } from '@/lib/finance/budget';
import { CATEGORY_CATALOG } from '@/lib/db/seed/categories';
import {
  DEFAULT_TIMEZONE,
  currentLocalPeriod,
  localMonthRange,
  periodDateRange,
  shiftPeriod,
  toLocalMonth,
  type UtcRange,
} from '@/lib/date/timezone';
import { shortMonthLabel } from '@/lib/finance/report-aggregation';

async function resolveHouseholdTimezone(householdId: string): Promise<string> {
  const [row] = await dbRead
    .select({ timezone: households.timezone })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  return row?.timezone ?? DEFAULT_TIMEZONE;
}

interface RosterMember {
  userId: string;
  name: string;
}

async function listActiveMemberNames(householdId: string): Promise<RosterMember[]> {
  const rows = await dbRead
    .select({ userId: householdMembers.userId, name: users.name, email: users.email })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.status, 'active')));
  return rows.map((r) => ({ userId: r.userId, name: r.name ?? r.email }));
}

// --- byCategory --------------------------------------------------------------

export interface SystemCategoryRow {
  kind: 'system';
  systemKey: string;
  label: string;
  icon: string;
  color: string;
  amount: Money;
  share: number;
}

export interface CustomCategoryRow {
  kind: 'custom';
  categoryId: string;
  label: string;
  ownerName: string;
  amount: Money;
  share: number;
}

export type HouseholdCategoryRow = SystemCategoryRow | CustomCategoryRow;

async function getSystemCategoryTotals(householdId: string, range: UtcRange): Promise<Map<string, Money>> {
  const rows = await dbRead
    .select({ systemKey: categories.systemKey, amount: sql<string>`SUM(${transactions.amount})` })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, 'expense'),
        sql`${categories.systemKey} IS NOT NULL`,
        isNull(transactions.voidedAt),
        gte(transactions.transactionDate, range.start),
        lt(transactions.transactionDate, range.end),
      ),
    )
    .groupBy(categories.systemKey);

  return new Map(rows.map((r) => [r.systemKey!, BigInt(r.amount)]));
}

interface CustomCategoryTotal {
  categoryId: string;
  name: string;
  ownerName: string;
  amount: Money;
}

async function getCustomCategoryTotals(householdId: string, range: UtcRange): Promise<CustomCategoryTotal[]> {
  const rows = await dbRead
    .select({
      categoryId: transactions.categoryId,
      name: categories.name,
      ownerName: users.name,
      ownerEmail: users.email,
      amount: sql<string>`SUM(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .innerJoin(users, eq(users.id, categories.userId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, 'expense'),
        sql`${categories.systemKey} IS NULL`,
        isNull(transactions.voidedAt),
        gte(transactions.transactionDate, range.start),
        lt(transactions.transactionDate, range.end),
      ),
    )
    .groupBy(transactions.categoryId, categories.name, users.name, users.email);

  return rows.map((r) => ({
    categoryId: r.categoryId!,
    name: r.name,
    ownerName: r.ownerName ?? r.ownerEmail,
    amount: BigInt(r.amount),
  }));
}

// --- byMember ------------------------------------------------------------

export interface HouseholdMemberActivity {
  userId: string;
  name: string;
  expensePaid: Money;
  incomeContributed: Money;
  savingsContributed: Money;
}

async function getExpenseByMember(householdId: string, range: UtcRange): Promise<Map<string, Money>> {
  const rows = await dbRead
    .select({ userId: transactions.userId, amount: sql<string>`SUM(${transactions.amount})` })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, 'expense'),
        isNull(transactions.voidedAt),
        gte(transactions.transactionDate, range.start),
        lt(transactions.transactionDate, range.end),
      ),
    )
    .groupBy(transactions.userId);
  return new Map(rows.map((r) => [r.userId, BigInt(r.amount)]));
}

async function getIncomeByMember(householdId: string, range: UtcRange): Promise<Map<string, Money>> {
  const rows = await dbRead
    .select({ userId: transactions.userId, amount: sql<string>`SUM(${transactions.amount})` })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, 'income'),
        isNull(transactions.voidedAt),
        gte(transactions.transactionDate, range.start),
        lt(transactions.transactionDate, range.end),
      ),
    )
    .groupBy(transactions.userId);
  return new Map(rows.map((r) => [r.userId, BigInt(r.amount)]));
}

/** Contributions to this HOUSEHOLD's own shared savings goals only — a
 * member's contributions to their own personal goals are out of scope for
 * "who paid what for the family" (docs/09 §9's household framing). */
async function getSavingsContributionByMember(householdId: string, range: UtcRange): Promise<Map<string, Money>> {
  const rows = await dbRead
    .select({ userId: savingsContributions.userId, amount: sql<string>`SUM(${savingsContributions.amount})` })
    .from(savingsContributions)
    .innerJoin(savingsGoals, eq(savingsGoals.id, savingsContributions.savingsGoalId))
    .where(
      and(
        eq(savingsGoals.householdId, householdId),
        isNull(savingsContributions.voidedAt),
        gte(savingsContributions.contributionDate, range.start),
        lt(savingsContributions.contributionDate, range.end),
      ),
    )
    .groupBy(savingsContributions.userId);
  return new Map(rows.map((r) => [r.userId, BigInt(r.amount)]));
}

// --- budgets ---------------------------------------------------------------

export interface HouseholdBudgetSummaryRow {
  categoryKey: string;
  label: string;
  amount: Money;
  spent: Money;
  status: BudgetStatus;
}

async function getHouseholdBudgetRows(
  householdId: string,
  period: string,
  range: UtcRange,
): Promise<HouseholdBudgetSummaryRow[]> {
  const { from } = periodDateRange(period);
  const rows = await dbRead
    .select()
    .from(budgets)
    .where(and(eq(budgets.householdId, householdId), eq(budgets.periodStart, from)));
  if (rows.length === 0) return [];

  const spentRows = await dbRead
    .select({ categoryKey: categories.systemKey, amount: sql<string>`SUM(${transactions.amount})` })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, 'expense'),
        sql`${categories.systemKey} IS NOT NULL`,
        isNull(transactions.voidedAt),
        gte(transactions.transactionDate, range.start),
        lt(transactions.transactionDate, range.end),
      ),
    )
    .groupBy(categories.systemKey);
  const spentByKey = new Map(spentRows.map((r) => [r.categoryKey!, BigInt(r.amount)]));

  return rows.map((row) => {
    const catalogEntry = CATEGORY_CATALOG.find((entry) => entry.systemKey === row.categoryKey);
    const spent = spentByKey.get(row.categoryKey!) ?? 0n;
    const { status } = calculateBudgetStatus(row.amount, spent);
    return {
      categoryKey: row.categoryKey!,
      label: catalogEntry?.name ?? row.categoryKey!,
      amount: row.amount,
      spent,
      status,
    };
  });
}

// --- getHouseholdSummary -----------------------------------------------------

export interface HouseholdSummary {
  income: Money;
  expense: Money;
  net: Money;
  byCategory: HouseholdCategoryRow[];
  byMember: HouseholdMemberActivity[];
  budgets: HouseholdBudgetSummaryRow[];
}

/**
 * `getHouseholdSummary(householdId, period)` — todo.md. Caller must already
 * be verified as an active member (see file header). Period boundary uses
 * `households.timezone`.
 */
export async function getHouseholdSummary(householdId: string, period: string): Promise<HouseholdSummary> {
  const tz = await resolveHouseholdTimezone(householdId);
  const range = localMonthRange(period, tz);

  const [
    roster,
    systemTotals,
    customTotals,
    expenseByMember,
    incomeByMember,
    savingsByMember,
    householdBudgets,
  ] = await Promise.all([
    listActiveMemberNames(householdId),
    getSystemCategoryTotals(householdId, range),
    getCustomCategoryTotals(householdId, range),
    getExpenseByMember(householdId, range),
    getIncomeByMember(householdId, range),
    getSavingsContributionByMember(householdId, range),
    getHouseholdBudgetRows(householdId, period, range),
  ]);

  const income = [...incomeByMember.values()].reduce((sum, v) => sum + v, 0n);
  const expenseFromSystem = [...systemTotals.values()].reduce((sum, v) => sum + v, 0n);
  const expenseFromCustom = customTotals.reduce((sum, c) => sum + c.amount, 0n);
  const expense = expenseFromSystem + expenseFromCustom;

  const systemRows: SystemCategoryRow[] = [...systemTotals.entries()].map(([systemKey, amount]) => {
    const catalogEntry = CATEGORY_CATALOG.find((entry) => entry.systemKey === systemKey);
    return {
      kind: 'system',
      systemKey,
      label: catalogEntry?.name ?? systemKey,
      icon: catalogEntry?.icon ?? 'tag',
      color: catalogEntry?.color ?? 'slate',
      amount,
      share: sharePercentOf(amount, expense),
    };
  });

  const customRows: CustomCategoryRow[] = customTotals.map((c) => ({
    kind: 'custom',
    categoryId: c.categoryId,
    label: c.name,
    ownerName: c.ownerName,
    amount: c.amount,
    share: sharePercentOf(c.amount, expense),
  }));

  const byCategory: HouseholdCategoryRow[] = [...systemRows, ...customRows].sort((a, b) =>
    b.amount === a.amount ? 0 : b.amount > a.amount ? 1 : -1,
  );

  const byMember: HouseholdMemberActivity[] = roster.map((m) => ({
    userId: m.userId,
    name: m.name,
    expensePaid: expenseByMember.get(m.userId) ?? 0n,
    incomeContributed: incomeByMember.get(m.userId) ?? 0n,
    savingsContributed: savingsByMember.get(m.userId) ?? 0n,
  }));

  return { income, expense, net: income - expense, byCategory, byMember, budgets: householdBudgets };
}

function sharePercentOf(amount: Money, total: Money): number {
  if (total <= 0n) return 0;
  const basisPoints = (amount * 100_000n) / total;
  return Number(basisPoints) / 1000;
}

// --- getHouseholdTrend -------------------------------------------------------

export interface HouseholdMonthlyTrend {
  period: string;
  label: string;
  income: Money;
  expense: Money;
}

/** `getHouseholdTrend(householdId, months)` — todo.md, same shape as the
 * personal `getIncomeVsExpense`, household-scoped and in the household's
 * own timezone. */
export async function getHouseholdTrend(
  householdId: string,
  months = 6,
  now: Date = new Date(),
): Promise<HouseholdMonthlyTrend[]> {
  const tz = await resolveHouseholdTimezone(householdId);
  const current = currentLocalPeriod(now, tz);
  const periods: string[] = [];
  for (let i = months - 1; i >= 0; i--) periods.push(shiftPeriod(current, -i));

  const range: UtcRange = {
    start: localMonthRange(periods[0]!, tz).start,
    end: localMonthRange(periods[periods.length - 1]!, tz).end,
  };

  const rows = await dbRead
    .select({ type: transactions.type, amount: transactions.amount, transactionDate: transactions.transactionDate })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        sql`${transactions.type} IN ('income', 'expense')`,
        isNull(transactions.voidedAt),
        gte(transactions.transactionDate, range.start),
        lt(transactions.transactionDate, range.end),
      ),
    );

  const byPeriod = new Map<string, { income: Money; expense: Money }>(
    periods.map((p) => [p, { income: 0n, expense: 0n }]),
  );
  for (const row of rows) {
    const period = toLocalMonth(row.transactionDate, tz);
    const bucket = byPeriod.get(period);
    if (!bucket) continue;
    if (row.type === 'income') bucket.income += row.amount;
    else if (row.type === 'expense') bucket.expense += row.amount;
  }

  return periods.map((period) => ({
    period,
    label: shortMonthLabel(period),
    income: byPeriod.get(period)!.income,
    expense: byPeriod.get(period)!.expense,
  }));
}
