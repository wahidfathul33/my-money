/**
 * Sharing reads — `dbRead` only (docs/11-tech-architecture.md §2). Backs
 * `/settings/sharing` (docs/09-screen-specs.md §17) and the household
 * expenses page's empty state. Every query here is scoped to the CALLER's
 * own data (`ownedBy` / `userId` equality) — this is "what does the caller
 * share", never a cross-user read, so nothing here goes through
 * src/lib/visibility/** (that module is for reading OTHER people's data).
 */
import { and, asc, eq } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { households, householdMembers, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import { countHouseholdTaggedTransactions } from '@/features/household/queries';
import type { HouseholdWealthEntityType } from '@/lib/services/sharing';

export interface SharingSummaryHousehold {
  householdId: string;
  householdName: string;
  shareWealth: boolean;
  /** This caller's own non-void transactions tagged to this household —
   * docs/09 §17's "42 bulan ini" style figure (all-time count; the mockup's
   * "bulan ini" framing is illustrative copy, not a hard filter this task
   * implements — see this task's final report for the exact deviation). */
  taggedTransactionCount: number;
}

export interface SharingExclusionItem {
  entityType: HouseholdWealthEntityType;
  entityId: string;
  name: string;
  icon: string;
}

export interface SharingSummary {
  households: SharingSummaryHousehold[];
  /** Global, not per-household — docs/03-domain-model.md §5.1's known
   * limitation ("exclude_from_household bersifat global, bukan per
   * household"). Only `wallet` is populated today; assets/debts/
   * receivables/savings_goals join in here once tasks 16-18 give them a
   * real UI (the seam is `HOUSEHOLD_WEALTH_ENTITY_TYPES`,
   * src/lib/services/sharing.ts). */
  exclusions: SharingExclusionItem[];
}

/**
 * Everything `/settings/sharing` needs to render in one screen (docs §17):
 * per-household share_wealth status + this caller's own tagged-transaction
 * count, plus the (global) exclusion list. Only ACTIVE memberships in
 * non-archived households — a removed membership already has
 * `share_wealth` forced to `false` (src/lib/services/memberships.ts
 * `revokeSharingFor`) and nothing left worth a row here.
 */
export async function getSharingSummary(userId: string): Promise<SharingSummary> {
  const membershipRows = await dbRead
    .select({
      householdId: households.id,
      householdName: households.name,
      shareWealth: householdMembers.shareWealth,
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

  const householdSummaries = await Promise.all(
    membershipRows.map(async (row) => ({
      ...row,
      taggedTransactionCount: await countHouseholdTaggedTransactions(userId, row.householdId),
    })),
  );

  const excludedWallets = await dbRead
    .select({ id: wallets.id, name: wallets.name, icon: wallets.icon })
    .from(wallets)
    .where(and(ownedBy(wallets, userId), eq(wallets.excludeFromHousehold, true)))
    .orderBy(asc(wallets.sortOrder));

  return {
    households: householdSummaries,
    exclusions: excludedWallets.map((w) => ({
      entityType: 'wallet' as const,
      entityId: w.id,
      name: w.name,
      icon: w.icon,
    })),
  };
}

/** Households the caller is an ACTIVE member of, id + name only — the shape
 * the transaction sheet's 🏠 toggle needs (src/features/transactions/sheet-data.ts).
 * Deliberately re-implemented here rather than importing
 * src/features/household/queries.ts's `listUserHouseholds` for that one
 * call site: that function returns `role`/`memberCount` too, which the
 * toggle has no use for, and pulling in a whole other feature's query
 * module for two fields is a worse coupling than four lines of SQL. */
export async function listHouseholdOptions(
  userId: string,
): Promise<{ id: string; name: string }[]> {
  const rows = await dbRead
    .select({ id: households.id, name: households.name })
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
  return rows;
}
