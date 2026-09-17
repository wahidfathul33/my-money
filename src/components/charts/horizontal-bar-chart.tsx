'use client';

/**
 * Horizontal bar chart — "pengeluaran per kategori" (todo.md's
 * `HorizontalBarChart`), and every other per-category/per-member breakdown
 * in this app. See grouped-bar-chart.tsx's doc comment for why this file
 * only ever imports its `./internal/*-impl` counterpart through `dynamic()`.
 */
import dynamic from 'next/dynamic';
import { ChartSkeleton } from './chart-skeleton';

export interface HorizontalBarChartDatum {
  key: string;
  label: string;
  value: number;
  /** CSS color string (e.g. `categoryColorVar('orange')`) — falls back to
   * the shared categorical palette when omitted. */
  color?: string;
}

const HorizontalBarChartImpl = dynamic(() => import('./internal/horizontal-bar-chart-impl'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export function HorizontalBarChart({ data, height = 220 }: { data: HorizontalBarChartDatum[]; height?: number }) {
  return <HorizontalBarChartImpl data={data} height={height} />;
}
