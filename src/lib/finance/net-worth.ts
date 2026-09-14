/**
 * Net worth composition — docs/03-domain-model.md §14.1.
 *
 * STILL A PARTIAL SEED, NOT THE FULL PICTURE — full net worth (gold,
 * deposits, other assets, credit-card liabilities, the household view,
 * snapshots) remains task 19's scope. This file didn't exist before task 15
 * (savings-goals), which added the first two lines below purely so its own
 * property test had a single, named place to prove "a contribution changes
 * net worth by exactly zero" against. Task 18 (debts-receivables) extends it
 * with the ONE liability line docs/03 §14.1 defines and the ONE
 * conditionally-counted asset line (`count_receivables_as_asset`,
 * ADR-010) — both of which this task's own property tests need for the
 * exact same reason task 15's did. Task 19 should read this file's shape,
 * extend `NetWorthInputs`/`calculateNetWorth` to cover the rest of the
 * formula (gold/deposits/other assets, credit-card liabilities), and is
 * free to rename/restructure this once it owns the full picture.
 *
 * Pure module: no I/O (docs/11-tech-architecture.md §3, same discipline as
 * ledger.ts/money.ts/transfer.ts/savings.ts/obligation.ts in this
 * directory) — callers fetch the aggregate figures themselves (dbRead) and
 * pass them in here.
 */
import type { Money } from './money';

export interface NetWorthInputs {
  /** Σ wallet.balance WHERE type ∈ (cash, bank, ewallet) AND balance > 0 — docs/03 §14.1. */
  totalCash: Money;
  /** Σ savings_contributions.amount (non-void), across every goal — docs/03 §14.1, task 15's addition. */
  totalSavings: Money;
  /** Σ debt.remaining_amount WHERE status NOT IN ('paid','written_off') — docs/03
   * §14.1, task 18's addition. ALWAYS a liability, never conditional —
   * unlike receivables, there is no setting that makes a debt not count. */
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

/**
 * `NET_WORTH = TOTAL_ASET − TOTAL_LIABILITAS`. `totalDebts` always
 * subtracts; `totalReceivables` only adds when the caller opted in via
 * `countReceivablesAsAsset` — otherwise it plays no part in the number at
 * all (still shown separately in the UI, per ADR-010, just not summed in).
 */
export function calculateNetWorth(inputs: NetWorthInputs): Money {
  const receivablesAsAsset = inputs.countReceivablesAsAsset ? inputs.totalReceivables : 0n;
  return inputs.totalCash + inputs.totalSavings + receivablesAsAsset - inputs.totalDebts;
}
