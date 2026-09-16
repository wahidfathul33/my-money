/**
 * Household net worth aggregation — docs/03-domain-model.md §14.2,
 * ADR-029 ("Kekayaan keluarga ditampilkan per anggota"), tasks/19-net-worth.
 *
 * Pure module: no I/O, no visibility/filtering logic of its own (same
 * discipline as src/lib/finance/net-worth.ts). This module does NOT know
 * how to decide which items belong to a household's wealth — that is
 * src/lib/visibility/household-items.ts's job (`status = 'active' AND
 * share_wealth = true AND exclude_from_household = false`), applied by the
 * query layer (src/features/net-worth/queries.ts) BEFORE calling in here.
 * By the time data reaches `calculateHouseholdNetWorth`, it is already
 * filtered — this module only aggregates.
 *
 * The one exception is the `sharing` flag's zeroing below, which is NOT
 * filtering (it doesn't decide who appears — every member the caller passes
 * in appears in `byMember`, sharing or not) but a structural guarantee: a
 * member flagged `sharing: false` can never contribute non-zero figures to
 * the total, even if a caller upstream passed some by mistake. Given this
 * whole task exists to catch double-counting bugs, that guarantee is cheap
 * insurance, not scope creep.
 */
import type { Money } from './money';

export interface HouseholdMemberNetWorthInput {
  userId: string;
  name: string | null;
  /** Whether this member currently shares wealth (`household_members.share_wealth`
   * for an `active` membership). Members who don't share still appear in
   * `byMember` — ADR-029: "Anggota yang belum berbagi tetap ditampilkan
   * berlabel 'Belum berbagi'." */
  sharing: boolean;
  /** Pre-filtered, pre-summed personal assets — `0n` expected (not enforced
   * by filtering here, but zeroed defensively below) when `sharing` is `false`. */
  assets: Money;
  liabilities: Money;
}

export interface HouseholdMemberNetWorthRow {
  userId: string;
  name: string | null;
  sharing: boolean;
  assets: Money;
  liabilities: Money;
  netWorth: Money;
}

export interface HouseholdNetWorthTotals {
  totalAssets: Money;
  totalLiabilities: Money;
  netWorth: Money;
}

export interface HouseholdNetWorthCoverage {
  /** Every ACTIVE member, sharing or not. */
  memberCount: number;
  /** The subset of `memberCount` with `sharing: true` — the ONLY members
   * whose figures are folded into `totals`. */
  contributingCount: number;
}

export interface HouseholdNetWorthResult {
  /** The PRIMARY view (ADR-029) — deliberately the first key on this object,
   * matching docs/06-api-contracts.md §6's `GET /api/households/[id]/net-worth`
   * response shape ("byMember sengaja diletakkan lebih dulu"). */
  byMember: HouseholdMemberNetWorthRow[];
  /** The secondary, always-coverage-qualified total. */
  totals: HouseholdNetWorthTotals;
  coverage: HouseholdNetWorthCoverage;
}

/**
 * `HOUSEHOLD_NET_WORTH = Σ(aset) − Σ(liabilitas)` over sharing members only
 * — docs/03 §14.2. `members` should already be every ACTIVE member of the
 * household (sharing or not) — this function never drops a row, it only
 * decides how much each row contributes to `totals`.
 */
export function calculateHouseholdNetWorth(members: HouseholdMemberNetWorthInput[]): HouseholdNetWorthResult {
  const byMember: HouseholdMemberNetWorthRow[] = members.map((m) => {
    // Defensive zero, not filtering — see this file's header comment.
    const assets = m.sharing ? m.assets : 0n;
    const liabilities = m.sharing ? m.liabilities : 0n;
    return { userId: m.userId, name: m.name, sharing: m.sharing, assets, liabilities, netWorth: assets - liabilities };
  });

  const totalAssets = byMember.reduce((sum, m) => sum + m.assets, 0n);
  const totalLiabilities = byMember.reduce((sum, m) => sum + m.liabilities, 0n);

  return {
    byMember,
    totals: { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities },
    coverage: {
      memberCount: members.length,
      contributingCount: members.filter((m) => m.sharing).length,
    },
  };
}
