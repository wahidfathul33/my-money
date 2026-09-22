/**
 * Pure URL ↔ filter-object mapping for `/transactions` — deliberately NOT
 * `'use client'`: both the Server Component initial page
 * (src/app/(app)/transactions/page.tsx, given Next's server `searchParams`
 * record) and the client hook (./use-history-filters.ts, given the browser's
 * `URLSearchParams`) need the exact same parsing so the very first render
 * and every subsequent client-side navigation agree on what the URL means.
 *
 * Filters live ENTIRELY in the URL (docs/02-information-architecture.md §6) —
 * this file has no state of its own, just parse/serialize.
 */
import { currentLocalPeriod, DEFAULT_TIMEZONE, periodDateRange } from '@/lib/date/timezone';
import type { HistoryTransactionType, TransactionHistoryFilters } from './history-queries';

export interface HistoryUrlFilters {
  period: string;
  walletId: string | null;
  categoryId: string | null;
  type: HistoryTransactionType | null;
  from: string | null;
  to: string | null;
  q: string | null;
}

export type FilterKey = keyof HistoryUrlFilters;

export const FILTER_PARAM: Record<FilterKey, string> = {
  period: 'period',
  walletId: 'wallet',
  categoryId: 'category',
  type: 'type',
  from: 'from',
  to: 'to',
  q: 'q',
};

const VALID_TYPES = new Set<string>(['income', 'expense', 'transfer']);

function firstValue(v: string | string[] | undefined | null): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * Parses filters from either source: the browser's `URLSearchParams`, or
 * Next's server `searchParams` record (`{ [key: string]: string | string[] |
 * undefined }`). `tz` only matters when no `period` is in the URL — it
 * resolves "the current month" in the CALLER's own timezone
 * (tasks/22-settings-sharing-pwa's `/settings/preferences`) rather than the
 * MVP-wide default; the client-side hook (`./use-history-filters.ts`) has no
 * cheap way to know that, so it's fine to leave that one call site on the
 * default — a client-side navigation only ever changes an ALREADY-resolved
 * `period` in the URL, never re-derives "now".
 */
export function parseHistoryFilters(
  source: URLSearchParams | Record<string, string | string[] | undefined>,
  tz: string = DEFAULT_TIMEZONE,
): HistoryUrlFilters {
  const get = (key: string): string | null =>
    source instanceof URLSearchParams ? source.get(key) : firstValue(source[key]);

  const rawType = get(FILTER_PARAM.type);
  return {
    period: get(FILTER_PARAM.period) ?? currentLocalPeriod(new Date(), tz),
    walletId: get(FILTER_PARAM.walletId),
    categoryId: get(FILTER_PARAM.categoryId),
    type: rawType && VALID_TYPES.has(rawType) ? (rawType as HistoryTransactionType) : null,
    from: get(FILTER_PARAM.from),
    to: get(FILTER_PARAM.to),
    q: get(FILTER_PARAM.q),
  };
}

/** True when any filter besides `period` is active — drives the empty-state's "filter matched nothing" vs "no transactions ever" distinction. */
export function hasActiveFilters(filters: HistoryUrlFilters): boolean {
  return Boolean(
    filters.walletId || filters.categoryId || filters.type || filters.from || filters.to || filters.q,
  );
}

/**
 * Maps URL filters onto `history-queries.ts`'s filter shape for the actual
 * DB read. `from`/`to` resolve from `period` (the whole WIB month) UNLESS
 * the user picked an explicit date range via the filter sheet, which then
 * takes precedence over the period's own bounds — see
 * src/features/transactions/history-queries.ts's `getPeriodSummary` comment
 * for why the period HEADER summary stays independent of this.
 */
export function toApiFilters(filters: HistoryUrlFilters): TransactionHistoryFilters {
  const hasExplicitRange = Boolean(filters.from || filters.to);
  const periodRange = hasExplicitRange ? null : periodDateRange(filters.period);

  return {
    walletId: filters.walletId ?? undefined,
    categoryId: filters.categoryId ?? undefined,
    type: filters.type ?? undefined,
    from: filters.from ?? periodRange?.from,
    to: filters.to ?? periodRange?.to,
    q: filters.q ?? undefined,
  };
}

/** Serializes resolved API filters back into a query string, for building the client-side "load more" fetch URL (`GET /api/transactions?walletId=...&categoryId=...&type=...&from=...&to=...&q=...&cursor=...`). */
export function apiFiltersToSearchParams(filters: TransactionHistoryFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.walletId) params.set('walletId', filters.walletId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.type) params.set('type', filters.type);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.q) params.set('q', filters.q);
  return params;
}
