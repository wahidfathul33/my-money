import { Skeleton } from '@/components/ui/skeleton';

export default function WalletsLoading() {
  return (
    <div className="px-page-x flex flex-col gap-6 pt-8" role="status" aria-label="Memuat dompet">
      <Skeleton variant="text" className="h-9 w-32" />
      <Skeleton variant="card" className="h-20" />
      <Skeleton variant="list" rows={4} />
    </div>
  );
}
