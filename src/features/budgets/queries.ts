/**
 * Budget read queries — `dbRead` only (docs/11-tech-architecture.md §2:
 * "queries.ts ← baca, dipanggil Server Component"). "Spent" is computed
 * here, not in src/lib/services/budgets.ts (writes only) or
 * src/lib/finance/budget.ts (pure threshold math over an already-known
 * amount/spent pair) — this is the one place that turns a budget row into a
 * number by querying `transactions`.
 *
 * Personal spent sums the caller's OWN `transactions.category_id`
 * (including direct sub-categories — tasks/14-budgets/todo.md "Termasuk
 * sub-kategori dalam perhitungan"). Household spent sums EVERY member's
 * transactions tagged to the household whose category shares the budget's
 * `system_key`, matched EXACTLY (docs/03-domain-model.md §13) — never by
 * name, and never rolling up a member's CUSTOM sub-category even if it's
 * nested under a matching built-in parent (docs/03 §7.2: a custom category
 * "tidak dilebur", always its own row).
 *
 * Both exclude `type = 'transfer'` (by only ever selecting `type =
 * 'expense'`), voided rows, and — structurally, simply by never joining
 * those tables — savings contributions and debt payments, neither of which
 * ever produces a `transactions` row at all (see src/lib/db/schema/savings.ts
 * / obligations.ts: both link straight to `ledger_entries`, bypassing
 * `transactions` entirely).
 */
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { budgets, categories, householdMembers, households, transactions, users } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import type { Money } from '@/lib/finance/money';
import { type BudgetStatus, calculateBudgetStatus } from '@/lib/finance/budget';
import { CATEGORY_CATALOG } from '@/lib/db/seed/categories';
import { DEFAULT_TIMEZONE, localMonthRange, periodDateRange, type UtcRange } from '@/lib/date/timezone';

/** Direct target + its direct children (categories are capped at depth 1 —
 * src/lib/db/schema/categories.ts — so this is exhaustive, no recursion
 * needed). Scoped by `ownedBy` even though `categoryId` already came from
 * the caller's own budget row, as defense in depth. */
async function resolveCategoryIdsWithChildren(userId: string, categoryId: string): Promise<string[]> {
  const rows = await dbRead
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(ownedBy(categories, userId), or(eq(categories.id, categoryId), eq(categories.parentId, categoryId))),
    );
  return rows.map((r) => r.id);
}

async function calculatePersonalSpent(userId: string, categoryIds: string[], range: UtcRange): Promise<Money> {
  if (categoryIds.length === 0) return 0n;

  const [row] = await dbRead
    .select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        ownedBy(transactions, userId),
        eq(transactions.type, 'expense'),
        inArray(transactions.categoryId, categoryIds),
        isNull(transactions.voidedAt),
        gte(transactions.transactionDate, range.start),
        lt(transactions.transactionDate, range.end),
      ),
    );
  return BigInt(row?.total ?? '0');
}

export interface MemberSpentView {
  userId: string;
  name: string;
  spent: Money;
}

interface HouseholdSpentResult {
  total: Money;
  byUser: Map<string, Money>;
}

/** Exact `system_key` match, joined against ALL members' transactions
 * tagged to this household — docs/03 §13's formula. */
async function calculateHouseholdSpent(
  householdId: string,
  categoryKey: string,
  range: UtcRange,
): Promise<HouseholdSpentResult> {
  const rows = await dbRead
    .select({
      userId: transactions.userId,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, 'expense'),
        eq(categories.systemKey, categoryKey),
        isNull(transactions.voidedAt),
        gte(transactions.transactionDate, range.start),
        lt(transactions.transactionDate, range.end),
      ),
    )
    .groupBy(transactions.userId);

  const byUser = new Map<string, Money>();
  let total = 0n;
  for (const row of rows) {
    const amount = BigInt(row.total);
    byUser.set(row.userId, amount);
    total += amount;
  }
  return { total, byUser };
}

/** Active members' `(userId, display name)` — a local, budgets-scoped copy
 * of the same query src/features/household/queries.ts's `listActiveMembers`
 * runs (name-or-email fallback matches
 * src/features/household/components/member-list.tsx). Kept local rather
 * than importing that module: docs/11-tech-architecture.md §3, "features/A
 * tidak boleh mengimpor dari features/B". */
async function listActiveMemberNames(householdId: string): Promise<MemberSpentView[]> {
  const rows = await dbRead
    .select({ userId: householdMembers.userId, name: users.name, email: users.email })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.status, 'active')));
  return rows.map((r) => ({ userId: r.userId, name: r.name ?? r.email, spent: 0n }));
}

async function resolveUserTimezone(userId: string): Promise<string> {
  const [row] = await dbRead.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.timezone ?? DEFAULT_TIMEZONE;
}

async function resolveHouseholdTimezone(householdId: string): Promise<string> {
  const [row] = await dbRead
    .select({ timezone: households.timezone })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  return row?.timezone ?? DEFAULT_TIMEZONE;
}

export interface PersonalBudgetView {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  amount: Money;
  spent: Money;
  status: BudgetStatus;
  percent: number;
  periodStart: string;
  periodEnd: string;
  isRecurring: boolean;
}

/**
 * The caller's personal budgets for `period`, with "spent" computed over
 * THEIR OWN transactions regardless of household tag (docs/03 §13: "Budget
 * pribadi menghitung transaksi user itu, terlepas dari tag household"), in
 * the CALLER's OWN timezone (`users.timezone`) — not a household's, not the
 * hardcoded MVP default. Sorted by percent used, descending
 * (tasks/14-budgets/todo.md: "diurut persentase terpakai menurun").
 */
export async function getPersonalBudgets(userId: string, period: string): Promise<PersonalBudgetView[]> {
  const tz = await resolveUserTimezone(userId);
  const { from } = periodDateRange(period);
  const range = localMonthRange(period, tz);

  const rows = await dbRead
    .select({
      budget: budgets,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
    })
    .from(budgets)
    .innerJoin(categories, eq(categories.id, budgets.categoryId))
    .where(and(eq(budgets.userId, userId), eq(budgets.periodStart, from)))
    .orderBy(desc(budgets.createdAt));

  const results: PersonalBudgetView[] = [];
  for (const row of rows) {
    const categoryIds = await resolveCategoryIdsWithChildren(userId, row.budget.categoryId!);
    const spent = await calculatePersonalSpent(userId, categoryIds, range);
    const { status, percent } = calculateBudgetStatus(row.budget.amount, spent);
    results.push({
      id: row.budget.id,
      categoryId: row.budget.categoryId!,
      categoryName: row.categoryName,
      categoryIcon: row.categoryIcon,
      categoryColor: row.categoryColor,
      amount: row.budget.amount,
      spent,
      status,
      percent,
      periodStart: row.budget.periodStart,
      periodEnd: row.budget.periodEnd,
      isRecurring: row.budget.isRecurring,
    });
  }

  return results.sort((a, b) => b.percent - a.percent);
}

/** Dashboard-facing subset — docs/09-screen-specs.md §1: "Bagian 'Anggaran'
 * tersembunyi seluruhnya kalau tidak ada budget yang ≥ 80%." A UI-filtering
 * concern living in the query, not a schema change — the underlying rows
 * are identical to `getPersonalBudgets`, just narrowed. */
export async function getBudgetsNeedingAttention(userId: string, period: string): Promise<PersonalBudgetView[]> {
  const all = await getPersonalBudgets(userId, period);
  return all.filter((b) => b.status !== 'safe');
}

export interface HouseholdBudgetView {
  id: string;
  categoryKey: string;
  categoryLabel: string;
  categoryIcon: string;
  categoryColor: string;
  amount: Money;
  spent: Money;
  status: BudgetStatus;
  percent: number;
  periodStart: string;
  periodEnd: string;
  isRecurring: boolean;
  /** EVERY active member, including those who spent nothing this period —
   * omitting a non-spender would make the total look more "explained" than
   * it is, same reasoning as household net-worth's `byMember` (docs/06
   * §6, `/api/households/[id]/net-worth`). Sorted by spent, descending. */
  byMember: MemberSpentView[];
}

/**
 * A household's budgets for `period`, with "spent" summed across EVERY
 * active member's transactions tagged to this household (docs/03 §13),
 * matched via `categories.system_key` — exact, never by name — in the
 * HOUSEHOLD's own timezone (`households.timezone`), not any one member's.
 */
export async function getHouseholdBudgets(householdId: string, period: string): Promise<HouseholdBudgetView[]> {
  const tz = await resolveHouseholdTimezone(householdId);
  const { from } = periodDateRange(period);
  const range = localMonthRange(period, tz);

  const rows = await dbRead
    .select()
    .from(budgets)
    .where(and(eq(budgets.householdId, householdId), eq(budgets.periodStart, from)))
    .orderBy(desc(budgets.createdAt));
  if (rows.length === 0) return [];

  const members = await listActiveMemberNames(householdId);

  const results: HouseholdBudgetView[] = [];
  for (const row of rows) {
    const catalogEntry = CATEGORY_CATALOG.find((entry) => entry.systemKey === row.categoryKey);
    const { total, byUser } = await calculateHouseholdSpent(householdId, row.categoryKey!, range);
    const byMember = members
      .map((m) => ({ ...m, spent: byUser.get(m.userId) ?? 0n }))
      .sort((a, b) => (a.spent === b.spent ? 0 : a.spent > b.spent ? -1 : 1));
    const { status, percent } = calculateBudgetStatus(row.amount, total);

    results.push({
      id: row.id,
      categoryKey: row.categoryKey!,
      categoryLabel: catalogEntry?.name ?? row.categoryKey!,
      categoryIcon: catalogEntry?.icon ?? 'tag',
      categoryColor: catalogEntry?.color ?? 'slate',
      amount: row.amount,
      spent: total,
      status,
      percent,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      isRecurring: row.isRecurring,
      byMember,
    });
  }

  return results.sort((a, b) => b.percent - a.percent);
}

export interface BudgetableCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/** Expense categories the caller does NOT already have a budget for this
 * period — the create sheet's category picker. Editing an existing budget
 * doesn't use this (category is locked after creation, same as wallet
 * type — src/features/wallets/components/wallet-form-sheet.tsx). */
export async function listBudgetableCategories(userId: string, period: string): Promise<BudgetableCategory[]> {
  const { from } = periodDateRange(period);
  const budgeted = await dbRead
    .select({ categoryId: budgets.categoryId })
    .from(budgets)
    .where(and(eq(budgets.userId, userId), eq(budgets.periodStart, from)));
  const budgetedIds = new Set(budgeted.map((b) => b.categoryId));

  const rows = await dbRead
    .select({ id: categories.id, name: categories.name, icon: categories.icon, color: categories.color })
    .from(categories)
    .where(and(ownedBy(categories, userId), eq(categories.type, 'expense'), eq(categories.isArchived, false)))
    .orderBy(categories.sortOrder);

  return rows.filter((c) => !budgetedIds.has(c.id));
}

export interface BudgetableCategoryKey {
  key: string;
  name: string;
  icon: string;
  color: string;
}

/** Built-in EXPENSE catalog keys the household does NOT already have a
 * budget for this period — docs/03 §13: "Budget household hanya dapat
 * dibuat untuk kategori bawaan", so this is never derived from the
 * household's own (per-member, possibly renamed) category rows. */
export async function listBudgetableCategoryKeys(
  householdId: string,
  period: string,
): Promise<BudgetableCategoryKey[]> {
  const { from } = periodDateRange(period);
  const budgeted = await dbRead
    .select({ categoryKey: budgets.categoryKey })
    .from(budgets)
    .where(and(eq(budgets.householdId, householdId), eq(budgets.periodStart, from)));
  const budgetedKeys = new Set(budgeted.map((b) => b.categoryKey));

  return CATEGORY_CATALOG.filter((entry) => entry.type === 'expense' && !budgetedKeys.has(entry.systemKey)).map(
    (entry) => ({ key: entry.systemKey, name: entry.name, icon: entry.icon, color: entry.color }),
  );
}
