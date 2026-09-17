/**
 * Household summary reads — `dbRead` only (docs/11-tech-architecture.md
 * §2). Backs `/household/[id]` (docs/09-screen-specs.md §12).
 *
 * Composes existing features' own query modules directly rather than
 * re-deriving their numbers (`getHouseholdBudgets`, `listHouseholdGoals`,
 * `getContributionsByMember`, `getHouseholdNetWorth`, `listActiveMembers`,
 * `hasAnyHouseholdTransaction`) — the same cross-feature-aggregator shape
 * `src/features/net-worth/queries.ts` already established for exactly this
 * reason (see that file's own header comment): re-deriving a figure a prior
 * task already proved correct is precisely where double-counting bugs are
 * born (docs/01-product-analysis.md §5's risk table).
 *
 * The two aggregates with no prior owner — "who paid what" and "spending by
 * category" for the period, both scoped to `transactions.household_id` —
 * are computed here, mirroring `src/features/budgets/queries.ts`'s own
 * `calculateHouseholdSpent` pattern (group by user, exact `system_key`
 * match for built-in categories so two members' "Makan & Minum" rows merge
 * into one, while a custom category — `system_key IS NULL` — always stays
 * its own row, labeled with its owner, per docs/09 §12: "kustom sebagai
 * barisnya sendiri disertai nama pemilik").
 */
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { categories, households, transactions, users } from '@/lib/db/schema';
import { localMonthRange, DEFAULT_TIMEZONE, type UtcRange } from '@/lib/date/timezone';
import type { Money } from '@/lib/finance/money';
import { listActiveMembers, type HouseholdMemberRow } from './queries';
import { hasAnyHouseholdTransaction } from '@/features/sharing/household-transactions-queries';
import { getHouseholdBudgets, type HouseholdBudgetView } from '@/features/budgets/queries';
import {
  getContributionsByMember,
  listHouseholdGoals,
  type MemberContributionTotal,
  type SavingsGoalListItem,
} from '@/features/savings/queries';
import { getHouseholdNetWorth, type HouseholdNetWorthOverview } from '@/features/net-worth/queries';

const SAVINGS_LIMIT = 2;
const CATEGORY_TOP_N = 3;

async function resolveHouseholdTimezone(householdId: string): Promise<string> {
  const [row] = await dbRead
    .select({ timezone: households.timezone })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  return row?.timezone ?? DEFAULT_TIMEZONE;
}

async function getHouseholdPeriodTotals(householdId: string, range: UtcRange): Promise<{ income: Money; expense: Money }> {
  const rows = await dbRead
    .select({ type: transactions.type, total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        inArray(transactions.type, ['income', 'expense']),
        isNull(transactions.voidedAt),
        gte(transactions.transactionDate, range.start),
        lt(transactions.transactionDate, range.end),
      ),
    )
    .groupBy(transactions.type);

  let income = 0n;
  let expense = 0n;
  for (const row of rows) {
    if (row.type === 'income') income = BigInt(row.total);
    else if (row.type === 'expense') expense = BigInt(row.total);
  }
  return { income, expense };
}

export interface MemberSpendingRow {
  userId: string;
  name: string;
  total: Money;
}

/** "Siapa Membayar Apa" — docs/09 §12: ONLY members with a household-tagged
 * expense THIS period (a member who spent nothing simply produces no row,
 * via the `GROUP BY` itself — no separate filter needed). Sorted by spent,
 * descending. */
async function getHouseholdSpendingByMember(householdId: string, range: UtcRange): Promise<MemberSpendingRow[]> {
  const rows = await dbRead
    .select({
      userId: transactions.userId,
      name: users.name,
      email: users.email,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .innerJoin(users, eq(users.id, transactions.userId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, 'expense'),
        isNull(transactions.voidedAt),
        gte(transactions.transactionDate, range.start),
        lt(transactions.transactionDate, range.end),
      ),
    )
    .groupBy(transactions.userId, users.name, users.email)
    .orderBy(desc(sql`SUM(${transactions.amount})`));

  return rows.map((r) => ({ userId: r.userId, name: r.name ?? r.email, total: BigInt(r.total) }));
}

export interface CategorySpendingRow {
  /** `system_key` for a built-in category (shared across members), or the
   * category's own `id` for a custom one (always single-owner). */
  key: string;
  name: string;
  icon: string;
  color: string;
  /** Set only for a custom category (`system_key IS NULL`) — docs/09 §12:
   * "kustom sebagai barisnya sendiri disertai nama pemilik". `null` for a
   * built-in, which is shared across members by construction. */
  ownerName: string | null;
  total: Money;
}

/** "Per Kategori" — docs/09 §12: "menampilkan SELURUH kategori — bawaan
 * yang dikelompokkan lintas anggota, dan kustom sebagai barisnya sendiri".
 * Grouped per `(system_key, category_id)` in SQL (so two members' rows for
 * the same built-in stay distinguishable), then merged by `system_key` in
 * application code — the same two-step shape
 * src/features/net-worth/queries.ts's per-member-then-total composition
 * uses, chosen because a single SQL `GROUP BY system_key` alone can't also
 * report each CUSTOM category's owner (those rows must stay ungrouped by
 * `category_id`, not folded together). */
async function getHouseholdSpendingByCategory(householdId: string, range: UtcRange): Promise<CategorySpendingRow[]> {
  const rows = await dbRead
    .select({
      systemKey: categories.systemKey,
      categoryId: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      ownerName: users.name,
      ownerEmail: users.email,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .innerJoin(users, eq(users.id, categories.userId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, 'expense'),
        isNull(transactions.voidedAt),
        gte(transactions.transactionDate, range.start),
        lt(transactions.transactionDate, range.end),
      ),
    )
    .groupBy(categories.systemKey, categories.id, categories.name, categories.icon, categories.color, users.name, users.email);

  const byKey = new Map<string, CategorySpendingRow>();
  for (const row of rows) {
    const total = BigInt(row.total);
    if (row.systemKey) {
      const existing = byKey.get(row.systemKey);
      if (existing) {
        existing.total += total;
      } else {
        byKey.set(row.systemKey, { key: row.systemKey, name: row.name, icon: row.icon, color: row.color, ownerName: null, total });
      }
    } else {
      byKey.set(row.categoryId, {
        key: row.categoryId,
        name: row.name,
        icon: row.icon,
        color: row.color,
        ownerName: row.ownerName ?? row.ownerEmail,
        total,
      });
    }
  }

  return [...byKey.values()].sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0));
}

/** Nearest-target-date-first, ACTIVE goals only, capped at `SAVINGS_LIMIT`
 * — same rule (and same reasoning) as
 * src/features/dashboard/queries.ts's `selectDashboardSavingsGoals`,
 * duplicated rather than imported (docs/11-tech-architecture.md §3,
 * "features/A tidak boleh mengimpor dari features/B" — same convention
 * already followed by e.g. `listWalletOptions` appearing independently in
 * both src/features/savings/queries.ts and src/features/obligations/queries.ts). */
function selectNearestGoals(goals: SavingsGoalListItem[], limit = SAVINGS_LIMIT): SavingsGoalListItem[] {
  return goals
    .filter((g) => g.status === 'active')
    .sort((a, b) => {
      if (a.targetDate === null && b.targetDate === null) return 0;
      if (a.targetDate === null) return 1;
      if (b.targetDate === null) return -1;
      return a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 : 0;
    })
    .slice(0, limit);
}

export interface GoalContributions {
  goalId: string;
  members: MemberContributionTotal[];
}

export interface HouseholdSummaryData {
  periodIncome: Money;
  periodExpense: Money;
  memberSpending: MemberSpendingRow[];
  /** Already sliced to the top `CATEGORY_TOP_N`. */
  categorySpending: CategorySpendingRow[];
  /** `true` when there are more categories than shown — drives whether
   * "Per Kategori" needs its own "Lihat" link. */
  hasMoreCategories: boolean;
  budgetsNeedingAttention: HouseholdBudgetView[];
  savingsGoals: SavingsGoalListItem[];
  savingsContributions: GoalContributions[];
  netWorth: HouseholdNetWorthOverview;
  members: HouseholdMemberRow[];
  /** `true` iff the household has EVER had a tagged transaction — distinct
   * from `periodExpense === 0n`, which just means nothing THIS period. */
  hasAnyTaggedTransactionEver: boolean;
}

/**
 * Everything `/household/[id]` needs, for `period` (`YYYY-MM`) — the
 * caller already sits behind `requireHouseholdAccess`/the layout guard
 * (same convention as every other query under `src/features/household/**`),
 * so this doesn't re-check membership. Every independent piece is fetched
 * via ONE `Promise.all` (not a waterfall) — the per-goal contribution
 * breakdown is the one thing that can't join that first wave (it needs the
 * goal ids `listHouseholdGoals` resolves), so it's a second, small,
 * still-parallel `Promise.all` over at most `SAVINGS_LIMIT` goals.
 */
export async function getHouseholdSummary(householdId: string, period: string): Promise<HouseholdSummaryData> {
  const tz = await resolveHouseholdTimezone(householdId);
  const range = localMonthRange(period, tz);

  const [periodTotals, memberSpending, categorySpending, budgets, goals, netWorth, members, hasAnyTaggedTransactionEver] =
    await Promise.all([
      getHouseholdPeriodTotals(householdId, range),
      getHouseholdSpendingByMember(householdId, range),
      getHouseholdSpendingByCategory(householdId, range),
      getHouseholdBudgets(householdId, period),
      listHouseholdGoals(householdId),
      getHouseholdNetWorth(householdId),
      listActiveMembers(householdId),
      hasAnyHouseholdTransaction(householdId),
    ]);

  const savingsGoals = selectNearestGoals(goals);
  const contributionsByGoal = await Promise.all(savingsGoals.map((g) => getContributionsByMember(g.id)));

  return {
    periodIncome: periodTotals.income,
    periodExpense: periodTotals.expense,
    memberSpending,
    categorySpending: categorySpending.slice(0, CATEGORY_TOP_N),
    hasMoreCategories: categorySpending.length > CATEGORY_TOP_N,
    budgetsNeedingAttention: budgets.filter((b) => b.status !== 'safe'),
    savingsGoals,
    savingsContributions: savingsGoals.map((g, i) => ({ goalId: g.id, members: contributionsByGoal[i]! })),
    netWorth,
    members,
    hasAnyTaggedTransactionEver,
  };
}
