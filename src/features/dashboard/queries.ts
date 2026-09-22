/**
 * Dashboard reads — `dbRead` only (docs/11-tech-architecture.md §2).
 *
 * `getDashboardData` is the "satu query gabungan" todo.md/spec.md call for:
 * wallet cash total, current-month income/expense, net worth (headline +
 * trend for the hero's delta/sparkline), and the 5 most recent transactions
 * — fetched together via ONE `Promise.all` so `dbRead` (neon-http, where
 * EVERY statement is its own HTTP request — src/lib/db/read.ts's own file
 * header) fires them concurrently instead of one-after-another. This
 * mirrors the exact "composite fetch" shape already established by
 * src/features/transactions/sheet-data.ts's `getAddTransactionSheetData`
 * and by `getNetWorth` itself (src/features/net-worth/queries.ts) — fusing
 * these four into one literal raw SQL statement isn't attempted anywhere
 * else in this codebase, because the shapes don't share a FROM clause (a
 * wallet aggregate, a transaction aggregate, snapshot history rows, and a
 * transaction+category+wallet join), and `getRecentTransactions`'s own
 * header comment explains why even "5 recent transactions" alone is kept
 * as a MERGE of two separately-shaped queries rather than one.
 *
 * The headline net worth number is LIVE (`getNetWorth`), not the latest
 * *stored* snapshot — the snapshot cron only runs once daily (23:55 WIB,
 * src/lib/services/net-worth-snapshot.ts), so leaning on a stored row would
 * make the one screen whose entire purpose is "am I ok RIGHT NOW"
 * permanently up to a day stale (exactly the "angka terasa salah" risk
 * docs/01-product-analysis.md §5 calls out). Stored snapshots
 * (`net_worth_snapshots`) are used ONLY for the delta/sparkline, which is
 * inherently daily-granularity data already — same split `/wealth/net-worth`
 * (src/app/(app)/wealth/net-worth/page.tsx) already uses.
 *
 * Conditional-section data (budget >= 80%, jatuh tempo, savings goals,
 * pending member transfers) is deliberately a SEPARATE function —
 * todo.md lists it as its own parallel group ("Query paralel (bukan
 * waterfall)"), fetched by the page ALONGSIDE `getDashboardData`, not
 * folded inside it.
 */
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { dbRead } from '@/lib/db/read';
import { households, ledgerEntries, transactions, users, wallets } from '@/lib/db/schema';
import { getNetWorth, getNetWorthHistory, type NetWorthHistoryRange } from '@/features/net-worth/queries';
import { listWallets } from '@/features/wallets/queries';
import { getMonthlyTotals, getRecentTransactions, type TransactionListItem } from '@/features/transactions/queries';
import { getBudgetsNeedingAttention, type PersonalBudgetView } from '@/features/budgets/queries';
import { getUpcomingDue, type UpcomingObligation } from '@/features/obligations/queries';
import { listGoals, type SavingsGoalListItem } from '@/features/savings/queries';
import { countUnacknowledged, type ActivityItem } from '@/features/activity/queries';
import { currentLocalPeriod, DEFAULT_TIMEZONE } from '@/lib/date/timezone';
import type { Money } from '@/lib/finance/money';
import type { NetWorthHeroPoint } from '@/components/finance/net-worth-hero';

const RECENT_TRANSACTIONS_LIMIT = 5;
const TREND_FETCH_RANGE: NetWorthHistoryRange = '3m';
const SAVINGS_TILE_LIMIT = 2;
const PENDING_TRANSFER_PREVIEW_LIMIT = 2;

// --- Net worth trend (pure, unit-testable) ----------------------------------

/**
 * Slices `history` (ascending, from `getNetWorthHistory`) down to "the last
 * snapshot of the previous calendar month, through today" — spec.md's exact
 * delta definition ("Delta membandingkan snapshot hari ini dengan snapshot
 * terakhir bulan sebelumnya"). Finds the LAST point still dated before
 * `currentMonthStart` and keeps everything from there onward. Falls back to
 * the full array when no such point exists (a brand-new account with < 1
 * month of history) — `NetWorthHero` itself is what decides whether 2+
 * points is enough to show a delta at all (< 2 hides it, never 0%).
 */
export function buildNetWorthTrend(history: NetWorthHeroPoint[], currentMonthStart: string): NetWorthHeroPoint[] {
  let cutoffIndex = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.date < currentMonthStart) {
      cutoffIndex = i;
      break;
    }
  }
  return cutoffIndex === -1 ? history : history.slice(cutoffIndex);
}

// --- Main combined fetch -----------------------------------------------------

export interface DashboardData {
  /** Σ cash/bank/ewallet balance, active wallets only — EXCLUDES credit
   * cards (spec.md acceptance: "Kas tidak menyertakan kartu kredit"), the
   * same `totalCash` src/features/wallets/queries.ts's `listWallets`
   * already computes for exactly this "what can I spend right now"
   * question (that module's own doc comment). */
  cashTotal: Money;
  monthlyIncome: Money;
  monthlyExpense: Money;
  /** Live-computed — see file header. */
  netWorth: Money;
  /** Oldest-first, sliced to "previous month's last snapshot through
   * today" by `buildNetWorthTrend` — feeds `<NetWorthHero>` directly. */
  netWorthTrend: NetWorthHeroPoint[];
  /** Newest-first, exactly `RECENT_TRANSACTIONS_LIMIT` items (fewer only
   * when the account has fewer transactions than that, ever). */
  recentTransactions: TransactionListItem[];
  hasAnyWallet: boolean;
  /** `true` iff the account has EVER recorded a transaction — derivable
   * from `recentTransactions` alone (it's already "the most recent N", so
   * zero recent means zero ever), kept as its own field so callers never
   * have to re-derive that reasoning themselves. */
  hasAnyTransactionEver: boolean;
}

export async function getDashboardData(
  userId: string,
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): Promise<DashboardData> {
  const period = currentLocalPeriod(now, tz);
  const [yearStr, monthStr] = period.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const currentMonthStart = `${period}-01`;

  const [walletSummary, monthlyTotals, netWorth, history, recentTransactions] = await Promise.all([
    listWallets(userId),
    getMonthlyTotals(userId, { year, month }),
    getNetWorth(userId),
    getNetWorthHistory(userId, TREND_FETCH_RANGE, now, tz),
    getRecentTransactions(userId, RECENT_TRANSACTIONS_LIMIT),
  ]);

  const hasAnyWallet = walletSummary.groups.some((g) => g.wallets.length > 0) || walletSummary.archived.length > 0;

  return {
    cashTotal: walletSummary.totalCash,
    monthlyIncome: monthlyTotals.income,
    monthlyExpense: monthlyTotals.expense,
    netWorth: netWorth.netWorth,
    netWorthTrend: buildNetWorthTrend(
      history.map((h) => ({ date: h.date, netWorth: h.netWorth })),
      currentMonthStart,
    ),
    recentTransactions,
    hasAnyWallet,
    hasAnyTransactionEver: recentTransactions.length > 0,
  };
}

// --- Conditional sections (parallel, not a waterfall) -----------------------

/** Nearest-target-date-first, ACTIVE goals only, capped at
 * `SAVINGS_TILE_LIMIT` — spec.md's "Tabungan: maks 2, diurut target date
 * terdekat". A goal with no target date sorts last (nothing to be "nearest"
 * to). Pure and independently testable. */
export function selectDashboardSavingsGoals(
  goals: SavingsGoalListItem[],
  limit = SAVINGS_TILE_LIMIT,
): SavingsGoalListItem[] {
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

// Duplicated (not imported) from src/features/activity/queries.ts's own
// `sender`/`activitySelection`/`toActivityItem` — docs/11-tech-architecture.md
// §3, "features/A tidak boleh mengimpor dari features/B". This is the exact
// same predicate `countUnacknowledged` uses, just returning display rows
// instead of a count, for the dashboard's "Transfer menunggu" preview.
const dashboardSender = alias(users, 'dashboard_activity_sender');

async function listPendingTransferPreview(userId: string, limit: number): Promise<ActivityItem[]> {
  const rows = await dbRead
    .select({
      id: transactions.id,
      amount: transactions.amount,
      transactionDate: transactions.transactionDate,
      note: transactions.note,
      acknowledgedAt: transactions.acknowledgedAt,
      senderName: dashboardSender.name,
      senderEmail: dashboardSender.email,
      householdName: households.name,
      walletId: wallets.id,
      walletName: wallets.name,
      walletIcon: wallets.icon,
      walletColor: wallets.color,
    })
    .from(transactions)
    .innerJoin(dashboardSender, eq(dashboardSender.id, transactions.createdBy))
    .leftJoin(households, eq(households.id, transactions.householdId))
    .leftJoin(ledgerEntries, and(eq(ledgerEntries.transactionId, transactions.id), isNull(ledgerEntries.voidedAt)))
    .leftJoin(wallets, eq(wallets.id, ledgerEntries.walletId))
    .where(
      and(
        eq(transactions.userId, userId),
        ne(transactions.createdBy, transactions.userId),
        isNull(transactions.voidedAt),
        isNull(transactions.acknowledgedAt),
      ),
    )
    .orderBy(desc(transactions.transactionDate), desc(transactions.id))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    transactionDate: row.transactionDate,
    note: row.note,
    senderName: row.senderName,
    senderEmail: row.senderEmail,
    wallet: row.walletId
      ? { id: row.walletId, name: row.walletName!, icon: row.walletIcon!, color: row.walletColor! }
      : null,
    householdName: row.householdName,
    acknowledgedAt: row.acknowledgedAt,
  }));
}

export interface DashboardConditionalData {
  /** Only budgets whose status is NOT `safe` (>= 80%) — spec.md's "Anggaran"
   * visibility rule. Empty means the section is hidden entirely. */
  budgetsNeedingAttention: PersonalBudgetView[];
  /** Debts/receivables due within 7 days, or already overdue. Empty means
   * "Perlu Perhatian" is hidden entirely. */
  upcomingObligations: UpcomingObligation[];
  /** Already filtered + sorted + capped — see `selectDashboardSavingsGoals`. */
  savingsGoals: SavingsGoalListItem[];
  /** > 0 means "Transfer menunggu" is shown. */
  pendingTransferCount: number;
  pendingTransferPreview: ActivityItem[];
}

/**
 * Every conditionally-shown section's data, fetched in PARALLEL — todo.md:
 * "Query paralel (bukan waterfall): budget ≥ 80%, jatuh tempo ≤ 7 hari, goal
 * aktif, transfer pending". Kept separate from `getDashboardData` (see file
 * header) since spec.md lists these as a distinct group from the "main"
 * combined data.
 */
export async function getDashboardConditionalData(
  userId: string,
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): Promise<DashboardConditionalData> {
  const period = currentLocalPeriod(now, tz);

  const [budgetsNeedingAttention, upcomingObligations, goals, pendingTransferCount, pendingTransferPreview] =
    await Promise.all([
      getBudgetsNeedingAttention(userId, period),
      getUpcomingDue(userId, 7, now, tz),
      listGoals(userId),
      countUnacknowledged(userId),
      listPendingTransferPreview(userId, PENDING_TRANSFER_PREVIEW_LIMIT),
    ]);

  return {
    budgetsNeedingAttention,
    upcomingObligations,
    savingsGoals: selectDashboardSavingsGoals(goals),
    pendingTransferCount,
    pendingTransferPreview,
  };
}
