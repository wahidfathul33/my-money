/**
 * `NetWorthHero` — docs/07-design-system.md §14.3: "Nominal --text-hero +
 * delta + sparkline". PERSONAL net worth only (todo.md) — the household
 * total uses `HouseholdNetWorthTotal` instead, which is always paired with
 * `CoverageNote` rather than a delta/sparkline.
 *
 * Negative net worth is shown exactly as `MoneyText` renders any negative
 * amount — never clamped or hidden (spec.md: "Net worth negatif ditampilkan
 * apa adanya").
 */
import { TrendingDown, TrendingUp } from 'lucide-react';
import { MoneyText } from './money-text';
import { Sparkline } from '@/features/net-worth/components/sparkline';
import type { Money } from '@/lib/finance/money';
import { cn } from '@/lib/utils';

export interface NetWorthHeroPoint {
  date: string;
  netWorth: Money;
}

export interface NetWorthHeroProps {
  netWorth: Money;
  /** Oldest first. Per spec.md's acceptance criteria — "Riwayat < 2 titik →
   * delta disembunyikan, bukan ditampilkan 0%" — fewer than two points
   * hides the whole delta line; it is never rendered as a 0%/flat change. */
  history: NetWorthHeroPoint[];
  className?: string;
}

/** `(to - from) / |from|`, as a percent — `null` when `from` is exactly
 * zero (a percent change from zero is undefined, not 0% or ∞%). */
function deltaPercent(from: Money, to: Money): number | null {
  if (from === 0n) return null;
  const base = from < 0n ? -from : from;
  return Number(((to - from) * 10_000n) / base) / 100;
}

export function NetWorthHero({ netWorth, history, className }: NetWorthHeroProps) {
  const hasDelta = history.length >= 2;
  const first = hasDelta ? history[0]! : null;
  const last = hasDelta ? history[history.length - 1]! : null;
  const delta = first && last ? last.netWorth - first.netWorth : null;
  const percent = first && last ? deltaPercent(first.netWorth, last.netWorth) : null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <MoneyText amount={netWorth} tone="plain" size="hero" />

      {delta !== null && (
        <div className={cn('flex flex-wrap items-center gap-1 text-sm font-medium', delta >= 0n ? 'text-positive-readable' : 'text-negative')}>
          {delta >= 0n ? <TrendingUp className="size-4" aria-hidden="true" /> : <TrendingDown className="size-4" aria-hidden="true" />}
          <MoneyText amount={delta} tone="auto" showSign size="sm" />
          {percent !== null && <span>({percent >= 0 ? '+' : ''}{percent.toFixed(1)}%)</span>}
          <span className="text-text-muted font-normal">periode ini</span>
        </div>
      )}

      {history.length >= 2 && <Sparkline values={history.map((h) => Number(h.netWorth))} className="h-10 w-full" />}
    </div>
  );
}
