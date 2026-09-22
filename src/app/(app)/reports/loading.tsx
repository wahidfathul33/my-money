import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartSkeleton } from '@/components/charts/chart-skeleton';

/** `/reports`' Suspense fallback — todo.md: "Skeleton chart seukuran chart
 * akhir". Five section-shaped placeholders, each a heading-sized bar plus a
 * chart-sized block, matching the real page's section rhythm exactly so
 * nothing reflows when the real content swaps in. */
export default function ReportsLoading() {
  return (
    <>
      <PageHeader title="Laporan" />
      <div className="px-page-x flex flex-col gap-8 pb-8">
        <Skeleton variant="card" className="h-11 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="h-4 w-40" />
            <ChartSkeleton />
          </div>
        ))}
      </div>
    </>
  );
}
