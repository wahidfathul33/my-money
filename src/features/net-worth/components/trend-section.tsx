'use client';

/**
 * The range picker + trend chart on `/wealth/net-worth` —
 * docs/09-screen-specs.md §8's chip row (3B/6B/1T/Semua) above the area
 * chart. Client-only piece of that page: everything else there is a plain
 * Server Component read. Range switches re-fetch `GET /api/net-worth/history`
 * (no SWR/React Query in this project — same hand-rolled `fetch` approach as
 * src/features/transactions/components/transaction-list.tsx).
 */
import { useState, useTransition } from 'react';
import { Chip } from '@/components/ui/chip';
import { NetWorthAreaChart, type AreaChartPoint } from './area-chart';
import { deserializeMoney } from '@/lib/finance/money';
import { cn } from '@/lib/utils';
import type { NetWorthHistoryRange } from '../queries';

const RANGE_OPTIONS: { value: NetWorthHistoryRange; label: string }[] = [
  { value: '3m', label: '3B' },
  { value: '6m', label: '6B' },
  { value: '1y', label: '1T' },
  { value: 'all', label: 'Semua' },
];

export interface SerializedTrendPoint {
  date: string;
  netWorth: string;
}

interface NetWorthTrendSectionProps {
  initialRange: NetWorthHistoryRange;
  initialPoints: SerializedTrendPoint[];
  className?: string;
}

export function NetWorthTrendSection({ initialRange, initialPoints, className }: NetWorthTrendSectionProps) {
  const [range, setRange] = useState(initialRange);
  const [points, setPoints] = useState(initialPoints);
  const [isPending, startTransition] = useTransition();

  function handleRangeChange(next: NetWorthHistoryRange) {
    if (next === range) return;
    setRange(next);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/net-worth/history?range=${next}`);
        if (!res.ok) return;
        const body = (await res.json()) as { snapshots: SerializedTrendPoint[] };
        setPoints(body.snapshots);
      } catch {
        // Network hiccup — keep the previous points visible rather than
        // clearing the chart; the chip's selected state alone would then
        // look wrong, so revert it too.
        setRange(range);
      }
    });
  }

  const chartPoints: AreaChartPoint[] = points.map((p) => ({ date: p.date, netWorth: deserializeMoney(p.netWorth) }));

  return (
    <div className={className}>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Rentang waktu">
        {RANGE_OPTIONS.map((opt) => (
          <Chip key={opt.value} selected={range === opt.value} onClick={() => handleRangeChange(opt.value)}>
            {opt.label}
          </Chip>
        ))}
      </div>
      <NetWorthAreaChart points={chartPoints} className={cn('mt-3', isPending && 'opacity-60')} />
    </div>
  );
}
