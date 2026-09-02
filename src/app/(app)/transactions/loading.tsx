import { Skeleton } from '@/components/ui/skeleton';

export default function TransactionsLoading() {
  return (
    <div className="px-page-x flex flex-col gap-6 pt-8" role="status" aria-label="Memuat transaksi">
      <Skeleton variant="text" className="h-9 w-40" />
      <Skeleton variant="list" rows={5} />
    </div>
  );
}
