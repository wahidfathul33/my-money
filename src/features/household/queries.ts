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
import { and, asc, eq, sql } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { households, householdMembers } from '@/lib/db/schema';

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
