/**
 * Deposit (deposito) interest math — docs/03-domain-model.md §11.3,
 * docs/16-decision-log.md ADR-013, tasks/17-assets-deposits/spec.md.
 *
 * Pure module: no I/O, no framework imports (docs/11-tech-architecture.md
 * §3, same discipline as money.ts/ledger.ts/savings.ts in this directory).
 * `src/lib/services/deposits.ts` is the only caller that touches the
 * database; it converts DB rows (NUMERIC strings, DATE strings) into the
 * plain `Date`/`number` shapes this module expects, and converts back to
 * strings only at the DB write boundary.
 *
 * ## The one thing this file exists to get right (ADR-013)
 *
 * For `payout_schedule = 'at_maturity'` (the default), accrued interest is
 * NOT wealth until it's actually paid out — early withdrawal typically
 * forfeits it, and a deposit that's 364 days into a 365-day term has
 * received exactly as much interest as one that opened yesterday: none.
 * `currentValue` therefore ALWAYS returns principal, no matter how large
 * `accruedInterest` has grown. The two functions are kept structurally
 * distinct (different signatures even) specifically so a future edit can't
 * accidentally make `currentValue` delegate to `accruedInterest` — see each
 * function's own doc comment.
 *
 * ## Rounding
 *
 * All money math routes through `multiplyRatio` (half-up to the nearest
 * minor unit), never raw `bigint` division or any `number` division — a
 * plain `a / b` on bigints truncates toward zero, silently under-crediting
 * interest by a fraction of a sen on every single deposit, which is exactly
 * the kind of small, compounding inaccuracy this app's design docs warn
 * against.
 *
 * `annualRatePercent`/`taxRate` are the only places a `number` touches this
 * module — they represent a RATE (NUMERIC(7,4)/(5,4) in the schema, at most
 * 4 decimal digits), never a money amount, and are immediately scaled into
 * an exact `bigint` numerator (`scaleToBigInt`) before any arithmetic
 * against `principal` happens. `principal` and every returned value stay
 * `bigint` end to end — "Jangan: float untuk pokok atau bunga" (spec.md).
 */
import { multiplyRatio, type Money } from './money';

const PERCENT_SCALE = 10_000n; // NUMERIC(7,4)/(5,4) carry at most 4 decimal digits.
const DAYS_PER_YEAR = 365n;
const PERCENT_DIVISOR = 100n;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** PPh final 20% applies above this principal; at or below it, interest is
 * tax-exempt — docs/03 §11.3. Fixed by Indonesian tax regulation, not a
 * setting — spec.md's "Tanya dulu: mengubah ambang pajak" applies to this
 * literal. */
export const TAX_EXEMPT_THRESHOLD: Money = 7_500_000_00n;

/** Rounds a rate expressed as a percent (e.g. `4.25`) into an exact `bigint`
 * numerator scaled by `PERCENT_SCALE`. `Math.round` absorbs the tiny binary
 * floating-point epsilon a literal like `4.25` can carry (it's exactly
 * representable, but e.g. `0.2` is not) — the result is always the intended
 * integer (`42_500n` for `4.25`), never `42_499n` or `42_501n`. */
function scaleToBigInt(percent: number): bigint {
  return BigInt(Math.round(percent * Number(PERCENT_SCALE)));
}

/** Whole days between two instants, at UTC-midnight granularity — same
 * "normalize to UTC midnight, no partial-day drift" technique as
 * src/lib/finance/savings.ts's `toUtcMidnight`. Can be negative. */
function daysBetweenUtc(from: Date, to: Date): number {
  const fromUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((toUtc - fromUtc) / MS_PER_DAY);
}

export interface DepositInterestInput {
  principal: Money;
  /** Annual nominal rate as a percent, e.g. `4.25` for 4.25%/year — matches
   * `deposits.interest_rate_annual` NUMERIC(7,4). */
  annualRatePercent: number;
  startDate: Date;
  maturityDate: Date;
  /** e.g. `0.2` for 20%. Matches `deposits.tax_rate` NUMERIC(5,4). Callers
   * decide 0 vs 0.2 via `shouldApplyTax` BEFORE calling this — this
   * function applies whatever it's given, no threshold logic of its own. */
  taxRate: number;
}

export interface DepositInterestResult {
  grossInterest: Money;
  tax: Money;
  netInterest: Money;
  /** `principal + netInterest` — the amount received if held to
   * `maturityDate` and cashed out. NEVER used as the deposit's running
   * value before that point — see `currentValue`. */
  maturityValue: Money;
}

/**
 * `bunga_kotor = principal × (rate/100) × (tenor_hari/365)`, then
 * `pajak = bunga_kotor × taxRate`, `bunga_bersih = bunga_kotor − pajak` —
 * docs/03 §11.3's formula, verbatim. Gross interest is rounded to the
 * nearest sen FIRST (half-up), and tax is computed on that already-rounded
 * gross figure — this matches what a bank statement actually shows (two
 * displayed rupiah figures, each individually rounded), rather than
 * carrying an un-rounded fraction through an extra step.
 *
 * A negative or zero tenor (a `maturityDate` at or before `startDate`) is
 * clamped to 0 days rather than thrown — the `deposit_dates_valid` CHECK
 * constraint (src/lib/db/schema/assets.ts) already prevents this from ever
 * reaching the database, but this pure function has its own explicit test
 * for the boundary (`startDate === maturityDate → 0 bunga`, todo.md), so it
 * has to accept it gracefully rather than assume the constraint already ran.
 */
export function calculateDepositInterest(input: DepositInterestInput): DepositInterestResult {
  const tenorDays = BigInt(Math.max(0, daysBetweenUtc(input.startDate, input.maturityDate)));

  const rateScaled = scaleToBigInt(input.annualRatePercent);
  const taxRateScaled = scaleToBigInt(input.taxRate);

  const grossInterest = multiplyRatio(
    input.principal,
    rateScaled * tenorDays,
    PERCENT_DIVISOR * DAYS_PER_YEAR * PERCENT_SCALE,
  );
  const tax = multiplyRatio(grossInterest, taxRateScaled, PERCENT_SCALE);
  const netInterest = grossInterest - tax;
  const maturityValue = input.principal + netInterest;

  return { grossInterest, tax, netInterest, maturityValue };
}

/** `true` above `TAX_EXEMPT_THRESHOLD` (strictly greater than — Rp7.500.000
 * exactly is still exempt), `false` at or below it — docs/03 §11.3. */
export function shouldApplyTax(principal: Money): boolean {
  return principal > TAX_EXEMPT_THRESHOLD;
}

/** The subset of a `deposits` row (plus its parsed rate/dates) every
 * function below needs. `src/lib/services/deposits.ts` builds this from a
 * DB row by parsing `interest_rate_annual`/`tax_rate` (NUMERIC → string in
 * Drizzle) to `number`, and `start_date`/`maturity_date`/pay history
 * (DATE → string) to `Date` at UTC midnight — this module never touches a
 * raw DB row or a string itself. */
export interface DepositSnapshot {
  principal: Money;
  interestRateAnnual: number;
  taxRate: number;
  startDate: Date;
  maturityDate: Date;
  payoutSchedule: 'at_maturity' | 'monthly';
  /** Set once a `monthly` deposit has been credited at least once — the
   * accrual clock for the NEXT payment restarts from here rather than from
   * `startDate`, so interest already paid out is never counted again as
   * "still accruing". `null` for a deposit that has never been paid
   * (`at_maturity` deposits stay `null` for their entire life). */
  lastInterestPaymentDate: Date | null;
}

/**
 * ADR-013's central rule, load-bearing enough to have its own single-purpose
 * function rather than a branch inside a more general "current value"
 * calculator: for BOTH payout schedules, a deposit's own running value is
 * its principal, full stop — never principal plus any accrued interest.
 *
 * `at_maturity`: interest hasn't been received yet, and early withdrawal
 * commonly forfeits it (spec.md's explicit "Tidak termasuk: penalti
 * pencairan dini" — the app doesn't model a penalty, but it also never
 * assumes the interest is safe before it's paid).
 *
 * `monthly`: this ISN'T "principal plus this month's unpaid sliver" either —
 * every FULL month's interest already left the deposit and landed in the
 * linked wallet as real cash the moment `payMonthlyInterest` ran, so it's
 * counted there, as wallet balance, not here. Counting it in both places
 * would double it.
 */
export function currentValue(deposit: Pick<DepositSnapshot, 'principal'>): Money {
  return deposit.principal;
}

/**
 * The running INTEREST ESTIMATE — for display only, clearly labeled
 * "estimasi" in the UI (spec.md), and never added into `currentValue` or any
 * net-worth total. Prorates from the later of `startDate`/
 * `lastInterestPaymentDate` up to `asOf`, capped at `maturityDate` (interest
 * doesn't keep accruing past the agreed term while sitting unclaimed/
 * unrolled) and floored at 0 (an `asOf` before the accrual start is treated
 * as "nothing accrued yet", not a negative estimate).
 */
export function accruedInterest(deposit: DepositSnapshot, asOf: Date): Money {
  const periodStart = deposit.lastInterestPaymentDate ?? deposit.startDate;
  const periodEnd = asOf.getTime() < deposit.maturityDate.getTime() ? asOf : deposit.maturityDate;

  const { netInterest } = calculateDepositInterest({
    principal: deposit.principal,
    annualRatePercent: deposit.interestRateAnnual,
    startDate: periodStart,
    maturityDate: periodEnd,
    taxRate: deposit.taxRate,
  });
  return netInterest;
}

/** Days until `deposit.maturityDate`, from `today` — negative once overdue
 * (spec.md: an overdue deposit shows how late, never clamps to 0). Powers
 * both the card's "sisa N hari" and the ≤7-day "needs attention" cutoff
 * (`src/features/assets/deposits/queries.ts`'s `getUpcomingMaturities`). */
export function daysRemaining(deposit: Pick<DepositSnapshot, 'maturityDate'>, today: Date): number {
  return daysBetweenUtc(today, deposit.maturityDate);
}
