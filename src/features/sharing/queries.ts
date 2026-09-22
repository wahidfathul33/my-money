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
import { assets, debts, households, householdMembers, receivables, savingsGoals, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import { countHouseholdTaggedTransactions } from '@/features/household/queries';
import type { HouseholdWealthEntityType } from '@/lib/services/sharing';

type AssetType = (typeof assets.$inferSelect)['assetType'];

/** One icon per `assets.asset_type` — the table itself carries no `icon`
 * column (unlike wallets/savings_goals), so this is the exclusion list's
 * own mapping, every name drawn from the curated set (src/lib/icons.ts) so
 * `<Icon>` always resolves it. */
const ASSET_TYPE_ICON: Record<AssetType, string> = {
  gold: 'coins',
  deposit: 'landmark',
  property: 'building',
  vehicle: 'car',
  other: 'package',
};

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
   * household"). Covers every `HOUSEHOLD_WEALTH_ENTITY_TYPES` entry
   * (src/lib/services/sharing.ts): wallets, assets (gold/deposit/property/
   * vehicle/other — a gold or deposit shows as ONE row here, the parent
   * `assets` row, not the underlying `gold_lots`/`deposits` detail), debts,
   * receivables, and savings goals. */
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

  const [excludedWallets, excludedAssets, excludedDebts, excludedReceivables, excludedGoals] = await Promise.all([
    dbRead
      .select({ id: wallets.id, name: wallets.name, icon: wallets.icon })
      .from(wallets)
      .where(and(ownedBy(wallets, userId), eq(wallets.excludeFromHousehold, true)))
      .orderBy(asc(wallets.sortOrder)),
    dbRead
      .select({ id: assets.id, name: assets.name, assetType: assets.assetType })
      .from(assets)
      .where(and(ownedBy(assets, userId), eq(assets.excludeFromHousehold, true)))
      .orderBy(asc(assets.createdAt)),
    dbRead
      .select({ id: debts.id, name: debts.creditorName })
      .from(debts)
      .where(and(ownedBy(debts, userId), eq(debts.excludeFromHousehold, true)))
      .orderBy(asc(debts.createdAt)),
    dbRead
      .select({ id: receivables.id, name: receivables.debtorName })
      .from(receivables)
      .where(and(ownedBy(receivables, userId), eq(receivables.excludeFromHousehold, true)))
      .orderBy(asc(receivables.createdAt)),
    dbRead
      .select({ id: savingsGoals.id, name: savingsGoals.name, icon: savingsGoals.icon })
      .from(savingsGoals)
      .where(and(ownedBy(savingsGoals, userId), eq(savingsGoals.excludeFromHousehold, true)))
      .orderBy(asc(savingsGoals.createdAt)),
  ]);

  return {
    households: householdSummaries,
    exclusions: [
      ...excludedWallets.map((w) => ({
        entityType: 'wallet' as const,
        entityId: w.id,
        name: w.name,
        icon: w.icon,
      })),
      ...excludedAssets.map((a) => ({
        entityType: 'asset' as const,
        entityId: a.id,
        name: a.name,
        icon: ASSET_TYPE_ICON[a.assetType],
      })),
      ...excludedDebts.map((d) => ({
        entityType: 'debt' as const,
        entityId: d.id,
        name: d.name,
        icon: 'credit-card',
      })),
      ...excludedReceivables.map((r) => ({
        entityType: 'receivable' as const,
        entityId: r.id,
        name: r.name,
        icon: 'banknote',
      })),
      ...excludedGoals.map((g) => ({
        entityType: 'savings_goal' as const,
        entityId: g.id,
        name: g.name,
        icon: g.icon,
      })),
    ],
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
