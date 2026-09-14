/**
 * Small display-only formatters shared between deposit-card.tsx and
 * deposit-detail-client.tsx — kept out of src/lib/finance/deposit.ts
 * because they format for READING, not compute anything financial (docs/11
 * §3's "lib/finance stays pure math" boundary).
 */

/** `"4.2500"` → `"4,25"` — trims the NUMERIC(7,4) column's padded zeros and
 * uses Indonesian decimal comma (docs/08-copywriting.md §9's `id-ID`
 * convention applied consistently, not just to `formatIDR`). */
export function formatRatePercent(rateStr: string): string {
  return Number(rateStr).toString().replace('.', ',');
}

/** `"2026-04-01"` → `"1 Apr 2026"`. Parsed as UTC midnight and formatted
 * back out in UTC — this is a calendar DATE with no time-of-day component,
 * so there's no timezone conversion to get wrong, only to accidentally
 * introduce (docs/03 §15's whole point, applied here defensively even
 * though a bare date has no wall-clock ambiguity the way a timestamp does). */
export function formatDateIndo(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new RangeError(`formatDateIndo: "${dateStr}" is not a valid YYYY-MM-DD string`);
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** spec.md's required literal copy for the taxed case ("estimasi, setelah
 * pajak 20%"); the untaxed case gets its own honest label rather than
 * reusing that one unchanged — todo.md: "tax_rate otomatis 0 bila pokok ≤
 * Rp7,5 juta, DENGAN PENJELASAN". Claiming "setelah pajak 20%" on a
 * deposit that was never taxed would be its own small inaccuracy. */
export function interestEstimateLabel(taxRateStr: string): string {
  return Number(taxRateStr) > 0 ? 'estimasi, setelah pajak 20%' : 'estimasi, bebas pajak (pokok ≤ Rp7,5 juta)';
}

/** `"sisa 5 hari"` / `"jatuh tempo hari ini"` / `"telat 3 hari"` — the one
 * place every days-remaining string is worded, so the card and detail page
 * can't drift on how "today" and "overdue" read. */
export function daysRemainingLabel(days: number): string {
  if (days > 0) return `sisa ${days} hari`;
  if (days === 0) return 'jatuh tempo hari ini';
  return `telat ${Math.abs(days)} hari`;
}
