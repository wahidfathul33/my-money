/**
 * Budget status thresholds — docs/03-domain-model.md §13: "Ambang status:
 * `safe` < 80% ≤ `warning` < 100% ≤ `over`."
 *
 * Pure module: no I/O, no framework imports (same discipline as
 * src/lib/finance/money.ts). `amount`/`spent` are exact bigint minor units —
 * the ratio is computed in integer basis points (1/100 of a percent) so the
 * 80%/100% boundaries are exact comparisons, never a floating-point ">=" on
 * a value that drifted a fraction of a percent from division rounding.
 */
import type { Money } from './money';

export type BudgetStatus = 'safe' | 'warning' | 'over';

export interface BudgetStatusResult {
  status: BudgetStatus;
  /** Percent used (0+, uncapped) — e.g. `150` for 150%. Callers clamp for
   * display (a progress bar fills at most 100%); the raw value is kept so
   * "how far over" can still be shown in text. */
  percent: number;
}

const BASIS_POINTS = 10_000n; // 100.00%, expressed so the ratio is exact bigint math.
const WARNING_THRESHOLD_BP = 8_000n; // 80.00%
const OVER_THRESHOLD_BP = 10_000n; // 100.00%

/**
 * `spent / amount` as a status + percent. `amount` is normally always > 0
 * (`budget_amount_positive` CHECK, src/lib/db/schema/budgets.ts), but this
 * function stays defensive about `amount <= 0` — todo.md's own unit test
 * calls it out explicitly ("amount = 0 tidak menyebabkan pembagian nol") —
 * rather than trusting every future caller to have a validated row: zero
 * spent against a zero budget is still "safe" (nothing to warn about), any
 * spend at all against a zero budget is immediately "over" (there was no
 * room for it), and negative amounts are treated the same as zero.
 */
export function calculateBudgetStatus(amount: Money, spent: Money): BudgetStatusResult {
  if (amount <= 0n) {
    return spent > 0n ? { status: 'over', percent: Infinity } : { status: 'safe', percent: 0 };
  }

  // Integer division truncates toward zero — safe here since both operands
  // are non-negative in practice, and truncation only ever discards the
  // sub-basis-point fraction, never crossing the 8000/10000 thresholds
  // incorrectly (see this module's header comment).
  const basisPoints = (spent * BASIS_POINTS) / amount;
  const percent = Number(basisPoints) / 100;

  const status: BudgetStatus =
    basisPoints >= OVER_THRESHOLD_BP ? 'over' : basisPoints >= WARNING_THRESHOLD_BP ? 'warning' : 'safe';

  return { status, percent };
}

/** Status → design-system color token (docs/07 §561 "BudgetBar: progress
 * dengan ambang warna") — the ONE place that maps a status to a token, so
 * BudgetBar and any other status-aware UI (dashboard card, member
 * breakdown) never hardcode the mapping independently and drift apart. */
export const BUDGET_STATUS_COLOR: Record<BudgetStatus, { bar: string; text: string }> = {
  safe: { bar: 'bg-positive', text: 'text-positive-readable' },
  warning: { bar: 'bg-warning', text: 'text-warning-readable' },
  over: { bar: 'bg-danger', text: 'text-negative' },
};

/** Dashboard/summary cutoff — docs/03 §13, docs/09-screen-specs.md §1:
 * "Bagian 'Anggaran' tersembunyi seluruhnya kalau tidak ada budget yang
 * ≥ 80%." A budget qualifies as "needing attention" at the same threshold
 * that turns its own status amber. */
export function needsAttention(amount: Money, spent: Money): boolean {
  return calculateBudgetStatus(amount, spent).status !== 'safe';
}
