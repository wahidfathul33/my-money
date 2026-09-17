'use client';

/**
 * Line chart — cash flow's cumulative daily balance and savings growth's
 * cumulative monthly total (todo.md's `LineChart`, explicitly reused for
 * both — docs/09-screen-specs.md §9 lists both as line charts of a running
 * total). See grouped-bar-chart.tsx's doc comment for the dynamic-import
 * split.
 */
import dynamic from 'next/dynamic';
import { ChartSkeleton } from './chart-skeleton';

export interface LineChartDatum {
  label: string;
  value: number;
}

const LineChartImpl = dynamic(() => import('./internal/line-chart-impl'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export function LineChart({ data, height = 200 }: { data: LineChartDatum[]; height?: number }) {
  return <LineChartImpl data={data} height={height} />;
}
