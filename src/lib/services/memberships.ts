/**
 * Household membership lifecycle (remove / leave / transfer ownership) —
 * dbWrite transactions live here, per docs/11-tech-architecture.md §3.
 *
 * `revokeSharingFor` is the shared implementation of docs/12-security-and-auth.md
 * §5 "Pencabutan saat keluar" — called identically by `removeMember` (owner
 * removes someone else) and `leaveHousehold` (a member removes themselves).
 * Exactly the three steps spec.md prescribes, no more:
 *
 *   1. `household_members.status` -> 'removed', `removed_at` -> now()
 *   2. that same row's `share_wealth` -> false
 *   3. apply the user's choice about their own household-tagged transactions
 *      (keep the tag for historical accuracy, or release it — set
 *      `household_id` to NULL)
 *
 * "Tanpa ACL dan tanpa transfer menggantung" — there is no fourth step,
 * because this app has neither: no per-object grant to revoke (docs/12 §2,
 * "Tidak ada daftar kontrol akses") and no in-flight transfer that could be
 * left half-settled (member transfers are two ledger entries written
 * atomically in ONE transaction at creation time — src/lib/services/transfers.ts
 * — there is never a "pending" one to clean up).
 *
 * Access loss is immediate by construction, not by a separate cache-bust:
 * `requireHouseholdMember` (src/lib/auth/require-household.ts) filters on
 * `status = 'active'` freshly on every call, and step 1 above is the only
 * thing that ever changes that column away from `active`.
 */
import { and, eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { householdMembers, transactions } from '@/lib/db/schema';
import { requireHouseholdMember, type HouseholdMembership } from '@/lib/auth/require-household';
import { CannotRemoveSelfError, LastOwnerError, NotFoundError, ValidationError } from '@/lib/api/errors';
import type { TransactionClient } from '@/lib/db';

export type TransactionTagChoice = 'keep' | 'release';

/**
 * The three-step transaction described above. Guarded by `status = 'active'`
 * on the UPDATE — calling this on a membership that isn't currently active
 * is a no-op that reports "not found" rather than silently re-applying
 * removal, matching the guarded-UPDATE discipline used throughout this
 * codebase (src/lib/services/invitations.ts, transfers.ts).
 *
 * MUST be called from inside an already-open `dbWrite.transaction(...)` —
 * it takes `tx`, never opens its own, exactly like `postEntries`
 * (src/lib/finance/ledger.ts) and `requireHouseholdMember` itself.
 */
export async function revokeSharingFor(
  tx: TransactionClient,
  userId: string,
  householdId: string,
  tagChoice: TransactionTagChoice,
): Promise<void> {
  const now = new Date();

  // Steps 1 + 2 — one UPDATE, one row: status -> removed AND share_wealth
  // -> false together. Combining them into a single statement doesn't
  // change the "three steps" semantics (they're still two distinct column
  // changes applied atomically); it just avoids two round trips for what
  // is, in the database, one row transition.
  const [removed] = await tx
    .update(householdMembers)
    .set({ status: 'removed', removedAt: now, shareWealth: false, updatedAt: now })
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
        eq(householdMembers.status, 'active'),
      ),
    )
    .returning({ id: householdMembers.id });
  if (!removed) throw new NotFoundError('Keanggotaan tidak ditemukan');

  // Step 3 — the user's own choice about their own transactions' household
  // tag. 'keep' is a deliberate no-op: the default, and the one that keeps
  // historical household reports accurate (docs/03 §4.4).
  if (tagChoice === 'release') {
    await tx
      .update(transactions)
      .set({ householdId: null })
      .where(and(eq(transactions.userId, userId), eq(transactions.householdId, householdId)));
  }
}

/**
 * Owner-only. Rejects the owner targeting their own membership —
 * `CannotRemoveSelfError` — because that's a different flow
 * (`leaveHousehold`) with a different guard (`LastOwnerError`); silently
 * redirecting one into the other here would bury that distinction inside a
 * function named "remove someone ELSE".
 */
export async function removeMember(
  actorUserId: string,
  householdId: string,
  targetUserId: string,
  tagChoice: TransactionTagChoice,
): Promise<void> {
  if (actorUserId === targetUserId) {
    throw new CannotRemoveSelfError();
  }

  await dbWrite.transaction(async (tx) => {
    await requireHouseholdMember(tx, actorUserId, householdId, /* requireOwner */ true);
    await revokeSharingFor(tx, targetUserId, householdId, tagChoice);
  });
}

/**
 * Any active member (owner included) may leave, UNLESS they're the sole
 * `owner` — `hm_single_owner_idx` (src/lib/db/schema/households.ts) permits
 * at most one active owner per household, so if the leaving member IS the
 * owner, leaving would always drop the household to zero. There's
 * structurally never a second owner to fall back to; `transferOwnership`
 * has to run first.
 */
export async function leaveHousehold(
  userId: string,
  householdId: string,
  tagChoice: TransactionTagChoice,
): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const membership = await requireHouseholdMember(tx, userId, householdId);
    if (membership.role === 'owner') {
      throw new LastOwnerError();
    }
    await revokeSharingFor(tx, userId, householdId, tagChoice);
  });
}

/**
 * Owner-only. Demotes the caller to `member` and promotes `newOwnerUserId`
 * to `owner`, in that order — demoting first guarantees the household never
 * has two simultaneously-active owners, which `hm_single_owner_idx` would
 * reject anyway, but doing it in the right order means that never happens
 * even for the instant between the two statements within this transaction.
 * The target must already be an active member; you cannot hand ownership to
 * someone who hasn't accepted an invitation.
 */
export async function transferOwnership(
  userId: string,
  householdId: string,
  newOwnerUserId: string,
): Promise<void> {
  if (userId === newOwnerUserId) {
    throw new ValidationError({ newOwnerUserId: ['Pilih anggota lain untuk menjadi pemilik'] });
  }

  await dbWrite.transaction(async (tx) => {
    await requireHouseholdMember(tx, userId, householdId, /* requireOwner */ true);

    const [target] = await tx
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, newOwnerUserId),
          eq(householdMembers.status, 'active'),
        ),
      )
      .limit(1);
    if (!target) throw new NotFoundError('Anggota tidak ditemukan');

    const now = new Date();

    // Demote the current owner FIRST — see doc comment above.
    await tx
      .update(householdMembers)
      .set({ role: 'member', updatedAt: now })
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, userId),
          eq(householdMembers.role, 'owner'),
          eq(householdMembers.status, 'active'),
        ),
      );

    await tx
      .update(householdMembers)
      .set({ role: 'owner', updatedAt: now })
      .where(eq(householdMembers.id, target.id));
  });
}

export type { HouseholdMembership };
