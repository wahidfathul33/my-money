/**
 * Compact axis-tick formatting for chart Y-axes — NOT a money-formatting
 * function in the docs/05-financial-integrity.md §2 sense (that's
 * `formatIDR`, src/lib/finance/money.ts, which every `<DataTable>` cell and
 * `<MoneyText>` use for the actual, exact figure). This is presentation-only
 * rounding so a Y-axis showing "Rp1.500.000" doesn't force extra chart width
 * — spec.md's "kalau tidak muat, persingkat" applies to axis labels in
 * general, not just month names. Callers pass a plain `number` (already
 * divided down from minor units at the chart-data-building boundary, see
 * src/components/charts/grouped-bar-chart.tsx's doc comment) since Recharts
 * itself has no bigint support.
 */
export function compactIDR(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1_000_000_000) return `${sign}${trimDecimal(abs / 1_000_000_000)}M`;
  if (abs >= 1_000_000) return `${sign}${trimDecimal(abs / 1_000_000)}jt`;
  if (abs >= 1_000) return `${sign}${trimDecimal(abs / 1_000)}rb`;
  return `${sign}${Math.round(abs)}`;
}

function trimDecimal(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

/** Truncates a category/member label for a chart axis tick — spec.md: axis
 * labels are never rotated, so a long name gets shortened with an ellipsis
 * instead. The FULL name always still appears in the paired `<DataTable>`. */
export function truncateLabel(label: string, maxChars = 10): string {
  if (label.length <= maxChars) return label;
  return `${label.slice(0, maxChars - 1)}…`;
}
