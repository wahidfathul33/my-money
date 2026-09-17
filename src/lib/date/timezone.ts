/**
 * Timezone-aware date grouping — the centralized helper
 * tasks/09-transaction-history/spec.md calls for: "Helper tanggal terpusat
 * dibuat di sini dan dipakai setiap agregasi berbasis tanggal sesudahnya —
 * termasuk budget dan laporan household."
 *
 * MVP defaulted every user/household to Asia/Jakarta (WIB, UTC+7, no DST) —
 * `DEFAULT_TIMEZONE` below is that fallback, still the schema column
 * default (`users.timezone`, `households.timezone`) for anyone who's never
 * changed it. tasks/22-settings-sharing-pwa lifts the *hard* restriction
 * `src/features/transactions/history-queries.ts` used to have (rejecting
 * anything other than this exact string) — `isValidTimeZone` below is the
 * real validity check both that module and
 * src/features/household/schema.ts's `timezoneSchema` now share, so any
 * genuine IANA zone works end to end, not just Jakarta. This module exists
 * so that logic lives in exactly one place in application code.
 *
 * **The bug this file exists to prevent:** a transaction recorded at 00:01
 * WIB is stored as 17:01 UTC the PREVIOUS calendar day. Grouping by
 * `date.toISOString().slice(0, 10)` (the UTC date) would silently place it
 * on the wrong day from the user's point of view — see
 * src/lib/date/__tests__/timezone.test.ts, written before this file per the
 * spec's own instruction.
 *
 * Pure module: no I/O, no framework imports (same discipline as
 * src/lib/finance/money.ts).
 */

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

/**
 * True for any string `Intl` recognizes as a real IANA zone name — the
 * single validity check every caller in this codebase should use instead of
 * hand-rolling their own (src/features/household/schema.ts's
 * `timezoneSchema` and src/features/transactions/history-queries.ts's
 * `assertSupportedTimezone` both delegate here).
 */
export function isValidTimeZone(tz: string): boolean {
  try {
    // Throws RangeError for anything that isn't a real IANA zone name.
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const LOCAL_DATE_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function localDateFormatter(tz: string): Intl.DateTimeFormat {
  let formatter = LOCAL_DATE_FORMATTER_CACHE.get(tz);
  if (!formatter) {
    // en-CA's short date format is exactly YYYY-MM-DD.
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    LOCAL_DATE_FORMATTER_CACHE.set(tz, formatter);
  }
  return formatter;
}

/** The `YYYY-MM-DD` calendar date `instant` falls on, in `tz` wall-clock time. */
export function toLocalDate(instant: Date, tz: string = DEFAULT_TIMEZONE): string {
  return localDateFormatter(tz).format(instant);
}

/** The `YYYY-MM` calendar month `instant` falls on, in `tz` wall-clock time. */
export function toLocalMonth(instant: Date, tz: string = DEFAULT_TIMEZONE): string {
  return toLocalDate(instant, tz).slice(0, 7);
}

/** `YYYY-MM` for "now", in `tz` — the period a fresh `PeriodPicker` defaults to. */
export function currentLocalPeriod(now: Date = new Date(), tz: string = DEFAULT_TIMEZONE): string {
  return toLocalMonth(now, tz);
}

/**
 * The UTC offset (in minutes, `local = utc + offset`) `tz` observes at
 * `instant`. Asia/Jakarta has been a fixed +07:00 with no DST since 1932, so
 * this is a constant for our one supported zone in practice — computed via
 * `Intl` rather than hardcoded so the function stays correct if MVP's
 * single-timezone assumption is ever lifted.
 */
function tzOffsetMinutes(instant: Date, tz: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // "24:00:00" is how some ICU implementations represent local midnight
  // rolling into the next day; hourCycle h23 avoids that, but guard anyway.
  const hour = get('hour') % 24;

  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return (asIfUtc - instant.getTime()) / 60_000;
}

/**
 * The UTC instant at which `tz`'s local wall clock reads
 * `y`-`m`-`d` `h`:`mi`:`s`. Resolves the offset in two passes (first at the
 * naive guess, then refined at that guess) so a DST transition landing
 * exactly on the requested wall-clock time still resolves correctly — moot
 * for Asia/Jakarta today, but keeps the function honest for any zone.
 */
function localToUtc(y: number, m: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const naiveUtcMs = Date.UTC(y, m - 1, d, h, mi, s);
  const firstPassOffset = tzOffsetMinutes(new Date(naiveUtcMs), tz);
  const candidateMs = naiveUtcMs - firstPassOffset * 60_000;
  const secondPassOffset = tzOffsetMinutes(new Date(candidateMs), tz);
  const finalMs = secondPassOffset === firstPassOffset ? candidateMs : naiveUtcMs - secondPassOffset * 60_000;
  return new Date(finalMs);
}

export interface UtcRange {
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
}

/**
 * The half-open UTC instant range `[start, end)` covering the WIB calendar
 * day `dateStr` (`YYYY-MM-DD`) — the exact bounds a `WHERE transaction_date
 * >= start AND transaction_date < end` query needs to match one day-group
 * header in the history list.
 */
export function localDayRange(dateStr: string, tz: string = DEFAULT_TIMEZONE): UtcRange {
  const [y, m, d] = parseDateStr(dateStr);
  const start = localToUtc(y, m, d, 0, 0, 0, tz);
  const nextDayMs = Date.UTC(y, m - 1, d + 1); // Date.UTC normalizes day overflow (e.g. d+1 past month end).
  const next = new Date(nextDayMs);
  const end = localToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, 0, tz);
  return { start, end };
}

/**
 * The half-open UTC instant range `[start, end)` covering the WIB calendar
 * month `period` (`YYYY-MM`) — feeds `PeriodPicker`'s income/expense summary
 * and the month navigation itself.
 */
export function localMonthRange(period: string, tz: string = DEFAULT_TIMEZONE): UtcRange {
  const [y, m] = parsePeriodStr(period);
  const start = localToUtc(y, m, 1, 0, 0, 0, tz);
  const nextMonthMs = Date.UTC(y, m); // Date.UTC(year, monthIndexBeyondRange, 1) normalizes into next month.
  const next = new Date(nextMonthMs);
  const end = localToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, 1, 0, 0, 0, tz);
  return { start, end };
}

/** `period` shifted by `delta` whole months (`delta` may be negative) — powers the `‹`/`›` period picker controls. */
export function shiftPeriod(period: string, delta: number): string {
  const [y, m] = parsePeriodStr(period);
  const totalMonthsZeroBased = y * 12 + (m - 1) + delta;
  const nextYear = Math.floor(totalMonthsZeroBased / 12);
  const nextMonth = (totalMonthsZeroBased % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

/**
 * The first and last WIB calendar dates (`YYYY-MM-DD`) of `period`
 * (`YYYY-MM`) — pure calendar-string arithmetic, no instant/timezone
 * conversion needed since both bounds are already local dates. Feeds
 * `/transactions`'s default `from`/`to` list filter when the user hasn't
 * picked an explicit date range (src/features/transactions/use-history-filters.ts).
 */
export function periodDateRange(period: string): { from: string; to: string } {
  const [y, m] = parsePeriodStr(period);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(daysInMonth).padStart(2, '0')}` };
}

function parseDateStr(dateStr: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new RangeError(`Invalid date string: "${dateStr}" (expected YYYY-MM-DD)`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function parsePeriodStr(period: string): [number, number] {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) throw new RangeError(`Invalid period string: "${period}" (expected YYYY-MM)`);
  return [Number(match[1]), Number(match[2])];
}
