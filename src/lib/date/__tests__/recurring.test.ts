/**
 * Property test for src/lib/date/recurring.ts's `computeNextRunDate` —
 * written BEFORE the implementation, per tasks/24-recurring-transactions's
 * "Property Test Dulu" step. The acceptance criterion this guards:
 * "Bulanan tanggal 31 dari bulan 31-hari, dijadwalkan ulang ke bulan
 * 30/28/29-hari, tidak pernah error atau meluber ke bulan berikutnya."
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeNextRunDate, localDateToNoonUtc } from '../recurring';
import { toLocalDate } from '../timezone';

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

describe('computeNextRunDate — daily/weekly', () => {
  it('daily advances exactly one calendar day', () => {
    expect(computeNextRunDate('2026-02-27', 'daily')).toBe('2026-02-28');
  });

  it('daily crosses a month boundary correctly', () => {
    expect(computeNextRunDate('2026-01-31', 'daily')).toBe('2026-02-01');
  });

  it('daily crosses a leap-day boundary correctly (2028 is a leap year)', () => {
    expect(computeNextRunDate('2028-02-28', 'daily')).toBe('2028-02-29');
  });

  it('weekly advances exactly seven calendar days', () => {
    expect(computeNextRunDate('2026-01-01', 'weekly')).toBe('2026-01-08');
  });

  it('weekly crosses a month boundary correctly', () => {
    expect(computeNextRunDate('2026-01-28', 'weekly')).toBe('2026-02-04');
  });

  it('weekly crosses a year boundary correctly', () => {
    expect(computeNextRunDate('2026-12-28', 'weekly')).toBe('2027-01-04');
  });
});

describe('computeNextRunDate — monthly, exact days named in the spec', () => {
  it('31 Jan -> 28 Feb in a non-leap year (2026)', () => {
    expect(computeNextRunDate('2026-01-31', 'monthly')).toBe('2026-02-28');
  });

  it('31 Jan -> 29 Feb in a leap year (2028)', () => {
    expect(computeNextRunDate('2028-01-31', 'monthly')).toBe('2028-02-29');
  });

  it('30 Apr -> 30 May (both 30-day-or-more months, no clamp needed)', () => {
    expect(computeNextRunDate('2026-04-30', 'monthly')).toBe('2026-05-30');
  });

  it('31 Mar -> 30 Apr (clamped, since April has only 30 days)', () => {
    expect(computeNextRunDate('2026-03-31', 'monthly')).toBe('2026-04-30');
  });

  it('a non-end-of-month day (e.g. the 15th) never gets clamped', () => {
    expect(computeNextRunDate('2026-01-15', 'monthly')).toBe('2026-02-15');
  });

  it('December rolls over into January of the NEXT year', () => {
    expect(computeNextRunDate('2026-12-31', 'monthly')).toBe('2027-01-31');
  });

  it('31 Dec -> 28 Feb chained twice never overflows past February', () => {
    // Two consecutive monthly advances starting 31 Dec: -> 31 Jan -> 28 Feb.
    const first = computeNextRunDate('2026-12-31', 'monthly');
    expect(first).toBe('2027-01-31');
    const second = computeNextRunDate(first, 'monthly');
    expect(second).toBe('2027-02-28');
  });
});

describe('computeNextRunDate — property: monthly never errors and always lands in the immediate next calendar month', () => {
  it('for any valid start date (including 29/30/31), the result is a valid date one calendar month later, day <= days in that month', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2099 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 31 }),
        (year, month, day) => {
          // Only exercise genuinely valid start dates — e.g. skip Feb 30
          // (never a real `next_run_date`, since IT would itself have been
          // produced/clamped by this same function or a real calendar
          // pick).
          fc.pre(day <= daysInMonth(year, month));
          const current = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

          const next = computeNextRunDate(current, 'monthly');

          const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(next);
          expect(match).not.toBeNull();
          const [, nyStr, nmStr, ndStr] = match!;
          const ny = Number(nyStr);
          const nm = Number(nmStr);
          const nd = Number(ndStr);

          // Never overflows past the immediate next calendar month.
          const expectedTotalMonths = year * 12 + (month - 1) + 1;
          const expectedYear = Math.floor(expectedTotalMonths / 12);
          const expectedMonth = (expectedTotalMonths % 12) + 1;
          expect(ny).toBe(expectedYear);
          expect(nm).toBe(expectedMonth);

          // The day is always valid for that month (clamped, never overflowed).
          expect(nd).toBeGreaterThanOrEqual(1);
          expect(nd).toBeLessThanOrEqual(daysInMonth(ny, nm));

          // Clamp rule: the day is either the original day (when it exists
          // in the target month) or exactly that month's last day.
          const targetDaysInMonth = daysInMonth(ny, nm);
          if (day <= targetDaysInMonth) {
            expect(nd).toBe(day);
          } else {
            expect(nd).toBe(targetDaysInMonth);
          }
        },
      ),
    );
  });

  it('property: daily/weekly never throw and always produce a well-formed YYYY-MM-DD strictly after the input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2099 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 31 }),
        fc.constantFrom<'daily' | 'weekly'>('daily', 'weekly'),
        (year, month, day, frequency) => {
          fc.pre(day <= daysInMonth(year, month));
          const current = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

          const next = computeNextRunDate(current, frequency);

          expect(next).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          // Strictly later than `current` — string comparison is valid for
          // zero-padded ISO YYYY-MM-DD.
          expect(next > current).toBe(true);

          const expectedDeltaDays = frequency === 'daily' ? 1 : 7;
          const currentMs = Date.UTC(year, month - 1, day);
          const [ny, nm, nd] = next.split('-').map(Number);
          const nextMs = Date.UTC(ny!, nm! - 1, nd!);
          expect((nextMs - currentMs) / 86_400_000).toBe(expectedDeltaDays);
        },
      ),
    );
  });
});

describe('localDateToNoonUtc', () => {
  it('round-trips through toLocalDate back to the same YYYY-MM-DD, in the default timezone', () => {
    const instant = localDateToNoonUtc('2026-01-31', 'Asia/Jakarta');
    expect(toLocalDate(instant, 'Asia/Jakarta')).toBe('2026-01-31');
  });

  it('round-trips for a date at the very end of the year', () => {
    const instant = localDateToNoonUtc('2026-12-31', 'Asia/Jakarta');
    expect(toLocalDate(instant, 'Asia/Jakarta')).toBe('2026-12-31');
  });

  it('round-trips for a UTC-negative-offset-like zone too (America/Los_Angeles)', () => {
    const instant = localDateToNoonUtc('2026-06-15', 'America/Los_Angeles');
    expect(toLocalDate(instant, 'America/Los_Angeles')).toBe('2026-06-15');
  });

  it('property: round-trips for any valid calendar date in Asia/Jakarta', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2099 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 31 }),
        (year, month, day) => {
          fc.pre(day <= daysInMonth(year, month));
          const dateStr = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const instant = localDateToNoonUtc(dateStr, 'Asia/Jakarta');
          expect(toLocalDate(instant, 'Asia/Jakarta')).toBe(dateStr);
        },
      ),
    );
  });
});
