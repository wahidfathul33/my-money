import { Skeleton } from '@/components/ui/skeleton';

export default function WalletDetailLoading() {
  return (
    <div className="px-page-x flex flex-col gap-6 pt-8" role="status" aria-label="Memuat dompet">
      <Skeleton variant="text" className="h-9 w-40" />
      <Skeleton variant="card" className="h-40" />
      <Skeleton variant="list" rows={5} />
    </div>
  );
}
