import { Skeleton } from '@/components/ui/skeleton';

/**
 * `dynamic()`'s `loading` fallback for every chart in this directory —
 * todo.md: "Skeleton chart seukuran chart akhir". `heightPx` MUST match the
 * real chart's own `height` prop (each `*-chart.tsx` wrapper passes the
 * same number through to both), so nothing shifts layout when the real
 * chart finishes loading.
 */
export function ChartSkeleton({ heightPx = 220 }: { heightPx?: number }) {
  return <Skeleton variant="card" style={{ height: heightPx }} className="w-full" />;
}
