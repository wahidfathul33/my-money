import { Skeleton } from '@/components/ui/skeleton';

// Sized to roughly match HouseholdSummary's real sections (period picker +
// expense card + a couple of list-shaped sections) — same CLS-avoidance
// reasoning as src/app/(app)/loading.tsx.
export default function HouseholdSummaryLoading() {
  return (
    <div className="px-page-x flex flex-col gap-8 pt-8 pb-8" role="status" aria-label="Memuat ringkasan keluarga">
      <Skeleton variant="text" className="h-9 w-40" />
      <Skeleton variant="card" className="h-11" />
      <Skeleton variant="card" className="h-24" />
      <Skeleton variant="list" rows={3} />
    </div>
  );
}
