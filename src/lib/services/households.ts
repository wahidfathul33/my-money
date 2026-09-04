/**
 * Households service — dbWrite transactions live here, per
 * docs/11-tech-architecture.md §3 (only src/lib/services/** may import
 * `@/lib/db/write`). Every mutation calls `requireHouseholdMember` INSIDE
 * its own transaction — tasks/10-household-core/spec.md "Aturan Otorisasi":
 * "Dipanggil di dalam transaction, bukan sebelumnya — keanggotaan dapat
 * dicabut kapan saja."
 *
 * `households` never holds a balance or any financial value (docs/03 §1.2,
 * §4.1) — nothing here ever touches a wallet, transaction, or ledger entry.
 */
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { households, householdMembers } from '@/lib/db/schema';
import { requireHouseholdMember, type HouseholdMembership } from '@/lib/auth/require-household';
import { NotFoundError } from '@/lib/api/errors';

export type Household = typeof households.$inferSelect;

export interface CreateHouseholdInput {
  name: string;
  timezone: string;
}

/**
 * One transaction: INSERT `households` + INSERT `household_members`
 * (`role='owner'`, `status='active'`) — tasks/10-household-core/spec.md
 * acceptance: "Membuat household menghasilkan households + household_members
 * (owner, active) dalam satu transaction." The creator is automatically the
 * sole owner; no other members can exist yet (task 11 adds invitations).
 * `hm_single_owner_idx` (src/lib/db/schema/households.ts) backstops this at
 * the database level even if application code ever tried to insert a second
 * active owner.
 */
export async function createHousehold(
  userId: string,
  input: CreateHouseholdInput,
): Promise<Household> {
  return dbWrite.transaction(async (tx) => {
    const id = uuidv7();
    const [household] = await tx
      .insert(households)
      .values({ id, name: input.name, timezone: input.timezone, createdBy: userId })
      .returning();

    await tx.insert(householdMembers).values({
      id: uuidv7(),
      householdId: id,
      userId,
      role: 'owner',
      status: 'active',
      joinedAt: new Date(),
    });

    return household!;
  });
}

export interface UpdateHouseholdInput {
  name: string;
  timezone: string;
}

/** Renames a household and updates its timezone. Owner-only — docs/03 §4.2:
 * "Mengubah nama / zona waktu / arsipkan" is one of only four role-gated
 * actions. */
export async function updateHousehold(
  userId: string,
  householdId: string,
  input: UpdateHouseholdInput,
): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    await requireHouseholdMember(tx, userId, householdId, /* requireOwner */ true);

    await tx
      .update(households)
      .set({ name: input.name, timezone: input.timezone, updatedAt: new Date() })
      .where(eq(households.id, householdId));
  });
}

/**
 * Archives a household — docs/03 §4.4: "Household diarsipkan, tidak
 * dihapus keras." Hides it from the switcher and `/household` list
 * (src/features/household/queries.ts filters `is_archived = false`)
 * WITHOUT touching any member's data — no cascading update to
 * `household_members` or any tagged transaction. Owner-only.
 */
export async function archiveHousehold(userId: string, householdId: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    await requireHouseholdMember(tx, userId, householdId, /* requireOwner */ true);

    await tx
      .update(households)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(households.id, householdId));
  });
}

export interface HouseholdAccess {
  household: Household;
  membership: HouseholdMembership;
}

/**
 * Guards `/household/[id]` and everything nested under it
 * (src/app/(app)/household/[householdId]/layout.tsx) — the single place
 * that decides whether the current user may even know this household
 * exists. Throws `NotFoundError` for a non-member, same as every other
 * `requireHouseholdMember` call site.
 *
 * Wrapped in `dbWrite.transaction` — not `dbRead` — purely because
 * `requireHouseholdMember` takes a `TransactionClient` and only
 * `src/lib/services/**` may import `dbWrite` (eslint
 * `no-restricted-imports`, docs/11 §3). Nothing here writes; the
 * transaction exists so a membership revoked between the membership check
 * and the household read can't produce an inconsistent read — the same
 * reasoning that requires the guard to run inside a transaction for writes
 * applies equally to this "does the caller still get to see this at all"
 * check.
 */
export async function requireHouseholdAccess(
  userId: string,
  householdId: string,
): Promise<HouseholdAccess> {
  return dbWrite.transaction(async (tx) => {
    const membership = await requireHouseholdMember(tx, userId, householdId);

    const [household] = await tx
      .select()
      .from(households)
      .where(eq(households.id, householdId))
      .limit(1);
    if (!household) {
      // Structurally shouldn't happen — household_members.household_id
      // references households (see schema) — but keep the exact same
      // response shape as "not a member" rather than a different error.
      throw new NotFoundError('Household tidak ditemukan');
    }

    return { household, membership };
  });
}
