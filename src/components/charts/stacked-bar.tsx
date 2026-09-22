'use client';

/**
 * Stacked composition bar — todo.md's `StackedBar`. See
 * grouped-bar-chart.tsx's doc comment for the dynamic-import split.
 */
import dynamic from 'next/dynamic';
import { ChartSkeleton } from './chart-skeleton';

export interface StackedBarDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
}

const StackedBarImpl = dynamic(() => import('./internal/stacked-bar-impl'), {
  ssr: false,
  loading: () => <ChartSkeleton heightPx={32} />,
});

export function StackedBar({ series, height = 32 }: { series: StackedBarDatum[]; height?: number }) {
  return <StackedBarImpl series={series} height={height} />;
}
