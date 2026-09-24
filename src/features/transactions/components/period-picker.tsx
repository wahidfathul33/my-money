'use client';

/**
 * Month navigation for `/transactions` — docs/09 §3 "‹ September 2026 ›".
 * `period` lives in the URL (`?period=YYYY-MM`, docs/02 §6), so `‹`/`›` are
 * just `useHistoryFilters().update` calls — no local state.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { shiftPeriod } from '@/lib/date/timezone';
import { formatPeriodLabel } from '../period-label';
import { useHistoryFilters } from '../use-history-filters';

export function PeriodPicker() {
  const { filters, update } = useHistoryFilters();

  function go(delta: number) {
    const nextPeriod = shiftPeriod(filters.period, delta);
    // Changing month clears any explicit date-range override — the picker
    // IS the period selection; a stale custom range would otherwise
    // silently keep showing the old month regardless of what's tapped here.
    update({ period: nextPeriod, from: null, to: null });
  }

  return (
    <div
      className="rounded-card border-border bg-surface flex items-center justify-between border px-1"
      role="group"
      aria-label="Pilih periode"
    >
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Bulan sebelumnya"
        className="pressable flex size-11 shrink-0 items-center justify-center"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <span className="text-text flex-1 text-center text-sm font-medium">
        {formatPeriodLabel(filters.period)}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Bulan berikutnya"
        className="pressable flex size-11 shrink-0 items-center justify-center"
      >
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}
