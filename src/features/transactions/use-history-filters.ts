'use client';

/**
 * Client-side read/write of `/transactions`' URL filter state — the parsing
 * itself lives in ./history-filters.ts (shared with the Server Component's
 * initial render); this hook adds the browser-only pieces: reading the
 * live `URLSearchParams` and writing back via `router.replace`.
 *
 * `router.replace`, never `router.push`
 * (tasks/09-transaction-history/todo.md "via router.replace (bukan push —
 * agar back tidak menelusuri tiap perubahan filter)") — toggling filter
 * chips shouldn't take N taps of the back button to undo.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useTransition } from 'react';
import { type FilterKey, FILTER_PARAM, type HistoryUrlFilters, parseHistoryFilters } from './history-filters';

export type { HistoryUrlFilters } from './history-filters';
export { hasActiveFilters } from './history-filters';

export interface UseHistoryFiltersResult {
  filters: HistoryUrlFilters;
  /** True while a filter change's resulting navigation is in flight. */
  isPending: boolean;
  /** Patches one or more filter values in the URL. `null`/`''` removes that param entirely. */
  update: (patch: Partial<Record<FilterKey, string | null>>) => void;
  /** Clears every filter except `period` — "Reset Filter" (empty-state + FilterBar). */
  resetFilters: () => void;
}

export function useHistoryFilters(): UseHistoryFiltersResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const filters = useMemo(() => parseHistoryFilters(searchParams), [searchParams]);

  const update = useCallback(
    (patch: Partial<Record<FilterKey, string | null>>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch) as [FilterKey, string | null][]) {
        const param = FILTER_PARAM[key];
        if (value === null || value === '') next.delete(param);
        else next.set(param, value);
      }
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [router, pathname, searchParams],
  );

  const resetFilters = useCallback(() => {
    update({ walletId: null, categoryId: null, type: null, from: null, to: null, q: null });
  }, [update]);

  return { filters, isPending, update, resetFilters };
}
