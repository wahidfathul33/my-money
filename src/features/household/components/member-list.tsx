import { MemberAvatar } from './member-avatar';
import { RoleBadge } from './role-badge';
import { OwnerMenu } from './owner-menu';
import { InvitationRow } from './invitation-row';
import type { HouseholdMemberRow, PendingInvitationRow } from '../queries';

interface MemberListProps {
  householdId: string;
  currentUserId: string;
  /** Only an `owner` sees the `⋮` menu on OTHER members' rows — docs/03
   * §4.2: "Mengeluarkan anggota" / "Mengalihkan kepemilikan" are two of the
   * four role-gated actions. Purely presentational; `removeMember` and
   * `transferOwnership` (src/lib/services/memberships.ts) re-check this
   * server-side regardless. */
  isOwner: boolean;
  members: HouseholdMemberRow[];
  invitations: PendingInvitationRow[];
  /** `userId` -> count of that member's own transactions tagged to this
   * household, for the remove-dialog's tag-fate choice
   * (docs/10-ux-states.md §5.3). */
  taggedCounts: Record<string, number>;
}

/**
 * `/household/[id]/members` — "bagian Aktif & Menunggu" (todo.md). Renders
 * NO financial figures anywhere (spec.md: "Halaman ini tidak menampilkan
 * angka finansial apa pun") — only identity (name/email/avatar), role, and
 * invitation status.
 */
export function MemberList({
  householdId,
  currentUserId,
  isOwner,
  members,
  invitations,
  taggedCounts,
}: MemberListProps) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-text-muted text-sm font-semibold">Aktif ({members.length})</h2>
        <ul className="border-border divide-border rounded-card divide-y border">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-4 py-3">
              <MemberAvatar seed={member.userId} name={member.name ?? member.email} />
              <div className="min-w-0 flex-1">
                <p className="text-text truncate text-sm font-medium">
                  {member.name ?? member.email}
                  {member.userId === currentUserId && (
                    <span className="text-text-muted font-normal"> (Anda)</span>
                  )}
                </p>
                <p className="text-text-muted truncate text-xs">{member.email}</p>
              </div>
              <RoleBadge role={member.role} />
              {isOwner && member.userId !== currentUserId && (
                <OwnerMenu
                  householdId={householdId}
                  memberUserId={member.userId}
                  memberName={member.name ?? member.email}
                  taggedTransactionCount={taggedCounts[member.userId] ?? 0}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      {invitations.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-text-muted text-sm font-semibold">Menunggu ({invitations.length})</h2>
          <ul className="border-border rounded-card border px-4">
            {invitations.map((invitation) => (
              <InvitationRow
                key={invitation.id}
                householdId={householdId}
                invitationId={invitation.id}
                email={invitation.email}
                expiresAt={invitation.expiresAt}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
