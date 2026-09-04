import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import {
  countHouseholdTaggedTransactions,
  getHouseholdWithRole,
  listActiveMembers,
  listPendingInvitations,
} from '@/features/household/queries';
import { MemberList } from '@/features/household/components/member-list';
import { InviteSheet } from '@/features/household/components/invite-sheet';
import { LeaveDialog } from '@/features/household/components/leave-dialog';

/**
 * `/household/[id]/members` — tasks/11-household-membership spec.md.
 * Doesn't re-verify membership itself; the layout above this segment
 * (src/app/(app)/household/[householdId]/layout.tsx) already 404s a
 * non-member before this page ever renders — `getHouseholdWithRole`
 * returning `null` here is defense in depth only, same convention as
 * `.../settings/page.tsx`.
 */
export default async function HouseholdMembersPage({
  params,
}: {
  params: Promise<{ householdId: string }>;
}) {
  const { householdId } = await params;
  const user = await requireUser();

  const result = await getHouseholdWithRole(user.id, householdId);
  if (!result) notFound();
  const { household, role } = result;
  const isOwner = role === 'owner';

  const [members, invitations, ownTaggedCount] = await Promise.all([
    listActiveMembers(householdId),
    listPendingInvitations(householdId),
    countHouseholdTaggedTransactions(user.id, householdId),
  ]);

  // Only an owner ever sees the remove-member dialog, so only an owner's
  // render needs everyone ELSE's tagged-transaction counts — skip the extra
  // queries entirely for a `member` viewer.
  const taggedCounts: Record<string, number> = {};
  if (isOwner) {
    const others = members.filter((m) => m.userId !== user.id);
    const counts = await Promise.all(
      others.map((m) => countHouseholdTaggedTransactions(m.userId, householdId)),
    );
    others.forEach((m, i) => {
      taggedCounts[m.userId] = counts[i] ?? 0;
    });
  }

  return (
    <>
      <PageHeader
        title="Anggota"
        action={isOwner ? <InviteSheet householdId={householdId} /> : undefined}
      />
      <div className="px-page-x flex flex-col gap-8 pb-8">
        <MemberList
          householdId={householdId}
          currentUserId={user.id}
          isOwner={isOwner}
          members={members}
          invitations={invitations}
          taggedCounts={taggedCounts}
        />

        <div className="flex flex-col gap-2">
          <LeaveDialog
            householdId={householdId}
            householdName={household.name}
            taggedTransactionCount={ownTaggedCount}
          />
        </div>
      </div>
    </>
  );
}
