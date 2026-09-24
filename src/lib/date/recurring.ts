/**
 * Pure recurring-schedule date math — tasks/24-recurring-transactions/spec.md
 * "Perhitungan `next_run_date` Berikutnya". No I/O, no framework imports
 * (same discipline as src/lib/date/timezone.ts and src/lib/finance/money.ts).
 *
 * `start_date`/`end_date`/`next_run_date` are all plain calendar `date`
 * columns (`YYYY-MM-DD`), not `timestamp` — spec.md's "Kenapa date, bukan
 * timestamp": a recurring schedule is purely calendar-based ("tiap tanggal
 * 1"), not tied to a specific hour. Materialization is what converts a
 * `next_run_date` into a real `Date` (local noon) right before calling
 * `createTransaction`/`contribute` — see `localDateToNoonUtc` below, and
 * src/lib/services/recurring-transactions.ts for the call site.
 */
import { toLocalDate } from './timezone';

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly';

function parseDateStr(dateStr: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new RangeError(`Invalid date string: "${dateStr}" (expected YYYY-MM-DD)`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function formatDateStr(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** The number of days in calendar month `m` (1-12) of year `y` — leap years included. */
function daysInMonth(y: number, m: number): number {
  // Day 0 of the NEXT month is the last day of THIS month — `Date.UTC`
  // normalizes a month index of 12 into January of `y + 1`, so this works
  // uniformly for December too.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * The next `YYYY-MM-DD` a recurring rule currently at `current` should fire
 * on, given `frequency` — spec.md's exact rule:
 *  - `daily` → `current + 1 hari`
 *  - `weekly` → `current + 7 hari`
 *  - `monthly` → next calendar month, day CLAMPED to that month's last day
 *    when the origin day doesn't exist there (31 Jan → 28/29 Feb, never an
 *    error, never overflowing into March). This is the single most
 *    error-prone case here — see this module's property test
 *    (src/lib/date/__tests__/recurring.test.ts) for the exhaustive check.
 *
 * Pure calendar-string arithmetic throughout (no `Date`/timezone
 * conversion) — both bounds are already local dates, same reasoning as
 * src/lib/date/timezone.ts's `periodDateRange`.
 */
export function computeNextRunDate(current: string, frequency: RecurringFrequency): string {
  const { y, m, d } = parseDateStr(current);

  if (frequency === 'daily') {
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    return formatDateStr(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  }

  if (frequency === 'weekly') {
    const next = new Date(Date.UTC(y, m - 1, d + 7));
    return formatDateStr(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  }

  // monthly — advance the (year, month) pair by one, then clamp the day.
  const totalMonthsZeroBased = y * 12 + (m - 1) + 1;
  const nextYear = Math.floor(totalMonthsZeroBased / 12);
  const nextMonth = (totalMonthsZeroBased % 12) + 1;
  const clampedDay = Math.min(d, daysInMonth(nextYear, nextMonth));
  return formatDateStr(nextYear, nextMonth, clampedDay);
}

/**
 * Converts a `next_run_date` (`YYYY-MM-DD`) into the real `Date` instant to
 * pass to `createTransaction`/`contribute` — local NOON in `tz`, per
 * spec.md: "materialisasi mengonversi `next_run_date` (date) menjadi `Date`
 * pada tengah hari lokal user". Noon (not midnight) keeps the instant
 * comfortably inside the SAME local calendar day regardless of `tz`'s UTC
 * offset, so a later `toLocalDate(result, tz)` round-trips back to exactly
 * `dateStr` — verified by this module's own test suite. This module has no
 * direct access to `src/lib/date/timezone.ts`'s private `localToUtc`
 * (unexported), so it composes the same public helpers
 * (`toLocalDate`/`DEFAULT_TIMEZONE`) that every other caller in this
 * codebase already uses instead of hand-rolling a parallel timezone
 * converter — see spec.md's explicit instruction to check `toLocalDate`
 * first.
 */
export function localDateToNoonUtc(dateStr: string, tz: string): Date {
  const { y, m, d } = parseDateStr(dateStr);
  // Naive UTC noon on the same calendar date, then corrected by the
  // observed drift between what `toLocalDate` reports for that instant in
  // `tz` and the intended date — absorbs any UTC offset up to ±12h relative
  // to UTC noon without a private timezone-conversion helper. Two passes
  // (mirroring src/lib/date/timezone.ts's own `localToUtc`) handle the rare
  // case where the first correction crosses a DST boundary.
  let instant = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  for (let pass = 0; pass < 2; pass++) {
    const observed = toLocalDate(instant, tz);
    if (observed === dateStr) break;
    const { y: oy, m: om, d: od } = parseDateStr(observed);
    const driftMs = Date.UTC(y, m - 1, d) - Date.UTC(oy, om - 1, od);
    instant = new Date(instant.getTime() + driftMs);
  }
  return instant;
}
