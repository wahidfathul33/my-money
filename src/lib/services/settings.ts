/**
 * User preferences, profile, and account-deletion service — dbWrite lives
 * here, per docs/11-tech-architecture.md §3. This file's own header used to
 * name exactly what tasks/22-settings-sharing-pwa adds:
 * `updateProfileAction`/`exportDataAction`/`deleteAccountAction` alongside
 * the existing `updateUserPreferences`. `exportDataAction` itself belongs
 * to task 21 (reports) — src/features/settings/export.ts — not here; this
 * module owns profile, preferences, and deletion only.
 */
import { and, eq, sql } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { users } from '@/lib/db/schema/users';
import { wallets } from '@/lib/db/schema/wallets';
import { households, householdMembers } from '@/lib/db/schema/households';
import { OwnerBlockedDeletionError, ValidationError } from '@/lib/api/errors';
import { isValidTimeZone } from '@/lib/date/timezone';

export interface UpdatePreferencesInput {
  /** ADR-010: whether receivables count toward net worth as an asset.
   * Default `false` — personal receivables have a high default rate, so net
   * worth stays conservative unless the user opts in. */
  countReceivablesAsAsset: boolean;
  /** IANA zone name (e.g. `Asia/Jakarta`) — drives every timezone-aware date
   * grouping in the app via src/lib/date/timezone.ts's helpers (transaction
   * history day-grouping, budget/obligation periods, net worth trend
   * cutoffs), all of which read this SAME `users.timezone` column. */
  timezone: string;
  /** The wallet pre-selected when opening the add-transaction sheet, or
   * `null` for no default. Ownership is verified below — never trusted
   * as-is from the caller. */
  defaultWalletId: string | null;
}

/**
 * A single-statement update — no multi-step invariant to protect for
 * `countReceivablesAsAsset`/`timezone` alone, so (like
 * src/lib/services/sharing.ts's `stopSharingEverything`) this doesn't need
 * its own `dbWrite.transaction()` wrapper EXCEPT that `defaultWalletId`
 * needs its ownership re-verified server-side (never trust a wallet id from
 * the caller, even though the Server Action layer already scopes the
 * `<Select>`'s options to the caller's own wallets) — that one extra read
 * is cheap enough to keep this a plain two-statement sequence rather than
 * opening a transaction for it.
 */
export async function updateUserPreferences(userId: string, input: UpdatePreferencesInput): Promise<void> {
  if (!isValidTimeZone(input.timezone)) {
    throw new ValidationError({ timezone: ['Zona waktu tidak valid'] });
  }

  await dbWrite.transaction(async (tx) => {
    if (input.defaultWalletId !== null) {
      const [owned] = await tx
        .select({ id: wallets.id })
        .from(wallets)
        .where(and(eq(wallets.id, input.defaultWalletId), eq(wallets.userId, userId)))
        .limit(1);
      if (!owned) {
        throw new ValidationError({ defaultWalletId: ['Dompet tidak ditemukan'] });
      }
    }

    await tx
      .update(users)
      .set({
        countReceivablesAsAsset: input.countReceivablesAsAsset,
        timezone: input.timezone,
        defaultWalletId: input.defaultWalletId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  });
}

export interface UpdateProfileInput {
  /** Display name — email is read-only everywhere in this app (it's the
   * sign-in identity, docs/09-screen-specs.md §18's "email (baca saja)"). */
  name: string;
}

/** Renames the caller. No confirmation needed — a display name carries no
 * access or financial implication, unlike every destructive action nearby
 * in this same file. */
export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<void> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new ValidationError({ name: ['Nama wajib diisi'] });
  }
  if (name.length > 80) {
    throw new ValidationError({ name: ['Nama terlalu panjang'] });
  }

  await dbWrite.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, userId));
}

/**
 * Immediate, permanent account deletion — docs/12-security-and-auth.md §11:
 * "Cascade delete penuh, segera dan permanen." No 30-day grace period (see
 * docs/16-decision-log.md's account-deletion note in tasks/22's spec.md:
 * "untuk data finansial, penghapusan yang berarti benar-benar terhapus
 * lebih baik daripada penghapusan yang bisa dibatalkan").
 *
 * Two concerns this function exists to get right, in order:
 *
 * 1. **The owner-block.** A caller who is still `owner` of any ACTIVE,
 *    non-archived household is refused outright — `OwnerBlockedDeletionError`
 *    names the specific household so the UI can link straight to
 *    `/household/{id}/settings` (transfer ownership or archive), never a
 *    bare refusal (docs/12 §11).
 *
 * 2. **FK-safe reassignment before the cascade.** `users.id` cascades
 *    (`ON DELETE CASCADE`) through everything this user exclusively OWNS —
 *    wallets, their own transactions/ledger entries, categories, debts/
 *    receivables + payments, gold/deposit assets, personal savings goals +
 *    contributions, personal budgets, net worth snapshots, household
 *    memberships. That cascade is exactly right for "hapus akun tidak
 *    menghapus transaksi anggota lain" (docs/12 §11): a household member's
 *    OWN transaction, even one tagged to a shared household, is never
 *    touched, because `transactions.user_id` only cascades rows THIS user
 *    owns.
 *
 *    But several columns reference `users.id` with `ON DELETE RESTRICT`
 *    specifically because they're an audit trail on a row this user does
 *    NOT exclusively own, and unconditionally deleting that row would
 *    either (a) destroy data other people still need, or (b) simply fail
 *    the whole transaction with a raw FK violation. Both would be wrong —
 *    the fix is to reassign the audit field to another still-active party,
 *    never to delete the row it's on:
 *      - `households.created_by` — reassigned to the household's current
 *        active owner. (Never THIS user by the time we reach this code:
 *        the owner-block above already refused if they still held that
 *        role for any active household.)
 *      - `household_invitations.invited_by` — reassigned the same way.
 *      - `budgets.created_by` (household budgets only — personal budgets
 *        cascade away with their own `user_id`) — reassigned the same way.
 *      - `savings_goals.user_id` (the CREATOR field, only for SHARED goals
 *        — `household_id IS NOT NULL`) — reassigned the same way. This is
 *        the one that matters most: a shared goal is contributed to by
 *        every active member, not just its creator
 *        (src/lib/services/savings.ts's `assertGoalAccess`), so deleting it
 *        outright would destroy OTHER members' `savings_contributions` rows
 *        too — exactly the "don't delete other members' data" rule this
 *        whole function exists to uphold. A PERSONAL goal this user created
 *        has no other contributors (only the creator can access one), so it
 *        cascades away normally.
 *      - `transactions.created_by` on the RECEIVING side of a member
 *        transfer this user SENT (`user_id` = the recipient, `created_by` =
 *        this user) — reassigned to that row's own `user_id`. The `tx_created_by_rule`
 *        CHECK constraint (src/lib/db/schema/transactions.ts) already
 *        permits `created_by = user_id` unconditionally, so this never
 *        needs a "some other active party" lookup the way the household-
 *        scoped cases above do.
 *
 *    One more cache to keep honest while contribution rows are still
 *    visible (JUST before the cascade removes this user's own `savings_contributions`
 *    rows, which happens as a side effect of the final DELETE): any SHARED
 *    goal this user contributed to (whether they created it or not) has its
 *    `current_amount` cache decremented by their own net contribution first
 *    — otherwise the goal would silently overcount forever after their rows
 *    are gone. `runReconciliation` (src/lib/db/reconcile.ts) doesn't check
 *    this particular invariant, but leaving it wrong would still be a real,
 *    if unmonitored, drift.
 *
 * Everything above runs inside ONE `dbWrite.transaction()`, ending in the
 * single `DELETE FROM users` that triggers every remaining cascade —
 * atomic: either the whole account is gone and every invariant above holds,
 * or nothing happened.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const [blockingHousehold] = await tx
      .select({ id: households.id, name: households.name })
      .from(householdMembers)
      .innerJoin(households, eq(households.id, householdMembers.householdId))
      .where(
        and(
          eq(householdMembers.userId, userId),
          eq(householdMembers.role, 'owner'),
          eq(householdMembers.status, 'active'),
          eq(households.isArchived, false),
        ),
      )
      .limit(1);

    if (blockingHousehold) {
      throw new OwnerBlockedDeletionError(blockingHousehold.id, blockingHousehold.name);
    }

    // households.created_by -> the household's current active owner.
    await tx.execute(sql`
      UPDATE households h
      SET created_by = hm.user_id, updated_at = now()
      FROM household_members hm
      WHERE h.created_by = ${userId}
        AND hm.household_id = h.id
        AND hm.role = 'owner'
        AND hm.status = 'active'
    `);

    // household_invitations.invited_by -> same target.
    await tx.execute(sql`
      UPDATE household_invitations hi
      SET invited_by = hm.user_id
      FROM household_members hm
      WHERE hi.invited_by = ${userId}
        AND hm.household_id = hi.household_id
        AND hm.role = 'owner'
        AND hm.status = 'active'
    `);

    // budgets.created_by -> same target, household budgets only (personal
    // budgets cascade away with their own user_id, untouched here).
    await tx.execute(sql`
      UPDATE budgets b
      SET created_by = hm.user_id, updated_at = now()
      FROM household_members hm
      WHERE b.created_by = ${userId}
        AND b.household_id IS NOT NULL
        AND hm.household_id = b.household_id
        AND hm.role = 'owner'
        AND hm.status = 'active'
    `);

    // savings_goals.user_id (creator) -> same target, SHARED goals only —
    // preserves the goal and every OTHER member's contributions.
    await tx.execute(sql`
      UPDATE savings_goals sg
      SET user_id = hm.user_id, updated_at = now()
      FROM household_members hm
      WHERE sg.user_id = ${userId}
        AND sg.household_id IS NOT NULL
        AND hm.household_id = sg.household_id
        AND hm.role = 'owner'
        AND hm.status = 'active'
    `);

    // current_amount cache: subtract this user's own net contribution from
    // every goal it appears in (whether they created it or not) BEFORE the
    // cascade below removes those savings_contributions rows. Mirrors
    // src/lib/services/savings.ts's applyAmountDelta CASE for status.
    await tx.execute(sql`
      UPDATE savings_goals sg
      SET current_amount = sg.current_amount - sub.total,
          status = CASE
            WHEN sg.status = 'archived' THEN sg.status
            WHEN sg.current_amount - sub.total >= sg.target_amount THEN 'completed'::savings_status
            ELSE 'active'::savings_status
          END,
          updated_at = now()
      FROM (
        SELECT savings_goal_id, COALESCE(SUM(amount), 0) AS total
        FROM savings_contributions
        WHERE user_id = ${userId} AND voided_at IS NULL
        GROUP BY savings_goal_id
      ) sub
      WHERE sg.id = sub.savings_goal_id
    `);

    // transactions.created_by -> the row's own user_id, for the receiving
    // side of any member transfer this user SENT. Never touches this user's
    // OWN transactions (those cascade away below regardless), and never
    // touches another member's untagged/tagged transactions they own
    // outright (created_by already equals their own user_id there).
    await tx.execute(sql`
      UPDATE transactions
      SET created_by = user_id, updated_at = now()
      WHERE created_by = ${userId} AND user_id <> ${userId}
    `);

    // Everything else this user exclusively owns cascades from here:
    // wallets, ledger_entries, their own transactions, categories, debts/
    // receivables + payments, gold/deposit assets, personal savings goals +
    // their own contributions, personal budgets, net worth snapshots,
    // household_members, accounts/sessions.
    await tx.delete(users).where(eq(users.id, userId));
  });
}
