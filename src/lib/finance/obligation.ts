/**
 * Debt/receivable pure formulas — docs/03-domain-model.md §12,
 * tasks/18-debts-receivables/spec.md.
 *
 * Pure module: no I/O, no framework imports (same discipline as
 * src/lib/finance/money.ts/budget.ts/savings.ts). `src/lib/date/timezone.ts`
 * is the one exception imported here — it is itself I/O-free (pure `Intl`
 * computation, docs/09-transaction-history's own centralized date helper),
 * so importing it keeps this module's "no I/O" guarantee intact while still
 * letting `isOverdue` resolve "today" in the household's timezone rather
 * than the server's UTC date (see that function's own doc comment).
 *
 * `debts`/`receivables` share these formulas exactly — the only difference
 * between the two obligation kinds is the ledger entry SIGN (service layer,
 * src/lib/services/obligations.ts), never these derived figures.
 */
import { DEFAULT_TIMEZONE, toLocalDate } from '@/lib/date/timezone';
import type { Money } from './money';

/** Mirrors `obligation_status` (src/lib/db/schema/enums.ts) minus `written_off`
 * — that status is never DERIVED from amounts, only set explicitly by
 * `writeOffDebt`/`writeOffReceivable`, so it deliberately has no place in
 * `deriveStatus`'s return type. */
export type DerivedObligationStatus = 'active' | 'partially_paid' | 'paid';

export type ObligationStatus = DerivedObligationStatus | 'written_off';

/**
 * `active` → `partially_paid` → `paid`, purely from the initial/remaining
 * pair — docs/03 §12. `remainingAmount` is expected to already satisfy the
 * `*_remaining_valid` CHECK (`0 <= remaining <= initial`); this function
 * doesn't re-validate that range, it just classifies a point within it.
 *
 * `written_off` is NEVER returned here — a caller mid-payment always starts
 * from `active`/`partially_paid` (recording a payment against a
 * `written_off` row is rejected before this is ever consulted, see
 * src/lib/services/obligations.ts), so this function only ever needs to
 * decide among the three amount-derived states.
 */
export function deriveStatus(initialAmount: Money, remainingAmount: Money): DerivedObligationStatus {
  if (remainingAmount <= 0n) return 'paid';
  if (remainingAmount >= initialAmount) return 'active';
  return 'partially_paid';
}

/**
 * `progress_percent` — how much of the ORIGINAL amount has been paid down,
 * 0–100. Same scaled-bigint-then-Number technique as
 * src/lib/finance/savings.ts's `calculateGoalProgress` (avoids float
 * precision loss on large amounts — docs/05-financial-integrity.md §2) and
 * src/lib/finance/budget.ts's basis-points ratio.
 *
 * Defensive against `initialAmount <= 0`even though `*_initial_positive`
 * (the CHECK constraint) should make that unreachable in practice — same
 * "stay defensive rather than trust every caller passed a validated row"
 * stance src/lib/finance/budget.ts's own doc comment takes.
 */
export function progressPercent(initialAmount: Money, remainingAmount: Money): number {
  if (initialAmount <= 0n) return 0;
  const paid = initialAmount - remainingAmount;
  const scaled = (paid * 1_000_000n) / initialAmount;
  return Math.min(100, Math.max(0, Number(scaled) / 10_000));
}

/**
 * `overdue` — ALWAYS derived, NEVER a stored column (spec.md, docs/03 §12):
 * storing it would go stale every midnight for no reason. The literal
 * formula both docs quote is `due_date < today AND status ≠ paid`; this
 * function additionally excludes `written_off` from "overdue" even though
 * neither doc's shorthand spells that out. Reasoning: `written_off` is a
 * LATER addition to the terminal-state set (spec.md's acceptance criteria
 * adds it explicitly; docs/03 §12's prose predates it), and it is exactly as
 * terminal/resolved as `paid` for this predicate's purpose — a debt someone
 * has deliberately given up collecting isn't "late", it's closed. Treating
 * it as overdue would surface a forgiven debt in the dashboard's "Perlu
 * Perhatian" card flagged in danger red, which is actively misleading. Both
 * terminal statuses are therefore excluded uniformly; see this module's
 * `ObligationStatus` union and `getUpcomingDue`/`getOverdue`
 * (src/features/obligations/queries.ts), which apply the identical
 * status-exclusion when selecting "actionable" rows.
 *
 * Timezone-aware per the household/user's own calendar day, mirroring
 * tasks/09-transaction-history's centralized `src/lib/date/timezone.ts`
 * helper (the same one task 14's budget-rollover cron and task 11's
 * invitation-expiry-adjacent period logic already standardize on) rather
 * than comparing against the server's raw UTC date — a debt due "2026-09-05"
 * must not flip to overdue at 17:00 UTC on the 4th just because that instant
 * is already the 5th in UTC while it's still the 4th in Asia/Jakarta.
 *
 * `now`/`tz` default to the real current instant/`Asia/Jakarta` for
 * production call sites; tests pass both explicitly for determinism (same
 * "defaults for callers, explicit for tests" shape as
 * src/lib/finance/savings.ts's `calculateGoalProgress`).
 */
export function isOverdue(
  dueDate: string | null,
  status: ObligationStatus,
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): boolean {
  if (dueDate === null) return false;
  if (status === 'paid' || status === 'written_off') return false;
  return dueDate < toLocalDate(now, tz);
}
