/**
 * Personal report reads — `dbRead` only (docs/11-tech-architecture.md §2).
 * tasks/21-reports/spec.md's five sections: income vs expense, expense by
 * category, top categories, cash flow, savings growth.
 *
 * Every aggregation here excludes `type = 'transfer'` (by only ever
 * selecting `type IN ('income', 'expense')`), voided rows
 * (`voided_at IS NULL`), and — structurally, by never joining those tables —
 * savings contributions and debt/receivable payments, none of which ever
 * produce a `transactions` row at all (same reasoning as
 * src/features/budgets/queries.ts's file header). Period boundaries always
 * use the CALLER's own `users.timezone` — never the hardcoded MVP default —
 * mirroring `resolveUserTimezone`/`localMonthRange` in that same file.
 *
 * `getSavingsGrowth` is the one query in this file that does NOT run its own
 * SQL for the figure that matters most: its final point is anchored to
 * `getTotalSavings` (src/features/savings/queries.ts, task 15) — the EXACT
 * function src/features/net-worth/queries.ts's `getNetWorth` already calls —
 * so report and net worth can never show two different savings totals
 * (spec.md's explicit "Catatan").
 */
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { categories, savingsContributions, transactions, users } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import type { Money } from '@/lib/finance/money';
import {
  DEFAULT_TIMEZONE,
  currentLocalPeriod,
  localMonthRange,
  periodDateRange,
  shiftPeriod,
  toLocalDate,
  toLocalMonth,
  type UtcRange,
} from '@/lib/date/timezone';
import { shortMonthLabel } from '@/lib/finance/report-aggregation';
import { getTotalSavings } from '@/features/savings/queries';

async function resolveUserTimezone(userId: string): Promise<string> {
  const [row] = await dbRead.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.timezone ?? DEFAULT_TIMEZONE;
}

/** The last `count` periods (`YYYY-MM`), oldest first, ending at the period `now` falls in. */
function trailingPeriods(count: number, now: Date, tz: string): string[] {
  const current = currentLocalPeriod(now, tz);
  const periods: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    periods.push(shiftPeriod(current, -i));
  }
  return periods;
}

function spanningRange(periods: string[], tz: string): UtcRange {
  const first = periods[0]!;
  const last = periods[periods.length - 1]!;
  return { start: localMonthRange(first, tz).start, end: localMonthRange(last, tz).end };
}

// --- 1. Income vs expense --------------------------------------------------

export interface MonthlyIncomeExpense {
  period: string;
  label: string;
  income: Money;
  expense: Money;
}

/**
 * `getIncomeVsExpense(userId, months)` — todo.md, the last `months` months
 * (default 6) including the current one, EVERY period present even at
 * `0n` (a quiet month is still a bar, not a gap — same reasoning as
 * `getHouseholdBudgets`' "omitting a non-spender" comment).
 */
export async function getIncomeVsExpense(
  userId: string,
  months = 6,
  now: Date = new Date(),
): Promise<MonthlyIncomeExpense[]> {
  const tz = await resolveUserTimezone(userId);
  const periods = trailingPeriods(months, now, tz);
  const range = spanningRange(periods, tz);

  const rows = await dbRead
    .select({ type: transactions.type, amount: transactions.amount, transactionDate: transactions.transactionDate })
    .from(transactions)
    .where(
      and(
        ownedBy(transactions, userId),
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
    if (!bucket) continue; // outside the requested window's edges — shouldn't happen given `range`, defensive only.
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

// --- 2 & 3. Expense by category / top categories ---------------------------

export interface CategoryExpenseItem {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  amount: Money;
}

/**
 * `getExpenseByCategory(userId, period)` — todo.md, sorted descending, NOT
 * merged into "Lainnya" here (that's `mergeTailIntoOther`'s job, applied by
 * the chart-rendering layer — src/lib/finance/report-aggregation.ts's file
 * header explains why the split lives there instead of in this query).
 */
export async function getExpenseByCategory(userId: string, period: string): Promise<CategoryExpenseItem[]> {
  const tz = await resolveUserTimezone(userId);
  const range = localMonthRange(period, tz);

  const rows = await dbRead
    .select({
      categoryId: transactions.categoryId,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      amount: sql<string>`SUM(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        ownedBy(transactions, userId),
        eq(transactions.type, 'expense'),
        isNull(transactions.voidedAt),
        gte(transactions.transactionDate, range.start),
        lt(transactions.transactionDate, range.end),
      ),
    )
    .groupBy(transactions.categoryId, categories.name, categories.icon, categories.color)
    .orderBy(sql`SUM(${transactions.amount}) DESC`);

  return rows.map((r) => ({
    categoryId: r.categoryId!,
    name: r.name,
    icon: r.icon,
    color: r.color,
    amount: BigInt(r.amount),
  }));
}

export interface TopCategoryComparison extends CategoryExpenseItem {
  previousAmount: Money;
  /** `null` when there's nothing to compare against (previous period was `0`) — an "undefined" percent change, never `Infinity`. */
  changePercent: number | null;
}

/**
 * `getTopCategories(userId, period, 3)` — todo.md, the top N expense
 * categories THIS period, each with its own amount from the PREVIOUS period
 * for comparison (spec.md: "3 teratas dengan perbandingan terhadap bulan
 * lalu"). Ranking is decided by the CURRENT period only — a category that
 * dominated last month but fell off this month's top N doesn't reappear.
 */
export async function getTopCategories(
  userId: string,
  period: string,
  limit = 3,
): Promise<TopCategoryComparison[]> {
  const current = await getExpenseByCategory(userId, period);
  const top = current.slice(0, limit);
  if (top.length === 0) return [];

  const previousPeriod = shiftPeriod(period, -1);
  const previous = await getExpenseByCategory(userId, previousPeriod);
  const previousById = new Map(previous.map((p) => [p.categoryId, p.amount]));

  return top.map((item) => {
    const previousAmount = previousById.get(item.categoryId) ?? 0n;
    const changePercent =
      previousAmount === 0n ? null : (Number(item.amount - previousAmount) / Number(previousAmount)) * 100;
    return { ...item, previousAmount, changePercent };
  });
}

// --- 4. Cash flow ------------------------------------------------------------

export interface CashFlowPoint {
  date: string;
  net: Money;
  cumulative: Money;
}

/**
 * `getCashFlow(userId, period)` — todo.md, "saldo kumulatif harian". Every
 * calendar day of `period` gets a point, even days with zero net movement —
 * a flat line segment is still meaningful (nothing happened), and a chart
 * with gapped x-values would misrepresent the day-to-day spacing.
 */
export async function getCashFlow(userId: string, period: string): Promise<CashFlowPoint[]> {
  const tz = await resolveUserTimezone(userId);
  const range = localMonthRange(period, tz);
  const { from, to } = periodDateRange(period);

  const rows = await dbRead
    .select({ type: transactions.type, amount: transactions.amount, transactionDate: transactions.transactionDate })
    .from(transactions)
    .where(
      and(
        ownedBy(transactions, userId),
        sql`${transactions.type} IN ('income', 'expense')`,
        isNull(transactions.voidedAt),
        gte(transactions.transactionDate, range.start),
        lt(transactions.transactionDate, range.end),
      ),
    );

  const netByDay = new Map<string, Money>();
  for (const row of rows) {
    const day = toLocalDate(row.transactionDate, tz);
    const delta = row.type === 'income' ? row.amount : -row.amount;
    netByDay.set(day, (netByDay.get(day) ?? 0n) + delta);
  }

  const days = enumerateDays(from, to);
  let cumulative = 0n;
  return days.map((date) => {
    const net = netByDay.get(date) ?? 0n;
    cumulative += net;
    return { date, net, cumulative };
  });
}

function enumerateDays(from: string, to: string): string[] {
  const days: string[] = [];
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  for (let ms = start; ms <= end; ms += 86_400_000) {
    days.push(new Date(ms).toISOString().slice(0, 10));
  }
  return days;
}

// --- 5. Savings growth -------------------------------------------------------

export interface SavingsGrowthPoint {
  period: string;
  label: string;
  /** Net contribution during this period alone (deposits minus withdrawals). */
  contribution: Money;
  /** Running total savings AS OF THE END of this period. The last point
   * always equals `getTotalSavings(userId)` exactly — see this file's
   * header. */
  cumulative: Money;
}

/**
 * `getSavingsGrowth(userId, months)` — todo.md, "Σ kontribusi non-void".
 * Anchored to `getTotalSavings` (see file header) rather than re-deriving
 * the grand total from a date-bounded query: the LAST point is set to that
 * exact figure, and earlier points are derived by walking backward,
 * subtracting each month's own net contribution — so the parity with net
 * worth holds by construction, not by hoping two independently-written date
 * ranges happen to cover the exact same rows.
 */
export async function getSavingsGrowth(
  userId: string,
  months = 6,
  now: Date = new Date(),
): Promise<SavingsGrowthPoint[]> {
  const tz = await resolveUserTimezone(userId);
  const periods = trailingPeriods(months, now, tz);
  const range = spanningRange(periods, tz);

  const [rows, totalToDate] = await Promise.all([
    dbRead
      .select({ amount: savingsContributions.amount, contributionDate: savingsContributions.contributionDate })
      .from(savingsContributions)
      .where(
        and(
          eq(savingsContributions.userId, userId),
          isNull(savingsContributions.voidedAt),
          gte(savingsContributions.contributionDate, range.start),
          lt(savingsContributions.contributionDate, range.end),
        ),
      ),
    getTotalSavings(userId),
  ]);

  const contributionByPeriod = new Map<string, Money>(periods.map((p) => [p, 0n]));
  for (const row of rows) {
    const period = toLocalMonth(row.contributionDate, tz);
    const bucket = contributionByPeriod.get(period);
    if (bucket === undefined) continue;
    contributionByPeriod.set(period, bucket + row.amount);
  }

  // Walk backward from the anchored, exact total.
  const cumulativeByPeriod = new Map<string, Money>();
  let runningCumulative = totalToDate;
  for (let i = periods.length - 1; i >= 0; i--) {
    const period = periods[i]!;
    cumulativeByPeriod.set(period, runningCumulative);
    runningCumulative -= contributionByPeriod.get(period)!;
  }

  return periods.map((period) => ({
    period,
    label: shortMonthLabel(period),
    contribution: contributionByPeriod.get(period)!,
    cumulative: cumulativeByPeriod.get(period)!,
  }));
}

// --- Composite: period summary (powers GET /api/reports/summary) -----------

export interface PeriodSummary {
  income: Money;
  expense: Money;
  net: Money;
  byCategory: CategoryExpenseItem[];
  dailySeries: CashFlowPoint[];
}

/** Backs `GET /api/reports/summary` (docs/06-api-contracts.md §6). Composes
 * this file's own building blocks rather than re-querying — `income`/
 * `expense` come from the SAME `getIncomeVsExpense` row a caller looking at
 * the 6-month chart would see for this exact period, so the two never
 * disagree. */
export async function getPeriodSummary(userId: string, period: string): Promise<PeriodSummary> {
  const [monthly, byCategory, dailySeries] = await Promise.all([
    getIncomeVsExpenseForPeriod(userId, period),
    getExpenseByCategory(userId, period),
    getCashFlow(userId, period),
  ]);

  return {
    income: monthly.income,
    expense: monthly.expense,
    net: monthly.income - monthly.expense,
    byCategory,
    dailySeries,
  };
}

async function getIncomeVsExpenseForPeriod(userId: string, period: string): Promise<{ income: Money; expense: Money }> {
  const [row] = await getIncomeVsExpense(userId, 1, localMonthRangeAnchor(period));
  return { income: row?.income ?? 0n, expense: row?.expense ?? 0n };
}

/** A `Date` guaranteed to fall inside `period`'s local calendar month, for
 * feeding `getIncomeVsExpense(userId, 1, anchor)` when the caller wants ONE
 * specific period rather than "the last N months ending now". Uses
 * `Asia/Jakarta` purely to pick a safely-mid-month instant — the actual
 * timezone-correct boundary math happens inside `getIncomeVsExpense` itself
 * via the caller's real `users.timezone`. */
function localMonthRangeAnchor(period: string): Date {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 15, 12, 0, 0));
}

export { periodDateRange };

// --- History depth (empty-state gate) ---------------------------------------

/** Earliest non-void transaction date for `userId`, or `null` for a brand
 * new account — feeds `hasEnoughHistory` (src/lib/finance/report-aggregation.ts),
 * todo.md's "Empty state: data < 7 hari". */
export async function getEarliestTransactionDate(userId: string): Promise<Date | null> {
  const [row] = await dbRead
    .select({ earliest: sql<Date | null>`MIN(${transactions.transactionDate})` })
    .from(transactions)
    .where(and(ownedBy(transactions, userId), isNull(transactions.voidedAt)));
  return row?.earliest ?? null;
}
