import { Skeleton } from '@/components/ui/skeleton';

// Sized to match src/app/(app)/page.tsx's real layout section-by-section
// (docs/09-ux-states.md §3, todo.md "Skeleton seukuran konten akhir") —
// CLS < 0.1 depends on each block below occupying roughly the same box the
// real content will, not just "some skeleton, somewhere".
export default function DashboardLoading() {
  return (
    <div className="px-page-x flex flex-col gap-8 pt-8 pb-8" role="status" aria-label="Memuat beranda">
      <Skeleton variant="text" className="h-9 w-48" />

      {/* NetWorthHero: nominal + delta line + 30-day sparkline. */}
      <div className="flex flex-col gap-2">
        <Skeleton variant="text" className="h-10 w-44" />
        <Skeleton variant="text" className="h-5 w-36" />
        <Skeleton variant="text" className="h-10 w-full rounded-card" />
      </div>

      {/* Kas / Bulan Ini tiles, side by side. */}
      <div className="flex gap-3">
        <Skeleton variant="card" className="h-20 flex-1" />
        <Skeleton variant="card" className="h-20 flex-1" />
      </div>

      {/* Transaksi Terakhir — exactly 5 rows, same as the real list. */}
      <Skeleton variant="list" rows={5} />
    </div>
  );
}
