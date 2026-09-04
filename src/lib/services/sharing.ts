/**
 * Sharing service — dbWrite transactions live here, per
 * docs/11-tech-architecture.md §3. Owns the two mechanisms
 * docs/03-domain-model.md §5 allows and nothing else (ADR-024: no per-object
 * ACL) — `share_wealth` per membership, and `exclude_from_household` per
 * item. Household-tag mutations on `transactions` itself live in
 * src/lib/services/transactions.ts (`setTransactionHousehold`,
 * `bulkTagTransactions`); this file is mechanism #2 plus the summary/"stop
 * sharing everything" reads and writes tasks/12-sharing-and-privacy/spec.md
 * asks for.
 */
import { and, eq } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { dbWrite } from '@/lib/db/write';
import { assets, debts, householdMembers, receivables, savingsGoals, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import { requireHouseholdMember } from '@/lib/auth/require-household';
import { NotFoundError } from '@/lib/api/errors';

/**
 * Sets the caller's OWN `share_wealth` for one household — docs/03 §5.1's
 * single switch. `requireHouseholdMember` both verifies the caller is an
 * active member AND resolves the membership row to update in one query —
 * there is deliberately no path that accepts someone else's membership id:
 * this is "berbagi kekayaan sendiri", never settable for another member
 * (docs/03 §4.2's role table — the same action for both roles, but always
 * about the actor's own data).
 *
 * Turning OFF is exactly as frictionless as turning on, code-wise — the
 * asymmetry (confirmation dialog required only to turn ON) lives entirely
 * in the UI layer (src/features/sharing/components/share-wealth-toggle.tsx),
 * never in this function. Both directions take effect immediately: the next
 * read through src/lib/visibility/household-items.ts sees the new value,
 * there is no cache to bust.
 */
export async function setShareWealth(userId: string, householdId: string, share: boolean): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const membership = await requireHouseholdMember(tx, userId, householdId);
    await tx
      .update(householdMembers)
      .set({ shareWealth: share, updatedAt: new Date() })
      .where(eq(householdMembers.id, membership.id));
  });
}

/**
 * `household_members.share_wealth` OFF for every one of the caller's
 * memberships in one transaction — spec.md's "Berhenti berbagi semuanya",
 * docs/09-screen-specs.md §17: the one asymmetric bulk action this app
 * offers (no "share everything" counterpart exists anywhere — spec.md
 * "Batasan: Jangan ... tombol 'bagikan semuanya'"). Only touches ACTIVE
 * memberships that currently have sharing on; already-off or removed rows
 * are left alone, and are excluded from the returned count.
 */
export async function stopSharingEverything(userId: string): Promise<{ affectedCount: number }> {
  const result = await dbWrite
    .update(householdMembers)
    .set({ shareWealth: false, updatedAt: new Date() })
    .where(
      and(
        eq(householdMembers.userId, userId),
        eq(householdMembers.status, 'active'),
        eq(householdMembers.shareWealth, true),
      ),
    );
  return { affectedCount: result.rowCount ?? 0 };
}

/**
 * The five tables `exclude_from_household` lives on today — docs/03 §5.1.
 * Only `wallet` has a real feature built on top of it yet (assets/debts/
 * receivables/savings_goals land in tasks 16-18); their schema already
 * carries the identical `id` + `user_id` + `exclude_from_household` +
 * `updated_at` shape (src/lib/db/schema/{assets,obligations,savings}.ts),
 * so adding a case here is the ENTIRE seam those tasks need — no service
 * change beyond registering their table.
 */
export const HOUSEHOLD_WEALTH_ENTITY_TYPES = ['wallet', 'asset', 'debt', 'receivable', 'savings_goal'] as const;
export type HouseholdWealthEntityType = (typeof HOUSEHOLD_WEALTH_ENTITY_TYPES)[number];

type ExcludableTable = PgTable & {
  id: PgColumn;
  userId: PgColumn;
  excludeFromHousehold: PgColumn;
  updatedAt: PgColumn;
};

const ENTITY_TABLES: Record<HouseholdWealthEntityType, ExcludableTable> = {
  wallet: wallets,
  asset: assets,
  debt: debts,
  receivable: receivables,
  savings_goal: savingsGoals,
};

/**
 * Toggles `exclude_from_household` on one item — owner-only (`ownedBy`,
 * re-checked here even though every caller sits behind `requireUser()`
 * already). Not gated on `share_wealth` being on for any household: the
 * exclusion itself is inert until sharing is — but setting it ahead of time
 * is harmless and lets someone prepare exclusions before ever flipping the
 * switch (docs/03 §5.1: "dipakai untuk menyembunyikan satu-dua item
 * tertentu SETELAH share_wealth aktif" — the ordering is a UX suggestion,
 * not a technical requirement enforced here).
 */
export async function setExcludeFromHousehold(
  userId: string,
  entityType: HouseholdWealthEntityType,
  entityId: string,
  exclude: boolean,
): Promise<void> {
  const table = ENTITY_TABLES[entityType];

  await dbWrite.transaction(async (tx) => {
    const result = await tx
      .update(table)
      .set({ excludeFromHousehold: exclude, updatedAt: new Date() })
      .where(and(eq(table.id, entityId), ownedBy(table, userId)));

    if ((result.rowCount ?? 0) === 0) {
      throw new NotFoundError('Data tidak ditemukan');
    }
  });
}
