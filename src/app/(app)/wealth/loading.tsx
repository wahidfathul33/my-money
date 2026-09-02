import { Skeleton } from '@/components/ui/skeleton';

export default function WealthLoading() {
  return (
    <div className="px-page-x flex flex-col gap-6 pt-8" role="status" aria-label="Memuat kekayaan">
      <Skeleton variant="text" className="h-9 w-40" />
      <Skeleton variant="card" />
      <Skeleton variant="card" />
    </div>
  );
}
