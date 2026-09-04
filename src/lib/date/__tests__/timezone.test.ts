/**
 * Boundary tests for src/lib/date/timezone.ts — written BEFORE the helper
 * itself, per tasks/09-transaction-history/spec.md's own explicit
 * instruction: "Tulis test batas hari (23:59 dan 00:01 WIB) sebelum
 * implementasi. Ia akan gagal kalau helper-nya salah, dan tanpa test itu
 * kesalahannya baru ketahuan berminggu-minggu kemudian."
 *
 * The bug this guards against: a transaction stored at 00:01 WIB is
 * 17:01 UTC the PREVIOUS day. Grouping by `instant.toISOString().slice(0, 10)`
 * (the UTC calendar date) silently puts it on the wrong day from the user's
 * point of view. Every assertion below is written against a WIB (Asia/Jakarta,
 * UTC+7) wall-clock instant, using an explicit UTC offset so the test itself
 * never depends on the runner's local timezone.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMEZONE, localDayRange, localMonthRange, toLocalDate } from '../timezone';

describe('toLocalDate — day boundary (WIB)', () => {
  it('23:59 WIB stays on the same WIB calendar day', () => {
    const lateNightWib = new Date('2026-09-02T23:59:00+07:00');
    expect(toLocalDate(lateNightWib, DEFAULT_TIMEZONE)).toBe('2026-09-02');
  });

  it('00:01 WIB belongs to the NEW WIB day, even though its UTC date is still the previous day', () => {
    const earlyMorningWib = new Date('2026-09-02T00:01:00+07:00');
    // Sanity check on the fixture itself: this instant's UTC calendar date
    // really is 2026-09-01 (17:01Z) — the naive-UTC bug this test exists to
    // catch would return exactly that.
    expect(earlyMorningWib.toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(toLocalDate(earlyMorningWib, DEFAULT_TIMEZONE)).toBe('2026-09-02');
  });

  it('23:59 WIB the day before and 00:01 WIB are different WIB calendar days', () => {
    const justBeforeMidnight = new Date('2026-09-01T23:59:00+07:00');
    const justAfterMidnight = new Date('2026-09-02T00:01:00+07:00');
    expect(toLocalDate(justBeforeMidnight, DEFAULT_TIMEZONE)).toBe('2026-09-01');
    expect(toLocalDate(justAfterMidnight, DEFAULT_TIMEZONE)).toBe('2026-09-02');
  });
});

describe('month boundary (WIB)', () => {
  it('31 Agustus 23:59 WIB is NOT September', () => {
    const endOfAugust = new Date('2026-08-31T23:59:00+07:00');
    const localDate = toLocalDate(endOfAugust, DEFAULT_TIMEZONE);
    expect(localDate).toBe('2026-08-31');
    expect(localDate.slice(0, 7)).toBe('2026-08');
    expect(localDate.slice(0, 7)).not.toBe('2026-09');
  });

  it('1 September 00:01 WIB is already September, even though its UTC date is still 31 August', () => {
    const startOfSeptember = new Date('2026-09-01T00:01:00+07:00');
    expect(startOfSeptember.toISOString().slice(0, 7)).toBe('2026-08');
    expect(toLocalDate(startOfSeptember, DEFAULT_TIMEZONE).slice(0, 7)).toBe('2026-09');
  });
});

describe('localDayRange', () => {
  it('produces a half-open [start, end) UTC interval that contains exactly the WIB calendar day', () => {
    const { start, end } = localDayRange('2026-09-02', DEFAULT_TIMEZONE);

    // 2026-09-02 00:00 WIB == 2026-09-01 17:00Z
    expect(start.toISOString()).toBe('2026-09-01T17:00:00.000Z');
    // 2026-09-03 00:00 WIB == 2026-09-02 17:00Z (exclusive end)
    expect(end.toISOString()).toBe('2026-09-02T17:00:00.000Z');

    const earlyMorningWib = new Date('2026-09-02T00:01:00+07:00');
    const lateNightWib = new Date('2026-09-02T23:59:00+07:00');
    const previousDayLateNight = new Date('2026-09-01T23:59:00+07:00');
    const nextDayEarlyMorning = new Date('2026-09-03T00:01:00+07:00');

    expect(earlyMorningWib.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(earlyMorningWib.getTime()).toBeLessThan(end.getTime());
    expect(lateNightWib.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(lateNightWib.getTime()).toBeLessThan(end.getTime());

    expect(previousDayLateNight.getTime()).toBeLessThan(start.getTime());
    expect(nextDayEarlyMorning.getTime()).toBeGreaterThanOrEqual(end.getTime());
  });
});

describe('localMonthRange', () => {
  it('produces a half-open [start, end) UTC interval spanning exactly the WIB calendar month', () => {
    const { start, end } = localMonthRange('2026-09', DEFAULT_TIMEZONE);

    // 2026-09-01 00:00 WIB == 2026-08-31 17:00Z
    expect(start.toISOString()).toBe('2026-08-31T17:00:00.000Z');
    // 2026-10-01 00:00 WIB == 2026-09-30 17:00Z (exclusive end)
    expect(end.toISOString()).toBe('2026-09-30T17:00:00.000Z');

    const endOfAugustWib = new Date('2026-08-31T23:59:00+07:00');
    const startOfSeptemberWib = new Date('2026-09-01T00:01:00+07:00');
    const endOfSeptemberWib = new Date('2026-09-30T23:59:00+07:00');
    const startOfOctoberWib = new Date('2026-10-01T00:01:00+07:00');

    expect(endOfAugustWib.getTime()).toBeLessThan(start.getTime());
    expect(startOfSeptemberWib.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(endOfSeptemberWib.getTime()).toBeLessThan(end.getTime());
    expect(startOfOctoberWib.getTime()).toBeGreaterThanOrEqual(end.getTime());
  });

  it('handles a December → January year rollover', () => {
    const { end } = localMonthRange('2026-12', DEFAULT_TIMEZONE);
    // 2027-01-01 00:00 WIB == 2026-12-31 17:00Z
    expect(end.toISOString()).toBe('2026-12-31T17:00:00.000Z');
  });
});

describe('currentLocalPeriod', () => {
  it('formats as YYYY-MM using the given timezone', async () => {
    const { currentLocalPeriod } = await import('../timezone');
    const fixed = new Date('2026-09-02T20:00:00Z'); // 03:00 WIB on 2026-09-03
    expect(currentLocalPeriod(fixed, DEFAULT_TIMEZONE)).toBe('2026-09');
  });
});
