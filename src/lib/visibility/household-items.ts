/**
 * Household wealth-item visibility predicate — docs/12-security-and-auth.md
 * §4.2, docs/03-domain-model.md §5.1 mechanism #2 ("share_wealth per
 * keanggotaan"). The SECOND (and last) of the two cross-user reads this app
 * allows — see src/lib/visibility/transactions.ts's file header for the
 * full "dua mekanisme saja" framing.
 *
 * Applies identically to wallets, assets, debts, receivables, and
 * savings_goals — docs §4.2: "Pola yang sama berlaku untuk assets, debts,
 * receivables, dan savings_goals." Only wallets has a real feature built on
 * this yet (assets/debts/receivables land in tasks 16-18); the other tables
 * already carry the same `user_id` + `exclude_from_household` shape today
 * (src/lib/db/schema/{assets,obligations,savings}.ts), so
 * `HouseholdWealthTable` below fits all five without changes later — the
 * seam this task's spec asks for ("leave clear seams for the others").
 */
import { and, eq, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { householdMembers } from '@/lib/db/schema';

/** Shape shared by wallets/assets/debts/receivables/savings_goals — owned by exactly one user (docs/03 §1.2), with a per-item opt-out (docs/03 §5.1). */
export interface HouseholdWealthTable {
  userId: PgColumn;
  excludeFromHousehold: PgColumn;
}

/**
 * Pure, in-memory restatement of docs §4.2's rule — no DB access, so every
 * branch is unit-testable with no fixtures or database.
 * `householdWealthJoin` + `notExcludedFromHousehold` (below) implement the
 * SAME rule as SQL for a real query; `__tests__/household-items.integration.test.ts`
 * proves the two agree against the real database.
 */
export interface HouseholdWealthMembershipInfo {
  status: string;
  shareWealth: boolean;
}

export function isHouseholdItemVisible(
  membership: HouseholdWealthMembershipInfo | undefined,
  excludeFromHousehold: boolean,
): boolean {
  if (!membership) return false;
  if (membership.status !== 'active') return false;
  if (!membership.shareWealth) return false;
  if (excludeFromHousehold) return false;
  return true;
}

/**
 * The JOIN condition for
 * `household_members hm ON hm.user_id = <table>.user_id AND hm.household_id
 * = $household AND hm.status = 'active' AND hm.share_wealth = true` — docs
 * §4.2. Pair with `notExcludedFromHousehold` in the same query's
 * `.where(...)`:
 *
 *   dbRead.select().from(wallets)
 *     .innerJoin(householdMembers, householdWealthJoin(wallets, householdId))
 *     .where(notExcludedFromHousehold(wallets))
 *
 * `hm.status = 'active'` is not a formality (docs §4.2: "tanpanya, data
 * anggota yang sudah keluar akan terus muncul di kekayaan keluarga") — a
 * removed member's `share_wealth` is also force-set to `false` at removal
 * time (src/lib/services/memberships.ts `revokeSharingFor`), so this join
 * is doubly guarded, but both conditions are asserted here explicitly rather
 * than relying on only one of them holding.
 */
export function householdWealthJoin(table: HouseholdWealthTable, householdId: string): SQL {
  // Four always-defined arms — see this file's tests for the rendered-SQL
  // proof, same reasoning as visibleTransactionsWhere's `!` in transactions.ts.
  return and(
    eq(householdMembers.userId, table.userId),
    eq(householdMembers.householdId, householdId),
    eq(householdMembers.status, 'active'),
    eq(householdMembers.shareWealth, true),
  )!;
}

/** The per-item escape hatch (docs §5.1) — pair with `householdWealthJoin` in the same query's `.where(...)`. */
export function notExcludedFromHousehold(table: HouseholdWealthTable): SQL {
  return eq(table.excludeFromHousehold, false);
}
