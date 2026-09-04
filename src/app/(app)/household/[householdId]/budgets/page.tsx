import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { currentLocalPeriod } from '@/lib/date/timezone';
import { getHouseholdBudgets, listBudgetableCategoryKeys } from '@/features/budgets/queries';
import { toHouseholdBudgetClientData } from '@/features/budgets/client-types';
import { HouseholdBudgetsPageClient } from '@/features/budgets/components/household-budgets-page-client';

/**
 * `/household/[id]/budgets` — tasks/14-budgets/spec.md. Doesn't re-verify
 * membership itself; the layout above this segment
 * (src/app/(app)/household/[householdId]/layout.tsx) already 404s a
 * non-member before this page ever renders, same convention as every other
 * page nested under it (members, settings).
 */
export default async function HouseholdBudgetsPage({
  params,
}: {
  params: Promise<{ householdId: string }>;
}) {
  await requireUser();
  const { householdId } = await params;
  const period = currentLocalPeriod();

  const [budgets, budgetableCategoryKeys] = await Promise.all([
    getHouseholdBudgets(householdId, period),
    listBudgetableCategoryKeys(householdId, period),
  ]);

  return (
    <>
      <PageHeader title="Anggaran Keluarga" />
      <HouseholdBudgetsPageClient
        householdId={householdId}
        period={period}
        budgets={budgets.map(toHouseholdBudgetClientData)}
        budgetableCategoryKeys={budgetableCategoryKeys}
      />
    </>
  );
}
