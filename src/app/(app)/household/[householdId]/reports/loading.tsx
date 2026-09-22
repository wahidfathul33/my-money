import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartSkeleton } from '@/components/charts/chart-skeleton';

export default function HouseholdReportsLoading() {
  return (
    <>
      <PageHeader title="Laporan Keluarga" />
      <div className="px-page-x flex flex-col gap-8 pb-8">
        <Skeleton variant="card" className="h-11 w-full" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="h-4 w-40" />
            <ChartSkeleton />
          </div>
        ))}
      </div>
    </>
  );
}
