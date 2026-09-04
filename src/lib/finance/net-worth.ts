/**
 * Net worth composition — docs/03-domain-model.md §14.1.
 *
 * MINIMAL SEED, NOT THE FULL PICTURE. Net worth itself is task 19's scope.
 * This file didn't exist before task 15 (savings-goals); it's created here
 * ONLY because task 15's property test needs a single, named place to prove
 * "a contribution changes net worth by exactly zero" against, rather than
 * re-deriving the summation ad hoc inside a test file. It currently sums
 * exactly the two asset categories task 15 touches:
 *
 *   - wallet cash balances (cash/bank/ewallet, balance > 0)
 *   - savings contributions (non-void, across every goal)
 *
 * Every other line of docs/03 §14.1's formula — gold, deposits, other
 * assets, receivables, credit-card liabilities, debts — belongs to task 19.
 * That task should read this file's shape, extend `NetWorthInputs` and
 * `calculateNetWorth` to cover the rest of the formula, and is free to
 * rename/restructure this once it owns the full picture; nothing else in
 * task 15 depends on this file's shape beyond the property test and the
 * savings summary card.
 *
 * Pure module: no I/O (docs/11-tech-architecture.md §3, same discipline as
 * ledger.ts/money.ts/transfer.ts/savings.ts in this directory) — callers
 * fetch the aggregate figures themselves (dbRead) and pass them in here.
 */
import type { Money } from './money';

export interface NetWorthInputs {
  /** Σ wallet.balance WHERE type ∈ (cash, bank, ewallet) AND balance > 0 — docs/03 §14.1. */
  totalCash: Money;
  /** Σ savings_contributions.amount (non-void), across every goal — docs/03 §14.1, task 15's addition. */
  totalSavings: Money;
}

/**
 * `NET_WORTH = TOTAL_ASET − TOTAL_LIABILITAS`, restricted for now to the two
 * asset categories above — there are no liabilities in this seed (credit
 * cards / debts land with task 19, at which point this stops being a pure
 * sum and starts subtracting).
 */
export function calculateNetWorth(inputs: NetWorthInputs): Money {
  return inputs.totalCash + inputs.totalSavings;
}
