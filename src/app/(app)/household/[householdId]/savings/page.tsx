import { PageHeader } from '@/components/layout/page-header';
import { listHouseholdGoals } from '@/features/savings/queries';
import { toGoalListClientData } from '@/features/savings/client-types';
import { HouseholdSavingsListClient } from '@/features/savings/components/household-savings-list-client';

/**
 * `/household/[id]/savings` — this household's shared goals. Doesn't
 * re-verify membership itself; the layout above this segment
 * (src/app/(app)/household/[householdId]/layout.tsx) already 404s a
 * non-member before this page ever renders, same convention as
 * `.../members/page.tsx`.
 */
export default async function HouseholdSavingsPage({
  params,
}: {
  params: Promise<{ householdId: string }>;
}) {
  const { householdId } = await params;
  const goals = await listHouseholdGoals(householdId);

  return (
    <>
      <PageHeader title="Tabungan" />
      <HouseholdSavingsListClient goals={goals.map(toGoalListClientData)} householdId={householdId} />
    </>
  );
}
