import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import {
  getContributionsByMember,
  getGoal,
  getOwnFundedAmount,
  listContributions,
  listWalletOptions,
} from '@/features/savings/queries';
import { resolveDefaultWalletId } from '@/features/transactions/queries';
import {
  toContributionClientData,
  toGoalDetailClientData,
  toMemberTotalClientData,
} from '@/features/savings/client-types';
import { serializeMoney } from '@/lib/finance/money';
import { GoalDetailClient } from '@/features/savings/components/goal-detail-client';
import { getActiveRecurringContributionForGoal } from '@/features/recurring/queries';
import { toRecurringContributionClientData } from '@/features/recurring/client-types';

/**
 * `/wealth/savings/[id]` — one detail page for BOTH a personal goal and a
 * shared goal reached from `/household/[id]/savings`; `getGoal` already
 * scopes visibility (src/features/savings/queries.ts's file header), so
 * this page just 404s on `null` — same "not found, never forbidden" shape
 * as `/wallets/[id]` and every `/household/[id]/**` page.
 */
export default async function SavingsGoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const goal = await getGoal(user.id, id);
  if (!goal) notFound();

  const isShared = goal.householdId !== null;
  const [contributions, memberTotals, wallets, defaultWalletId, ownFundedAmount, recurringContribution] =
    await Promise.all([
      listContributions(id),
      isShared ? getContributionsByMember(id) : Promise.resolve([]),
      listWalletOptions(user.id),
      resolveDefaultWalletId(user.id),
      getOwnFundedAmount(user.id, id),
      getActiveRecurringContributionForGoal(user.id, id),
    ]);

  return (
    <>
      <PageHeader title={goal.name} />
      <GoalDetailClient
        goal={toGoalDetailClientData(goal)}
        contributions={contributions.map(toContributionClientData)}
        memberTotals={memberTotals.map(toMemberTotalClientData)}
        wallets={wallets}
        defaultWalletId={defaultWalletId}
        ownFundedAmount={serializeMoney(ownFundedAmount)}
        recurringContribution={recurringContribution ? toRecurringContributionClientData(recurringContribution) : null}
      />
    </>
  );
}
