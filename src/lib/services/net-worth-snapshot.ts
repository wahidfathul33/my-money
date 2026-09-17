/**
 * Net worth snapshot writer — dbWrite lives here, per
 * docs/11-tech-architecture.md §3 (only src/lib/services/** may import
 * `@/lib/db/write`). Called by `/api/cron/net-worth-snapshot`
 * (docs/06-api-contracts.md §7, scheduled 23:55 WIB daily).
 *
 * Writes TWO separate snapshot tables — `net_worth_snapshots` (one row per
 * active user) and `household_net_worth_snapshots` (one row per active
 * household) — NEVER derives the household row from personal rows
 * (spec.md: "Snapshot household tidak direkonstruksi dari snapshot
 * pribadi" — sharing scope can change at any time, and recomputing later
 * would produce a historical figure nobody was ever actually shown). Each
 * household snapshot is computed the same way the live page is:
 * `getHouseholdNetWorth` querying the source tables fresh.
 *
 * Idempotent via `ON CONFLICT (user_id, snapshot_date) DO UPDATE` / the
 * household table's equivalent unique index — a retried Vercel Cron
 * invocation after a timeout produces exactly one row per entity per date,
 * never a duplicate (docs/06 §7).
 *
 * "Active" user = `deleted_at IS NULL`; "active" household = `is_archived =
 * false`. Both are processed in batches via a keyset cursor (`id ASC`) —
 * docs/06 §7: "Cron memproses user secara batch dengan cursor ... bukan
 * sekali jalan untuk semua user" — so a large table never risks the route
 * handler's execution time limit.
 *
 * Each entity's snapshot date is resolved in ITS OWN timezone
 * (`users.timezone` / `households.timezone`), mirroring how
 * src/lib/finance/obligation.ts's `isOverdue` and task 14's budget-rollover
 * cron both resolve "today" — never the server's raw UTC date.
 */
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { households, householdNetWorthSnapshots, netWorthSnapshots, users } from '@/lib/db/schema';
import { toLocalDate } from '@/lib/date/timezone';
import { serializeMoney, type Money } from '@/lib/finance/money';
import type { NetWorthAssetBreakdown, NetWorthLiabilityBreakdown, NetWorthResult } from '@/lib/finance/net-worth';
import { getHouseholdNetWorth, getNetWorth, type HouseholdNetWorthOverview } from '@/features/net-worth/queries';

const BATCH_SIZE = 200;

function serializeAssetBreakdown(b: NetWorthAssetBreakdown): Record<string, string> {
  return {
    cash: serializeMoney(b.cash),
    savings: serializeMoney(b.savings),
    gold: serializeMoney(b.gold),
    deposits: serializeMoney(b.deposits),
    otherAssets: serializeMoney(b.otherAssets),
    receivables: serializeMoney(b.receivables),
  };
}

function serializeLiabilityBreakdown(b: NetWorthLiabilityBreakdown): Record<string, string> {
  return { cashOverdraft: serializeMoney(b.cashOverdraft), creditCards: serializeMoney(b.creditCards), debts: serializeMoney(b.debts) };
}

function personalBreakdownJson(result: NetWorthResult) {
  return { assets: serializeAssetBreakdown(result.breakdown.assets), liabilities: serializeLiabilityBreakdown(result.breakdown.liabilities) };
}

/** `{ perMember[], perCategory }` — the exact shape
 * src/lib/db/schema/snapshots.ts's own column comment on
 * `household_net_worth_snapshots.breakdown` documents. */
function householdBreakdownJson(overview: HouseholdNetWorthOverview) {
  return {
    perMember: overview.byMember.map((m) => ({
      userId: m.userId,
      name: m.name,
      sharing: m.sharing,
      assets: serializeMoney(m.assets),
      liabilities: serializeMoney(m.liabilities),
      netWorth: serializeMoney(m.netWorth),
    })),
    perCategory: {
      assets: serializeAssetBreakdown(overview.composition.assets),
      liabilities: serializeLiabilityBreakdown(overview.composition.liabilities),
    },
  };
}

async function upsertPersonalSnapshot(userId: string, snapshotDate: string, result: NetWorthResult): Promise<void> {
  const values = {
    totalAssets: result.totalAssets,
    totalLiabilities: result.totalLiabilities,
    netWorth: result.netWorth,
    breakdown: personalBreakdownJson(result),
  };
  await dbWrite
    .insert(netWorthSnapshots)
    .values({ id: uuidv7(), userId, snapshotDate, ...values })
    .onConflictDoUpdate({ target: [netWorthSnapshots.userId, netWorthSnapshots.snapshotDate], set: values });
}

async function upsertHouseholdSnapshot(householdId: string, snapshotDate: string, overview: HouseholdNetWorthOverview): Promise<void> {
  const values: {
    totalAssets: Money;
    totalLiabilities: Money;
    netWorth: Money;
    breakdown: ReturnType<typeof householdBreakdownJson>;
    memberCount: number;
    contributingCount: number;
  } = {
    totalAssets: overview.totals.totalAssets,
    totalLiabilities: overview.totals.totalLiabilities,
    netWorth: overview.totals.netWorth,
    breakdown: householdBreakdownJson(overview),
    memberCount: overview.coverage.memberCount,
    contributingCount: overview.coverage.contributingCount,
  };
  await dbWrite
    .insert(householdNetWorthSnapshots)
    .values({ id: uuidv7(), householdId, snapshotDate, ...values })
    .onConflictDoUpdate({ target: [householdNetWorthSnapshots.householdId, householdNetWorthSnapshots.snapshotDate], set: values });
}

async function snapshotAllUsers(now: Date): Promise<number> {
  let cursor: string | null = null;
  let count = 0;
  for (;;) {
    const batch = await dbWrite
      .select({ id: users.id, timezone: users.timezone })
      .from(users)
      .where(and(isNull(users.deletedAt), cursor ? gt(users.id, cursor) : undefined))
      .orderBy(asc(users.id))
      .limit(BATCH_SIZE);
    if (batch.length === 0) break;

    for (const user of batch) {
      const result = await getNetWorth(user.id);
      const snapshotDate = toLocalDate(now, user.timezone);
      await upsertPersonalSnapshot(user.id, snapshotDate, result);
      count++;
    }

    cursor = batch[batch.length - 1]!.id;
    if (batch.length < BATCH_SIZE) break;
  }
  return count;
}

async function snapshotAllHouseholds(now: Date): Promise<number> {
  let cursor: string | null = null;
  let count = 0;
  for (;;) {
    const batch = await dbWrite
      .select({ id: households.id, timezone: households.timezone })
      .from(households)
      .where(and(eq(households.isArchived, false), cursor ? gt(households.id, cursor) : undefined))
      .orderBy(asc(households.id))
      .limit(BATCH_SIZE);
    if (batch.length === 0) break;

    for (const household of batch) {
      const overview = await getHouseholdNetWorth(household.id);
      const snapshotDate = toLocalDate(now, household.timezone);
      await upsertHouseholdSnapshot(household.id, snapshotDate, overview);
      count++;
    }

    cursor = batch[batch.length - 1]!.id;
    if (batch.length < BATCH_SIZE) break;
  }
  return count;
}

export interface NetWorthSnapshotResult {
  userSnapshotCount: number;
  householdSnapshotCount: number;
}

/**
 * `/api/cron/net-worth-snapshot`'s whole job. Both loops run to completion
 * unconditionally — a rare per-user/household failure would throw and abort
 * the request (surfacing as a 500 for the cron dashboard to alert on)
 * rather than being silently swallowed, but the ordering (users first,
 * households second) means a failure partway through still leaves every
 * successfully-processed row committed (each upsert is its own statement),
 * not rolled back as a single all-or-nothing unit — appropriate here since
 * snapshots are independent, append-only rows, not a multi-table invariant
 * that needs transactional atomicity.
 */
export async function writeNetWorthSnapshots(now: Date = new Date()): Promise<NetWorthSnapshotResult> {
  const userSnapshotCount = await snapshotAllUsers(now);
  const householdSnapshotCount = await snapshotAllHouseholds(now);
  return { userSnapshotCount, householdSnapshotCount };
}
