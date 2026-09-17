/**
 * Pure report-aggregation helpers — tasks/21-reports/spec.md's mobile chart
 * rules ("Maksimal 6 seri; sisanya digabung", "Satu kategori > 80% → catatan
 * 'Didominasi {kategori}'"). No I/O, no framework imports (same discipline
 * as src/lib/finance/money.ts/budget.ts) — every branch here is unit
 * testable with no database.
 *
 * Deliberately separate from src/features/reports/queries.ts: the query
 * layer decides WHICH rows exist, this module decides how a caller squeezes
 * an arbitrary-length list down to what a 360px chart can render without
 * horizontal scroll. `getHouseholdSummary`'s API contract (docs/06 §6)
 * explicitly does NOT merge its `byCategory` — "tidak ada yang dilebur
 * menjadi 'Lainnya'" — so this module is applied by chart-rendering
 * components, never baked into a query's own result.
 */
import type { Money } from './money';

export interface SeriesItem {
  key: string;
  label: string;
  amount: Money;
}

export const MAX_CHART_SERIES = 6;
export const OTHER_KEY = '__other__';
export const OTHER_LABEL = 'Lainnya';

/**
 * Keeps the first `maxSeries - 1` items and folds everything after that into
 * one trailing "Lainnya" item summing the remainder — spec.md: "Kalau data
 * tidak muat, kurangi kategorinya (gabungkan ekor menjadi 'Lainnya')."
 * `items` MUST already be sorted the way the caller wants "the head" to mean
 * (normally descending by amount) — this function never re-sorts.
 * A no-op when `items.length <= maxSeries` (nothing needs folding, so
 * showing exactly `maxSeries` real categories is fine — folding one real
 * category into an "Lainnya" bucket of one would be pointless).
 */
export function mergeTailIntoOther(
  items: readonly SeriesItem[],
  maxSeries: number = MAX_CHART_SERIES,
  otherLabel: string = OTHER_LABEL,
): SeriesItem[] {
  if (maxSeries < 1) {
    throw new RangeError('mergeTailIntoOther: maxSeries must be >= 1');
  }
  if (items.length <= maxSeries) {
    return [...items];
  }

  const head = items.slice(0, maxSeries - 1);
  const tail = items.slice(maxSeries - 1);
  const otherAmount = tail.reduce((sum, item) => sum + item.amount, 0n);

  return [...head, { key: OTHER_KEY, label: otherLabel, amount: otherAmount }];
}

/**
 * `amount / total` as a percent, rounded to one decimal place, computed in
 * integer basis points so it never drifts from a float division the way
 * `Number(amount) / Number(total) * 100` could for large rupiah figures
 * (docs/05-financial-integrity.md §2's "money is never a float" applies to
 * money going INTO the calculation even when the result itself is a plain
 * display percentage). `total <= 0` returns `0` rather than dividing by zero
 * or `Infinity` — an empty period has no share to show.
 */
export function sharePercent(amount: Money, total: Money): number {
  if (total <= 0n) return 0;
  const basisPoints = (amount * 100_000n) / total; // 3 extra digits of precision
  return Number(basisPoints) / 1000;
}

export interface DominantCategoryResult {
  item: SeriesItem;
  percent: number;
}

/**
 * The single item whose share of `total` exceeds 80%, if any — spec.md's
 * "Satu kategori > 80% → catatan 'Didominasi {kategori}', chart tetap
 * benar." Only ever one item can qualify (two items can't each hold > 50%
 * of the same total... let alone > 80%), so this returns at most one result
 * rather than a list. `items` need not be sorted; every item is checked.
 */
export function findDominantCategory(items: readonly SeriesItem[], total: Money): DominantCategoryResult | null {
  if (total <= 0n) return null;
  for (const item of items) {
    const percent = sharePercent(item.amount, total);
    if (percent > 80) {
      return { item, percent };
    }
  }
  return null;
}

const SHORT_MONTH_FORMAT = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'UTC' });

/**
 * `period` (`YYYY-MM`) → a short, never-rotated axis label ("Sep", not
 * "September") — spec.md's mobile chart rule. Formatted via a UTC-anchored
 * date purely for calendar-string arithmetic, same trick as
 * src/features/transactions/components/period-picker.tsx's
 * `formatPeriodLabel` (`timeZone: 'UTC'` on the formatter avoids a second,
 * redundant timezone conversion — `period` is already a calendar string).
 */
export function shortMonthLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return SHORT_MONTH_FORMAT.format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)));
}
