import { Skeleton } from '@/components/ui/skeleton';

// Skeleton meniru tata letak akhir (docs/09-ux-states.md §3) — mencegah
// layout shift saat data dashboard datang.
export default function DashboardLoading() {
  return (
    <div className="px-page-x flex flex-col gap-6 pt-8" role="status" aria-label="Memuat beranda">
      <Skeleton variant="text" className="h-9 w-48" />
      <Skeleton variant="card" />
      <Skeleton variant="list" rows={5} />
    </div>
  );
}
