/**
 * Net worth composition — docs/03-domain-model.md §14.1,
 * tasks/19-net-worth/spec.md's Komponen table.
 *
 * Task 19 now owns the full picture (gold, deposits, other assets,
 * credit-card liabilities, negative-balance cash/bank/ewallet wallets as
 * liabilities) — this file replaces the task 15/18 partial seed its own
 * previous header described. Every field below traces to exactly one row of
 * spec.md's Komponen table, checked one at a time per that table's own
 * instruction ("Yang mudah salah dan harus diperiksa satu per satu").
 *
 * Pure module: no I/O (docs/11-tech-architecture.md §3, same discipline as
 * ledger.ts/money.ts/transfer.ts/savings.ts/obligation.ts/gold.ts in this
 * directory) — callers fetch every aggregate figure themselves (`dbRead`,
 * src/features/net-worth/queries.ts) and pass it in here. This module never
 * decides WHICH rows count (that's the query layer's job, using
 * src/lib/visibility/household-items.ts for the household case) — it only
 * ever adds up numbers it's handed.
 */
import type { Money } from './money';

export interface NetWorthInputs {
  /** Σ wallet.balance WHERE type ∈ (cash, bank, ewallet) AND balance > 0 —
   * docs/03 §14.1's asset line, restricted to the positive side per
   * spec.md's Komponen table ("Hanya balance > 0"). */
  totalCashAssets: Money;
  /** Σ ABS(wallet.balance) WHERE type ∈ (cash, bank, ewallet) AND balance < 0
   * — spec.md's Komponen table: "yang negatif masuk liabilitas". A wallet's
   * own balance is never split between the two lines; it is either entirely
   * an asset or entirely a liability depending on its sign at read time. */
  totalCashLiabilities: Money;
  /** Σ ABS(wallet.balance) WHERE type = credit_card — spec.md's Komponen
   * table: "Selalu liabilitas sebesar ABS(balance), tidak pernah aset."
   * There is deliberately no corresponding "credit card asset" field
   * anywhere in this type — a credit card balance can never flow into
   * `totalAssets` no matter what a caller computes. */
  totalCreditCardLiabilities: Money;
  /** Σ savings_contributions.amount (non-void), across every goal —
   * docs/03 §14.1, task 15's original addition. */
  totalSavings: Money;
  /** Σ gram × harga buyback — docs/03 §14.1, ADR-007. Callers compute this
   * via src/lib/finance/gold.ts's `currentValue(totalGrams, buybackPerGram)`
   * (task 16) — NEVER the sell price; this module has no opinion of its own
   * on gold valuation, it just adds whatever Money it's handed under this
   * key straight into `totalAssets`. */
  totalGoldValue: Money;
  /** Σ pokok deposito AKTIF — docs/03 §14.1. Callers compute this via
   * src/features/assets/deposits/queries.ts's `getTotalDepositValue` (task
   * 17), which already excludes accrued interest and non-`active` deposits
   * (I10) — this module trusts that figure completely and, crucially, has
   * no "interest" field anywhere in this type to accidentally add on top. */
  totalDepositValue: Money;
  /** Σ assets.cached_value WHERE asset_type NOT IN ('gold', 'deposit') AND
   * status = 'active' — docs/03 §14.1's "aset_lain" line (property, vehicle,
   * other; ADR-related tasks for those haven't shipped a creation UI yet,
   * so this is `0n` for essentially every user today, but the schema/
   * formula already accounts for it). */
  totalOtherAssets: Money;
  /** Σ debt.remaining_amount WHERE status NOT IN ('paid','written_off') —
   * docs/03 §14.1, task 18. ALWAYS a liability, never conditional — unlike
   * receivables, there is no setting that makes a debt not count. */
  totalDebts: Money;
  /** Σ receivable.remaining_amount WHERE status NOT IN ('paid','written_off')
   * — counted as an asset ONLY when `countReceivablesAsAsset` is true.
   * Default `false` (ADR-010): personal receivables have a high default
   * rate, so net worth is conservative by default and shows this figure
   * separately rather than folding it in silently. */
  totalReceivables: Money;
  /** `users.count_receivables_as_asset` — the ADR-010 setting. */
  countReceivablesAsAsset: boolean;
}

export interface NetWorthAssetBreakdown {
  cash: Money;
  savings: Money;
  gold: Money;
  deposits: Money;
  otherAssets: Money;
  /** `0n` unless `countReceivablesAsAsset` — see `NetWorthResult.totalReceivables`
   * for the always-present raw figure. */
  receivables: Money;
}

export interface NetWorthLiabilityBreakdown {
  /** Negative-balance cash/bank/ewallet wallets. */
  cashOverdraft: Money;
  creditCards: Money;
  debts: Money;
}

export interface NetWorthResult {
  totalAssets: Money;
  totalLiabilities: Money;
  netWorth: Money;
  /** Every line item that was summed to produce the two totals above —
   * `breakdown.assets`/`breakdown.liabilities`' own fields sum EXACTLY to
   * `totalAssets`/`totalLiabilities` respectively (proven by construction
   * below, and pinned by a property test in this module's own test file).
   * This is what makes "rincian menjumlah tepat ke total" true by
   * definition rather than by coincidence — the UI renders these same
   * fields as its composition rows. */
  breakdown: {
    assets: NetWorthAssetBreakdown;
    liabilities: NetWorthLiabilityBreakdown;
  };
  /** The raw receivables total, ALWAYS present regardless of
   * `countReceivablesAsAsset` — ADR-010: piutang tetap ditampilkan terpisah
   * di UI even when it plays no part in `netWorth`. */
  totalReceivables: Money;
  countReceivablesAsAsset: boolean;
}

/**
 * `NET_WORTH = TOTAL_ASET − TOTAL_LIABILITAS` — docs/03 §14.1. Every asset
 * line is summed unconditionally except `totalReceivables`, which only
 * joins the sum when the caller opted in via `countReceivablesAsAsset`.
 */
export function calculateNetWorth(inputs: NetWorthInputs): NetWorthResult {
  const receivablesAsAsset = inputs.countReceivablesAsAsset ? inputs.totalReceivables : 0n;

  const assets: NetWorthAssetBreakdown = {
    cash: inputs.totalCashAssets,
    savings: inputs.totalSavings,
    gold: inputs.totalGoldValue,
    deposits: inputs.totalDepositValue,
    otherAssets: inputs.totalOtherAssets,
    receivables: receivablesAsAsset,
  };
  const liabilities: NetWorthLiabilityBreakdown = {
    cashOverdraft: inputs.totalCashLiabilities,
    creditCards: inputs.totalCreditCardLiabilities,
    debts: inputs.totalDebts,
  };

  const totalAssets =
    assets.cash + assets.savings + assets.gold + assets.deposits + assets.otherAssets + assets.receivables;
  const totalLiabilities = liabilities.cashOverdraft + liabilities.creditCards + liabilities.debts;

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    breakdown: { assets, liabilities },
    totalReceivables: inputs.totalReceivables,
    countReceivablesAsAsset: inputs.countReceivablesAsAsset,
  };
}

/**
 * Splits a set of raw cash/bank/ewallet wallet balances into their asset and
 * liability contributions — spec.md's Komponen table: a wallet's balance is
 * either entirely an asset (positive) or entirely a liability (negative, at
 * its absolute value); `0n` contributes to neither. This is the exact rule
 * the query layer's SQL (`CASE WHEN balance > 0 THEN balance ELSE 0 END` /
 * the mirror for the negative side) must implement — kept here as a pure,
 * directly-testable reference so the property tests in this module's own
 * test file can prove the underlying math (e.g. that a self-transfer between
 * wallets never changes `assets - liabilities`) without touching a database.
 */
export function splitCashBalances(balances: Money[]): { assets: Money; liabilities: Money } {
  let assets = 0n;
  let liabilities = 0n;
  for (const balance of balances) {
    if (balance > 0n) assets += balance;
    else if (balance < 0n) liabilities += -balance;
  }
  return { assets, liabilities };
}

/**
 * Credit cards are ALWAYS a liability at `ABS(balance)` — spec.md's
 * Komponen table — regardless of the stored sign; there is no "credit card
 * asset" case anywhere in this module. `wallets_cc_non_positive` (the
 * schema's own CHECK constraint, src/lib/db/schema/wallets.ts) already keeps
 * `balance <= 0` for every credit card in practice, but this function
 * doesn't lean on that guarantee holding — `ABS` makes the sign irrelevant
 * either way.
 */
export function creditCardLiabilities(balances: Money[]): Money {
  return balances.reduce((sum, balance) => sum + (balance < 0n ? -balance : balance), 0n);
}
