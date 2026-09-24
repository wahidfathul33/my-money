/**
 * `period` (`YYYY-MM`) → "September 2026" — same idea as
 * src/features/transactions/period-label.ts's own `formatPeriodLabel`,
 * duplicated here rather than imported per
 * docs/11-tech-architecture.md §3 ("features/A tidak boleh mengimpor dari
 * features/B").
 */
const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export const PERIOD_RE = /^\d{4}-\d{2}$/;

export function formatPeriodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return MONTH_LABEL_FORMAT.format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)));
}
