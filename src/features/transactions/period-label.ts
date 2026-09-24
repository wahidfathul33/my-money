/**
 * `period` (`YYYY-MM`) → "September 2026".
 *
 * Sengaja hidup di modul sendiri, bukan di components/period-picker.tsx:
 * modul itu `'use client'`, jadi setiap export-nya jadi client reference dan
 * `/transactions` (Server Component) tidak bisa memanggilnya — hanya
 * merender-nya sebagai komponen.
 *
 * Kembaran fungsi ini ada di src/features/reports/period-label.ts, digandakan
 * dan bukan diimpor per docs/11-tech-architecture.md §3 ("features/A tidak
 * boleh mengimpor dari features/B").
 */
const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `timeZone: 'UTC'` pada formatter + tanggal yang dibangun UTC membuat ini murni pemformatan string kalender, bukan konversi timezone kedua. */
export function formatPeriodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return MONTH_LABEL_FORMAT.format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)));
}
