/**
 * Layer 3 authorization — docs/12-security-and-auth.md §3.
 *
 * Every operation that touches `household_id` calls this INSIDE the same
 * `dbWrite.transaction()` as the operation itself, never as a pre-check
 * before one opens — membership can be revoked at any moment, so the check
 * and the write it gates have to be atomic. See
 * src/lib/services/households.ts for the call sites.
 *
 * `NotFoundError`, never `ForbiddenError`, when the caller isn't a member:
 * distinguishing "this household doesn't exist" from "it exists but you're
 * not in it" would confirm a guessed UUID belongs to someone else's
 * household — docs/12 §3, threat H2.
 */
import { and, eq } from 'drizzle-orm';
import { householdMembers } from '@/lib/db/schema';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import type { TransactionClient } from '@/lib/db';

export type HouseholdMembership = typeof householdMembers.$inferSelect;

/**
 * Resolves the caller's ACTIVE membership row for `householdId`.
 *
 * - Throws `NotFoundError` when there's no active membership at all —
 *   whether the household doesn't exist, the caller was never a member, or
 *   they were removed (`status <> 'active'`). All three look identical to
 *   the caller, on purpose.
 * - When `requireOwner` is true, additionally throws `ForbiddenError` if
 *   the active membership's role isn't `owner`. With exactly two roles
 *   (docs/03 §4.2 — "Dua peran, bukan empat"), a boolean is enough; there's
 *   no rank table to compare against or misread.
 */
export async function requireHouseholdMember(
  tx: TransactionClient,
  userId: string,
  householdId: string,
  requireOwner = false,
): Promise<HouseholdMembership> {
  const [membership] = await tx
    .select()
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
        eq(householdMembers.status, 'active'),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new NotFoundError('Household tidak ditemukan');
  }
  if (requireOwner && membership.role !== 'owner') {
    throw new ForbiddenError('Hanya pemilik keluarga yang dapat melakukan ini');
  }
  return membership;
}
