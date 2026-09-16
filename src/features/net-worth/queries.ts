/**
 * Net worth reads — `dbRead` only (docs/11-tech-architecture.md §2).
 *
 * This module composes every prior wealth feature's own queries rather than
 * reimplementing their arithmetic — task 19's spec.md is explicit that this
 * is exactly the place earlier tasks' double-counting bugs would surface,
 * so re-deriving a figure here instead of reusing the module that already
 * owns it would defeat that purpose:
 *   - Savings   → src/features/savings/queries.ts `getTotalSavings` (task 15)
 *   - Gold      → src/features/assets/gold/queries.ts `getGoldHoldingsSummary`,
 *                 which already values ONLY at the buyback price (task 16, ADR-007)
 *   - Deposits  → src/features/assets/deposits/queries.ts `getTotalDepositValue`,
 *                 which already excludes accrued interest (task 17, I10)
 *   - Debts/Receivables → src/features/obligations/queries.ts `getTotalDebt`/
 *                 `getTotalReceivable` (task 18)
 *   - Preference → src/features/settings/queries.ts `getUserPreferences`
 *                 (`count_receivables_as_asset`, ADR-010, task 18)
 *
 * The one component with no prior owner is the wallet asset/liability split
 * (cash/bank/ewallet split by sign, credit cards always a liability) and
 * "other assets" (property/vehicle/other) — both computed directly here.
 *
 * Household aggregation uses `householdWealthJoin`/`notExcludedFromHousehold`
 * (src/lib/visibility/household-items.ts) for EVERY source table — the only
 * place allowed to decide "does this item count toward this household's
 * wealth". Two sources (savings, gold, deposits) need `userId` and
 * `excludeFromHousehold` from DIFFERENT tables (a contribution's own
 * contributor vs. its goal's exclude flag; a lot's own owner vs. its
 * asset's exclude flag) — `householdWealthJoin`/`notExcludedFromHousehold`
 * only need `{ userId, excludeFromHousehold }` shaped input, so a small
 * object literal combining the two real columns satisfies that shape
 * without hand-rolling a parallel join condition.
 */
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import {
  assets,
  debts,
  deposits,
  goldLots,
  goldPrices,
  householdMembers,
  netWorthSnapshots,
  householdNetWorthSnapshots,
  receivables,
  savingsContributions,
  savingsGoals,
  users,
  wallets,
} from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import { householdWealthJoin, notExcludedFromHousehold } from '@/lib/visibility/household-items';
import { DEFAULT_TIMEZONE, toLocalDate } from '@/lib/date/timezone';
import type { Money } from '@/lib/finance/money';
import { deserializeMoney } from '@/lib/finance/money';
import { currentValue, parseGrams, type Grams } from '@/lib/finance/gold';
import {
  calculateNetWorth,
  type NetWorthAssetBreakdown,
  type NetWorthLiabilityBreakdown,
  type NetWorthResult,
} from '@/lib/finance/net-worth';
import {
  calculateHouseholdNetWorth,
  type HouseholdMemberNetWorthInput,
  type HouseholdNetWorthResult,
} from '@/lib/finance/household-net-worth';
import { getTotalSavings } from '@/features/savings/queries';
import { getGoldHoldingsSummary } from '@/features/assets/gold/queries';
import { getTotalDepositValue } from '@/features/assets/deposits/queries';
import { getTotalDebt, getTotalReceivable } from '@/features/obligations/queries';
import { getUserPreferences } from '@/features/settings/queries';

// --- Personal ------------------------------------------------------------

interface WalletSplit {
  cashAssets: Money;
  cashLiabilities: Money;
  creditCardLiabilities: Money;
}

/**
 * Splits every non-archived wallet's balance into the three lines spec.md's
 * Komponen table calls for. Archived wallets still count — archiving only
 * hides a wallet from pickers/the "Total Kas" display (docs/03 §6.3); it
 * doesn't close the account or zero the balance, so the money it holds is
 * still real net worth. This is a deliberate divergence from
 * src/features/wallets/queries.ts's `listWallets().totalCash`, which exists
 * to answer a different question ("what can I spend right now").
 */
async function getWalletSplit(userId: string): Promise<WalletSplit> {
  const [row] = await dbRead
    .select({
      cashAssets: sql<string>`COALESCE(SUM(CASE WHEN ${wallets.type} <> 'credit_card' AND ${wallets.balance} > 0 THEN ${wallets.balance} ELSE 0 END), 0)`,
      cashLiabilities: sql<string>`COALESCE(SUM(CASE WHEN ${wallets.type} <> 'credit_card' AND ${wallets.balance} < 0 THEN -${wallets.balance} ELSE 0 END), 0)`,
      creditCardLiabilities: sql<string>`COALESCE(SUM(CASE WHEN ${wallets.type} = 'credit_card' THEN ABS(${wallets.balance}) ELSE 0 END), 0)`,
    })
    .from(wallets)
    .where(ownedBy(wallets, userId));

  return {
    cashAssets: BigInt(row?.cashAssets ?? '0'),
    cashLiabilities: BigInt(row?.cashLiabilities ?? '0'),
    creditCardLiabilities: BigInt(row?.creditCardLiabilities ?? '0'),
  };
}

/** Σ assets.cached_value WHERE asset_type NOT IN ('gold','deposit') AND
 * status='active' — docs/03 §14.1's "aset_lain" line (property/vehicle/
 * other). No creation UI exists for these yet, so this is `0n` for
 * essentially every user today; the formula still accounts for it. */
async function getTotalOtherAssets(userId: string): Promise<Money> {
  const [row] = await dbRead
    .select({ total: sql<string>`COALESCE(SUM(${assets.cachedValue}), 0)` })
    .from(assets)
    .where(and(ownedBy(assets, userId), eq(assets.status, 'active'), sql`${assets.assetType} NOT IN ('gold','deposit')`));
  return BigInt(row?.total ?? '0');
}

/**
 * `getNetWorth(userId)` (todo.md) — gathers every source and hands them to
 * `calculateNetWorth` (src/lib/finance/net-worth.ts), which does the actual
 * arithmetic. This function's own job is ONLY fetching; it makes no
 * decisions about what counts.
 */
export async function getNetWorth(userId: string): Promise<NetWorthResult> {
  const [walletSplit, totalSavings, goldSummary, totalDepositValue, totalOtherAssets, totalDebts, totalReceivables, preferences] =
    await Promise.all([
      getWalletSplit(userId),
      getTotalSavings(userId),
      getGoldHoldingsSummary(userId),
      getTotalDepositValue(userId),
      getTotalOtherAssets(userId),
      getTotalDebt(userId),
      getTotalReceivable(userId),
      getUserPreferences(userId),
    ]);

  return calculateNetWorth({
    totalCashAssets: walletSplit.cashAssets,
    totalCashLiabilities: walletSplit.cashLiabilities,
    totalCreditCardLiabilities: walletSplit.creditCardLiabilities,
    totalSavings,
    totalGoldValue: goldSummary.currentValue,
    totalDepositValue,
    totalOtherAssets,
    totalDebts,
    totalReceivables,
    countReceivablesAsAsset: preferences.countReceivablesAsAsset,
  });
}

export interface CompositionItem {
  key: string;
  label: string;
  amount: Money;
  /** Where tapping this row navigates — spec.md: "penelusuran adalah yang
   * membuat angka ini dipercaya". */
  href: string;
}

const ASSET_LABELS: Record<keyof NetWorthAssetBreakdown, { label: string; href: string }> = {
  deposits: { label: 'Deposito', href: '/wealth/assets/deposits' },
  gold: { label: 'Emas', href: '/wealth/assets/gold' },
  savings: { label: 'Tabungan', href: '/wealth/savings' },
  cash: { label: 'Kas', href: '/wallets' },
  otherAssets: { label: 'Aset Lain', href: '/wallets' },
  receivables: { label: 'Piutang', href: '/wealth/debts' },
};

const LIABILITY_LABELS: Record<keyof NetWorthLiabilityBreakdown, { label: string; href: string }> = {
  debts: { label: 'Hutang', href: '/wealth/debts' },
  creditCards: { label: 'Kartu Kredit', href: '/wallets' },
  cashOverdraft: { label: 'Saldo Minus', href: '/wallets' },
};

/** Non-zero asset composition rows, largest first — docs/09-screen-specs.md
 * §8's exact ordering (Deposito 37% · Emas 32% · Tabungan 19% · Kas 12%). */
export function buildAssetComposition(breakdown: NetWorthAssetBreakdown): CompositionItem[] {
  return (Object.keys(ASSET_LABELS) as (keyof NetWorthAssetBreakdown)[])
    .map((key) => ({ key, amount: breakdown[key], ...ASSET_LABELS[key] }))
    .filter((item) => item.amount > 0n)
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
}

/** Non-zero liability composition rows, largest first. */
export function buildLiabilityComposition(breakdown: NetWorthLiabilityBreakdown): CompositionItem[] {
  return (Object.keys(LIABILITY_LABELS) as (keyof NetWorthLiabilityBreakdown)[])
    .map((key) => ({ key, amount: breakdown[key], ...LIABILITY_LABELS[key] }))
    .filter((item) => item.amount > 0n)
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
}

// --- Household -------------------------------------------------------------

export interface HouseholdRosterMember {
  userId: string;
  name: string | null;
  sharing: boolean;
}

/** Every ACTIVE member of the household, sharing or not — the roster
 * `calculateHouseholdNetWorth` needs so a non-sharing member still appears,
 * labeled, per ADR-029. */
async function listActiveMembersWithSharing(householdId: string): Promise<HouseholdRosterMember[]> {
  const rows = await dbRead
    .select({ userId: householdMembers.userId, name: users.name, sharing: householdMembers.shareWealth })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.status, 'active')));
  return rows;
}

/** Wallet split (see `getWalletSplit` above), grouped per sharing member —
 * only rows passing `householdWealthJoin`/`notExcludedFromHousehold` appear
 * at all, so a non-sharing or excluded wallet never reaches this map. */
async function walletTotalsByMember(householdId: string): Promise<Map<string, WalletSplit>> {
  const rows = await dbRead
    .select({
      userId: wallets.userId,
      cashAssets: sql<string>`COALESCE(SUM(CASE WHEN ${wallets.type} <> 'credit_card' AND ${wallets.balance} > 0 THEN ${wallets.balance} ELSE 0 END), 0)`,
      cashLiabilities: sql<string>`COALESCE(SUM(CASE WHEN ${wallets.type} <> 'credit_card' AND ${wallets.balance} < 0 THEN -${wallets.balance} ELSE 0 END), 0)`,
      creditCardLiabilities: sql<string>`COALESCE(SUM(CASE WHEN ${wallets.type} = 'credit_card' THEN ABS(${wallets.balance}) ELSE 0 END), 0)`,
    })
    .from(wallets)
    .innerJoin(householdMembers, householdWealthJoin(wallets, householdId))
    .where(notExcludedFromHousehold(wallets))
    .groupBy(wallets.userId);

  return new Map(
    rows.map((r) => [
      r.userId,
      { cashAssets: BigInt(r.cashAssets), cashLiabilities: BigInt(r.cashLiabilities), creditCardLiabilities: BigInt(r.creditCardLiabilities) },
    ]),
  );
}

/** Σ non-void contribution amount per CONTRIBUTOR (`savings_contributions.user_id`)
 * — mirrors `getTotalSavings`'s own "whoever put the money in, wherever it
 * went" semantics, gated by the CONTRIBUTOR's own sharing status and the
 * GOAL's own `exclude_from_household` (the two live on different tables —
 * see this file's header comment). */
async function savingsTotalsByMember(householdId: string): Promise<Map<string, Money>> {
  const virtualTable = { userId: savingsContributions.userId, excludeFromHousehold: savingsGoals.excludeFromHousehold };
  const rows = await dbRead
    .select({ userId: savingsContributions.userId, total: sql<string>`COALESCE(SUM(${savingsContributions.amount}), 0)` })
    .from(savingsContributions)
    .innerJoin(savingsGoals, eq(savingsGoals.id, savingsContributions.savingsGoalId))
    .innerJoin(householdMembers, householdWealthJoin(virtualTable, householdId))
    .where(and(notExcludedFromHousehold(virtualTable), sql`${savingsContributions.voidedAt} IS NULL`))
    .groupBy(savingsContributions.userId);

  return new Map(rows.map((r) => [r.userId, BigInt(r.total)]));
}

/** Σ remaining_grams per gold-lot OWNER, gated by that lot's own asset's
 * `exclude_from_household` — see this file's header comment. */
async function goldGramsByMember(householdId: string): Promise<Map<string, Grams>> {
  const virtualTable = { userId: goldLots.userId, excludeFromHousehold: assets.excludeFromHousehold };
  const rows = await dbRead
    .select({ userId: goldLots.userId, grams: sql<string>`COALESCE(SUM(${goldLots.remainingGrams}), 0)` })
    .from(goldLots)
    .innerJoin(assets, eq(assets.id, goldLots.assetId))
    .innerJoin(householdMembers, householdWealthJoin(virtualTable, householdId))
    .where(and(notExcludedFromHousehold(virtualTable), eq(assets.status, 'active')))
    .groupBy(goldLots.userId);

  return new Map(rows.map((r) => [r.userId, parseGrams(r.grams)]));
}

/** Each member's own most recent buyback price — gold is ALWAYS valued at
 * ITS OWNER's own latest recorded price (there is no single household-wide
 * gold price), reusing `currentValue` (src/lib/finance/gold.ts, ADR-007)
 * exactly as the personal path does via `getGoldHoldingsSummary`. */
async function latestGoldBuybackPriceByMember(userIds: string[]): Promise<Map<string, Money>> {
  if (userIds.length === 0) return new Map();
  // No `DISTINCT ON` support in this drizzle-orm version's pg-core query
  // builder, and a raw-SQL `= ANY($1)` template doesn't bind a JS array as
  // a valid Postgres array literal here (caused a real
  // "malformed array literal" runtime error, caught by this task's own
  // reconciliation test). Fetch every matching row ordered newest-first
  // instead and keep only the first (most recent) occurrence per user —
  // same result as `DISTINCT ON`, and household size keeps the row count
  // small enough that this is cheap.
  const rows = await dbRead
    .select({ userId: goldPrices.userId, buybackPricePerGram: goldPrices.buybackPricePerGram })
    .from(goldPrices)
    .where(inArray(goldPrices.userId, userIds))
    .orderBy(desc(goldPrices.priceDate));

  const result = new Map<string, Money>();
  for (const row of rows) {
    if (!result.has(row.userId)) {
      result.set(row.userId, row.buybackPricePerGram);
    }
  }
  return result;
}

/** Σ principal of `active` deposits per OWNER, gated by the deposit's own
 * asset's `exclude_from_household` — mirrors `getTotalDepositValue`'s
 * principal-only, active-only rule (task 17, I10) exactly. */
async function depositPrincipalByMember(householdId: string): Promise<Map<string, Money>> {
  const virtualTable = { userId: deposits.userId, excludeFromHousehold: assets.excludeFromHousehold };
  const rows = await dbRead
    .select({ userId: deposits.userId, total: sql<string>`COALESCE(SUM(${deposits.principal}), 0)` })
    .from(deposits)
    .innerJoin(assets, eq(assets.id, deposits.assetId))
    .innerJoin(householdMembers, householdWealthJoin(virtualTable, householdId))
    .where(and(notExcludedFromHousehold(virtualTable), eq(deposits.status, 'active')))
    .groupBy(deposits.userId);

  return new Map(rows.map((r) => [r.userId, BigInt(r.total)]));
}

/** Σ cached_value of `active` non-gold/deposit assets per owner. */
async function otherAssetsByMember(householdId: string): Promise<Map<string, Money>> {
  const rows = await dbRead
    .select({ userId: assets.userId, total: sql<string>`COALESCE(SUM(${assets.cachedValue}), 0)` })
    .from(assets)
    .innerJoin(householdMembers, householdWealthJoin(assets, householdId))
    .where(and(notExcludedFromHousehold(assets), eq(assets.status, 'active'), sql`${assets.assetType} NOT IN ('gold','deposit')`))
    .groupBy(assets.userId);

  return new Map(rows.map((r) => [r.userId, BigInt(r.total)]));
}

/** Σ remaining_amount of live debts per owner — ALWAYS a liability. */
async function debtsByMember(householdId: string): Promise<Map<string, Money>> {
  const rows = await dbRead
    .select({ userId: debts.userId, total: sql<string>`COALESCE(SUM(${debts.remainingAmount}), 0)` })
    .from(debts)
    .innerJoin(householdMembers, householdWealthJoin(debts, householdId))
    .where(and(notExcludedFromHousehold(debts), sql`${debts.status} IN ('active','partially_paid')`))
    .groupBy(debts.userId);

  return new Map(rows.map((r) => [r.userId, BigInt(r.total)]));
}

interface ReceivableTotal {
  remaining: Money;
  countAsAsset: boolean;
}

/** Σ remaining_amount of live receivables per owner, PLUS that owner's own
 * `count_receivables_as_asset` preference (ADR-010 is a personal setting —
 * each member's receivables count toward the household total according to
 * THEIR OWN preference, never the viewer's). */
async function receivablesByMember(householdId: string): Promise<Map<string, ReceivableTotal>> {
  const rows = await dbRead
    .select({
      userId: receivables.userId,
      total: sql<string>`COALESCE(SUM(${receivables.remainingAmount}), 0)`,
      countReceivablesAsAsset: users.countReceivablesAsAsset,
    })
    .from(receivables)
    .innerJoin(householdMembers, householdWealthJoin(receivables, householdId))
    .innerJoin(users, eq(users.id, receivables.userId))
    .where(and(notExcludedFromHousehold(receivables), sql`${receivables.status} IN ('active','partially_paid')`))
    .groupBy(receivables.userId, users.countReceivablesAsAsset);

  return new Map(rows.map((r) => [r.userId, { remaining: BigInt(r.total), countAsAsset: r.countReceivablesAsAsset }]));
}

export interface HouseholdNetWorthOverview extends HouseholdNetWorthResult {
  /** Household-wide composition — the SAME shape as the personal
   * `NetWorthResult.breakdown`, summed across sharing members only, for the
   * "Komposisi" section on `/household/[id]/net-worth`
   * (docs/09-screen-specs.md §16). */
  composition: {
    assets: NetWorthAssetBreakdown;
    liabilities: NetWorthLiabilityBreakdown;
  };
}

const ZERO_ASSETS: NetWorthAssetBreakdown = { cash: 0n, savings: 0n, gold: 0n, deposits: 0n, otherAssets: 0n, receivables: 0n };
const ZERO_LIABILITIES: NetWorthLiabilityBreakdown = { cashOverdraft: 0n, creditCards: 0n, debts: 0n };

function addAssets(a: NetWorthAssetBreakdown, b: NetWorthAssetBreakdown): NetWorthAssetBreakdown {
  return {
    cash: a.cash + b.cash,
    savings: a.savings + b.savings,
    gold: a.gold + b.gold,
    deposits: a.deposits + b.deposits,
    otherAssets: a.otherAssets + b.otherAssets,
    receivables: a.receivables + b.receivables,
  };
}

function addLiabilities(a: NetWorthLiabilityBreakdown, b: NetWorthLiabilityBreakdown): NetWorthLiabilityBreakdown {
  return { cashOverdraft: a.cashOverdraft + b.cashOverdraft, creditCards: a.creditCards + b.creditCards, debts: a.debts + b.debts };
}

/**
 * `getHouseholdNetWorth(householdId)` (todo.md) — every source queried
 * through `householdWealthJoin`/`notExcludedFromHousehold`, grouped by
 * member, and only THEN summed for the total (spec.md's explicit ordering
 * — per-member first, sum second, never the other way around). The caller
 * (route handler / page) is expected to already sit behind
 * `requireHouseholdAccess`/`requireHouseholdMember` — this function itself
 * doesn't re-verify membership, same convention as every other query under
 * src/features/household/**.
 */
export async function getHouseholdNetWorth(householdId: string): Promise<HouseholdNetWorthOverview> {
  const roster = await listActiveMembersWithSharing(householdId);

  const [walletTotals, savingsTotals, gramsByMember, depositTotals, otherAssetTotals, debtTotals, receivableTotals] = await Promise.all([
    walletTotalsByMember(householdId),
    savingsTotalsByMember(householdId),
    goldGramsByMember(householdId),
    depositPrincipalByMember(householdId),
    otherAssetsByMember(householdId),
    debtsByMember(householdId),
    receivablesByMember(householdId),
  ]);
  const priceByMember = await latestGoldBuybackPriceByMember([...gramsByMember.keys()]);

  let compositionAssets = ZERO_ASSETS;
  let compositionLiabilities = ZERO_LIABILITIES;

  const members: HouseholdMemberNetWorthInput[] = roster.map((m) => {
    const wallet = walletTotals.get(m.userId) ?? { cashAssets: 0n, cashLiabilities: 0n, creditCardLiabilities: 0n };
    const savings = savingsTotals.get(m.userId) ?? 0n;
    const grams = gramsByMember.get(m.userId) ?? 0n;
    const buyback = priceByMember.get(m.userId);
    const gold = buyback !== undefined ? currentValue(grams, buyback) : 0n;
    const depositValue = depositTotals.get(m.userId) ?? 0n;
    const otherAssetsValue = otherAssetTotals.get(m.userId) ?? 0n;
    const debtValue = debtsByMemberValue(debtTotals, m.userId);
    const receivable = receivableTotals.get(m.userId);
    const receivableAsAsset = receivable && receivable.countAsAsset ? receivable.remaining : 0n;

    const assetsBreakdown: NetWorthAssetBreakdown = {
      cash: wallet.cashAssets,
      savings,
      gold,
      deposits: depositValue,
      otherAssets: otherAssetsValue,
      receivables: receivableAsAsset,
    };
    const liabilitiesBreakdown: NetWorthLiabilityBreakdown = {
      cashOverdraft: wallet.cashLiabilities,
      creditCards: wallet.creditCardLiabilities,
      debts: debtValue,
    };

    if (m.sharing) {
      compositionAssets = addAssets(compositionAssets, assetsBreakdown);
      compositionLiabilities = addLiabilities(compositionLiabilities, liabilitiesBreakdown);
    }

    const assetsTotal = assetsBreakdown.cash + assetsBreakdown.savings + assetsBreakdown.gold + assetsBreakdown.deposits + assetsBreakdown.otherAssets + assetsBreakdown.receivables;
    const liabilitiesTotal = liabilitiesBreakdown.cashOverdraft + liabilitiesBreakdown.creditCards + liabilitiesBreakdown.debts;

    return { userId: m.userId, name: m.name, sharing: m.sharing, assets: assetsTotal, liabilities: liabilitiesTotal };
  });

  const result = calculateHouseholdNetWorth(members);
  return { ...result, composition: { assets: compositionAssets, liabilities: compositionLiabilities } };
}

function debtsByMemberValue(map: Map<string, Money>, userId: string): Money {
  return map.get(userId) ?? 0n;
}

// --- History ---------------------------------------------------------------

export type NetWorthHistoryRange = '3m' | '6m' | '1y' | 'all';

const MONTHS_BY_RANGE: Record<Exclude<NetWorthHistoryRange, 'all'>, number> = { '3m': 3, '6m': 6, '1y': 12 };

/** `dateStr` (`YYYY-MM-DD`) shifted by `monthsDelta` whole months, clamping
 * the day to the target month's length — same day-overflow-normalizing
 * approach as src/lib/date/timezone.ts's `shiftPeriod`, extended to also
 * carry the day-of-month (that helper only ever shifts a `YYYY-MM` period,
 * never a full date). */
function shiftDateStrByMonths(dateStr: string, monthsDelta: number): string {
  const parts = dateStr.split('-').map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  const totalMonthsZeroBased = y * 12 + (m - 1) + monthsDelta;
  const year = Math.floor(totalMonthsZeroBased / 12);
  const month = (totalMonthsZeroBased % 12) + 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, daysInMonth);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function rangeCutoff(range: NetWorthHistoryRange, now: Date, tz: string): string | null {
  if (range === 'all') return null;
  return shiftDateStrByMonths(toLocalDate(now, tz), -MONTHS_BY_RANGE[range]);
}

export interface NetWorthSnapshotPoint {
  date: string;
  netWorth: Money;
  totalAssets: Money;
  totalLiabilities: Money;
  breakdown: unknown;
}

/** `getNetWorthHistory(userId, range)` (todo.md) — reads
 * `net_worth_snapshots` directly; never reconstructed from anything else. */
export async function getNetWorthHistory(
  userId: string,
  range: NetWorthHistoryRange,
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): Promise<NetWorthSnapshotPoint[]> {
  const cutoff = rangeCutoff(range, now, tz);
  const rows = await dbRead
    .select({
      date: netWorthSnapshots.snapshotDate,
      netWorth: netWorthSnapshots.netWorth,
      totalAssets: netWorthSnapshots.totalAssets,
      totalLiabilities: netWorthSnapshots.totalLiabilities,
      breakdown: netWorthSnapshots.breakdown,
    })
    .from(netWorthSnapshots)
    .where(and(eq(netWorthSnapshots.userId, userId), cutoff ? gte(netWorthSnapshots.snapshotDate, cutoff) : undefined))
    .orderBy(asc(netWorthSnapshots.snapshotDate));
  return rows;
}

export interface HouseholdNetWorthSnapshotPoint extends NetWorthSnapshotPoint {
  memberCount: number;
  contributingCount: number;
}

/** `getHouseholdNetWorthHistory(householdId, range)` (todo.md) — reads
 * `household_net_worth_snapshots` directly; NEVER reconstructed from
 * `net_worth_snapshots` (spec.md: "Snapshot household tidak direkonstruksi
 * dari snapshot pribadi" — sharing scope changes at any time, and
 * recomputing later would produce a historical figure nobody was ever
 * actually shown). `contributingCount` is what lets the chart mark the
 * points where sharing coverage changed. */
export async function getHouseholdNetWorthHistory(
  householdId: string,
  range: NetWorthHistoryRange,
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): Promise<HouseholdNetWorthSnapshotPoint[]> {
  const cutoff = rangeCutoff(range, now, tz);
  const rows = await dbRead
    .select({
      date: householdNetWorthSnapshots.snapshotDate,
      netWorth: householdNetWorthSnapshots.netWorth,
      totalAssets: householdNetWorthSnapshots.totalAssets,
      totalLiabilities: householdNetWorthSnapshots.totalLiabilities,
      breakdown: householdNetWorthSnapshots.breakdown,
      memberCount: householdNetWorthSnapshots.memberCount,
      contributingCount: householdNetWorthSnapshots.contributingCount,
    })
    .from(householdNetWorthSnapshots)
    .where(
      and(
        eq(householdNetWorthSnapshots.householdId, householdId),
        cutoff ? gte(householdNetWorthSnapshots.snapshotDate, cutoff) : undefined,
      ),
    )
    .orderBy(asc(householdNetWorthSnapshots.snapshotDate));
  return rows;
}

/** Re-hydrates a stored snapshot's `breakdown` jsonb (money serialized as
 * decimal strings, per `serializeMoney` — see src/lib/services/net-worth-snapshot.ts)
 * back into bigints for display. Defensive against a missing/malformed key
 * (returns `0n`) so a snapshot written by an older shape of this module
 * never crashes a history chart. */
export function deserializeAssetBreakdown(raw: unknown): NetWorthAssetBreakdown {
  const obj = (raw as Record<string, unknown>) ?? {};
  const get = (key: string) => (typeof obj[key] === 'string' ? deserializeMoney(obj[key] as string) : 0n);
  return { cash: get('cash'), savings: get('savings'), gold: get('gold'), deposits: get('deposits'), otherAssets: get('otherAssets'), receivables: get('receivables') };
}

export function deserializeLiabilityBreakdown(raw: unknown): NetWorthLiabilityBreakdown {
  const obj = (raw as Record<string, unknown>) ?? {};
  const get = (key: string) => (typeof obj[key] === 'string' ? deserializeMoney(obj[key] as string) : 0n);
  return { cashOverdraft: get('cashOverdraft'), creditCards: get('creditCards'), debts: get('debts') };
}
