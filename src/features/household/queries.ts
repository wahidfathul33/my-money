/**
 * Household read queries — `dbRead` only (see src/lib/db/read.ts). These
 * back navigation chrome and display-only UI; the actual access decision
 * for `/household/[id]` and everything nested under it is made once, by
 * `requireHouseholdAccess` (src/lib/services/households.ts), inside
 * `src/app/(app)/household/[householdId]/layout.tsx`. Every page under that
 * layout only renders after that guard has already passed for the request,
 * so the queries here don't re-verify membership — tasks/10-household-core
 * spec.md's "Catatan": "setiap halaman yang ditambahkan sesudahnya otomatis
 * terlindungi — bukan perlu diamankan satu per satu."
 */
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { households, householdInvitations, householdMembers, transactions, users } from '@/lib/db/schema';

export type HouseholdRole = (typeof householdMembers.$inferSelect)['role'];

export interface HouseholdSummary {
  id: string;
  name: string;
  role: HouseholdRole;
  /** Active members only — used for the switcher's "N org" badge and the
   * archive confirmation dialog's "sebutkan jumlah anggota terdampak". */
  memberCount: number;
}

/**
 * Every household the user has an ACTIVE membership in, excluding archived
 * households — docs/03 §4.4: archiving "menyembunyikannya dari switcher".
 * Backs the switcher (src/features/household/components/context-switcher.tsx),
 * `/household`'s list-or-redirect page, and the nav shell's "hasHousehold"
 * check (src/app/(app)/layout.tsx).
 */
export async function listUserHouseholds(userId: string): Promise<HouseholdSummary[]> {
  return dbRead
    .select({
      id: households.id,
      name: households.name,
      role: householdMembers.role,
      memberCount: sql<number>`(
        select count(*)::int from household_members hm2
        where hm2.household_id = ${households.id} and hm2.status = 'active'
      )`,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(
      and(
        eq(householdMembers.userId, userId),
        eq(householdMembers.status, 'active'),
        eq(households.isArchived, false),
      ),
    )
    .orderBy(asc(households.createdAt));
}

export interface HouseholdWithRole {
  household: typeof households.$inferSelect;
  role: HouseholdRole;
  memberCount: number;
  /** tasks/12-sharing-and-privacy — the caller's OWN `share_wealth` for
   * this household, used by `/household/[id]`'s setup-steps "Bagikan yang
   * ingin dihitung" line. */
  shareWealth: boolean;
}

/**
 * A single household plus the caller's role in it and the active member
 * count — the shape `/household/[id]/page.tsx` and `.../settings/page.tsx`
 * need to render owner-only controls and the archive dialog's copy. Returns
 * `null` if the caller has no active membership; every caller of this
 * function sits behind the layout guard already, so this is a defense-in-
 * depth check, not the primary one.
 */
export async function getHouseholdWithRole(
  userId: string,
  householdId: string,
): Promise<HouseholdWithRole | null> {
  const [row] = await dbRead
    .select({
      household: households,
      role: householdMembers.role,
      shareWealth: householdMembers.shareWealth,
      memberCount: sql<number>`(
        select count(*)::int from household_members hm2
        where hm2.household_id = ${households.id} and hm2.status = 'active'
      )`,
    })
    .from(households)
    .innerJoin(
      householdMembers,
      and(
        eq(householdMembers.householdId, households.id),
        eq(householdMembers.userId, userId),
        eq(householdMembers.status, 'active'),
      ),
    )
    .where(eq(households.id, householdId))
    .limit(1);

  return row ?? null;
}

export interface HouseholdMemberRow {
  id: string;
  userId: string;
  role: HouseholdRole;
  name: string | null;
  email: string;
  image: string | null;
  joinedAt: Date | null;
}

/**
 * Active members for `/household/[id]/members` (tasks/11-household-membership
 * spec.md: "bagian Aktif & Menunggu"). Display only — the caller must
 * already sit behind `requireHouseholdAccess`/the layout guard; this never
 * returns financial data of any kind (no wallet balance, no transaction),
 * per that same spec's "Halaman ini tidak menampilkan angka finansial apa
 * pun."
 */
export async function listActiveMembers(householdId: string): Promise<HouseholdMemberRow[]> {
  return dbRead
    .select({
      id: householdMembers.id,
      userId: householdMembers.userId,
      role: householdMembers.role,
      name: users.name,
      email: users.email,
      image: users.image,
      joinedAt: householdMembers.joinedAt,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.status, 'active')))
    .orderBy(asc(householdMembers.joinedAt));
}

export type InvitationStatus = (typeof householdInvitations.$inferSelect)['status'];

export interface PendingInvitationRow {
  id: string;
  email: string;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  invitedByName: string | null;
  invitedByEmail: string;
}

/** Only ever-`pending` invitations — accepted ones become a `household_members`
 * row (shown by `listActiveMembers` instead) and revoked/expired ones have
 * nothing actionable left for the Members page to show. */
export async function listPendingInvitations(householdId: string): Promise<PendingInvitationRow[]> {
  const inviter = users;
  return dbRead
    .select({
      id: householdInvitations.id,
      email: householdInvitations.email,
      status: householdInvitations.status,
      expiresAt: householdInvitations.expiresAt,
      createdAt: householdInvitations.createdAt,
      invitedByName: inviter.name,
      invitedByEmail: inviter.email,
    })
    .from(householdInvitations)
    .innerJoin(inviter, eq(inviter.id, householdInvitations.invitedBy))
    .where(
      and(eq(householdInvitations.householdId, householdId), eq(householdInvitations.status, 'pending')),
    )
    .orderBy(asc(householdInvitations.createdAt));
}

/**
 * How many of `userId`'s OWN transactions carry this household's tag —
 * shown by the leave/remove dialogs (docs/10-ux-states.md §5.3: "42
 * transaksi Anda ditandai ke keluarga ini") so the tag-fate choice is made
 * with a concrete number, not an abstract "some transactions". Counts
 * non-voided rows only — a voided transaction's tag has no bearing on any
 * report anymore.
 */
export async function countHouseholdTaggedTransactions(
  userId: string,
  householdId: string,
): Promise<number> {
  const [row] = await dbRead
    .select({ count: count() })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.householdId, householdId),
        isNull(transactions.voidedAt),
      ),
    );
  return row?.count ?? 0;
}
