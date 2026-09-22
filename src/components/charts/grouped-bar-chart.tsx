'use client';

/**
 * Grouped bar chart — income vs expense, todo.md's `GroupedBarChart`.
 *
 * `dynamic(..., { ssr: false })` per tasks/21-reports/spec.md's Performa
 * section — Recharts must load ONLY on `/reports` (and the household
 * summary section), never as part of any other route's bundle. The real
 * `recharts` import lives in `./internal/grouped-bar-chart-impl.tsx`, which
 * this file never imports statically — `dynamic()`'s `import()` argument is
 * what makes webpack put that module (and everything it pulls in,
 * including `recharts` itself) in its own on-demand chunk. Every other
 * chart wrapper in this directory follows the exact same two-file shape.
 */
import dynamic from 'next/dynamic';
import { ChartSkeleton } from './chart-skeleton';

/** Plain numbers, not `Money` — Recharts has no bigint support, so the
 * report section building this data converts `Money` (minor units) down to
 * whole rupiah via `Number(amount) / 100` at this exact boundary. That
 * conversion is a presentation-only step for pixel positioning; the
 * `<DataTable>` rendered alongside every chart in this app always sources
 * its own cells from the original, unconverted `Money` value — spec.md's
 * "chart untuk pola, angka untuk kepastian" is what makes this split safe. */
export interface GroupedBarChartDatum {
  label: string;
  income: number;
  expense: number;
}

const GroupedBarChartImpl = dynamic(() => import('./internal/grouped-bar-chart-impl'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export function GroupedBarChart({ data, height = 220 }: { data: GroupedBarChartDatum[]; height?: number }) {
  return <GroupedBarChartImpl data={data} height={height} />;
}
