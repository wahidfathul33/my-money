/**
 * Savings goal formulas — docs/03-domain-model.md §10.3, implemented
 * EXACTLY as specified there:
 *
 *   current_amount    = Σ kontribusi (non-void)                       [caller's job — see src/lib/services/savings.ts]
 *   progress_pct      = current_amount / target_amount × 100          (dibatasi 100)
 *   remaining_amount  = MAX(0, target_amount − current_amount)
 *   months_remaining  = ceil(hari(target_date − hari_ini) / 30.44)
 *   suggested_monthly = months_remaining > 0
 *                         ? ceil(remaining_amount / months_remaining)
 *                         : remaining_amount
 *
 * Pure module: no I/O, no framework imports (docs/11-tech-architecture.md
 * §3, same discipline as ledger.ts/money.ts/transfer.ts in this directory).
 * `current_amount` itself is NOT computed here — it's a DB-level SUM the
 * service layer maintains as `savings_goals.current_amount` (a cache,
 * updated atomically alongside every contribution/withdrawal, same
 * "cache derived from a ledger-like table" shape as `wallets.balance`) —
 * this module only turns an already-known current/target/date triple into
 * the derived display figures.
 *
 * Dates are handled as plain `YYYY-MM-DD` strings, matching how Drizzle
 * reads back a `date` column by default (`mode: 'string'`, not `mode:
 * 'date'` — see src/lib/db/schema/savings.ts's `targetDate: date(...)`,
 * no mode specified). Parsing "YYYY-MM-DD" as UTC midnight (via the `T00:00:00Z`
 * suffix below) sidesteps local-timezone drift entirely — there's no
 * partial-day component to round either direction.
 */
import type { Money } from './money';

/** Days in an average month — the exact constant docs/03 §10.3 specifies. */
const AVG_DAYS_PER_MONTH = 30.44;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface GoalProgressInput {
  /** Must be > 0 — matches the `sg_target_positive` CHECK constraint. */
  targetAmount: Money;
  /** Must be >= 0 — matches the `sg_current_nonneg` CHECK constraint. */
  currentAmount: Money;
  /** `YYYY-MM-DD`, or `null` for a goal with no target date. */
  targetDate: string | null;
  /** `YYYY-MM-DD`. Defaults to the current UTC date — pass explicitly in
   * tests for determinism. */
  today?: string;
}

export interface GoalProgressResult {
  /** 0–100, capped — docs/03 §10.3 "(dibatasi 100)". */
  progressPct: number;
  /** `MAX(0, target_amount − current_amount)`. */
  remainingAmount: Money;
  /** `null` when the goal has no `targetDate`. Can be zero or negative
   * when the target date is today or already past — callers show "Target
   * terlewat" instead of the raw number in that case (see `isOverdue`),
   * never a negative figure (spec.md "Target terlewat, bukan angka
   * negatif"). */
  monthsRemaining: number | null;
  /** `null` when the goal has no `targetDate`. Falls back to the full
   * `remainingAmount` (no division) whenever `monthsRemaining <= 0` —
   * "pembagian aman saat sisa bulan 0" (todo.md). */
  suggestedMonthly: Money | null;
  /** Target date has passed AND the goal isn't funded yet. Always `false`
   * once `isCompleted` is `true`, and always `false` when there's no
   * `targetDate` at all. */
  isOverdue: boolean;
  /** `current_amount >= target_amount`. The service layer uses this same
   * boolean to flip `savings_goals.status` to `completed` — one
   * computation, not two definitions of "done" that could drift apart. */
  isCompleted: boolean;
}

function toUtcMidnight(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `ceil(a / b)` for non-negative bigints — used for suggested-monthly
 * amounts so a rounded-down suggestion never leaves the goal permanently
 * just short at the target date. `b` must be positive. */
function ceilDivMoney(amount: Money, divisor: bigint): Money {
  if (divisor <= 0n) {
    throw new RangeError('ceilDivMoney: divisor must be positive');
  }
  if (amount <= 0n) return 0n;
  return (amount + divisor - 1n) / divisor;
}

/**
 * `calculateGoalProgress` — the ONE place every progress/remaining/time-left/
 * suggested-monthly figure shown anywhere in the savings UI is computed, so
 * the ring, the detail page, and `contribute`/`withdraw`'s auto-`completed`
 * check can never quietly disagree about what "done" means.
 */
export function calculateGoalProgress(input: GoalProgressInput): GoalProgressResult {
  const { targetAmount, currentAmount } = input;

  if (targetAmount <= 0n) {
    throw new RangeError('calculateGoalProgress: targetAmount must be positive');
  }
  if (currentAmount < 0n) {
    throw new RangeError('calculateGoalProgress: currentAmount must not be negative');
  }

  const isCompleted = currentAmount >= targetAmount;

  // Scaled bigint division (4 implied decimal digits) before ever touching
  // `Number` — avoids float precision loss for large amounts. The ratio
  // itself (0–100-ish) is small regardless of how big the money values are,
  // so converting THIS to `number` is safe; converting the raw `Money`
  // values would not be (docs/05-financial-integrity.md §2).
  const scaled = (currentAmount * 1_000_000n) / targetAmount;
  const progressPct = Math.min(100, Number(scaled) / 10_000);

  const remainingAmount = targetAmount > currentAmount ? targetAmount - currentAmount : 0n;

  let monthsRemaining: number | null = null;
  let suggestedMonthly: Money | null = null;
  let isOverdue = false;

  if (input.targetDate !== null) {
    const today = input.today ?? todayIso();
    const days = Math.round((toUtcMidnight(input.targetDate) - toUtcMidnight(today)) / MS_PER_DAY);
    monthsRemaining = Math.ceil(days / AVG_DAYS_PER_MONTH);
    isOverdue = !isCompleted && days < 0;

    suggestedMonthly =
      monthsRemaining > 0 ? ceilDivMoney(remainingAmount, BigInt(monthsRemaining)) : remainingAmount;
  }

  return { progressPct, remainingAmount, monthsRemaining, suggestedMonthly, isOverdue, isCompleted };
}

/**
 * Per-member split of `suggestedMonthly` for a shared goal — docs/03 §10.3
 * "Pada goal bersama, saran juga ditampilkan dibagi jumlah anggota aktif."
 * Ceiling division for the same reason as `suggestedMonthly` itself: a
 * rounded-down split left uncorrected would under-suggest by a few rupiah
 * per member, every month, for the life of the goal.
 */
export function suggestedMonthlyPerMember(suggestedMonthly: Money, activeMemberCount: number): Money {
  if (activeMemberCount <= 0) {
    throw new RangeError('suggestedMonthlyPerMember: activeMemberCount must be positive');
  }
  return ceilDivMoney(suggestedMonthly, BigInt(activeMemberCount));
}
