/**
 * Savings reads — `dbRead` only (docs/11-tech-architecture.md §2). Every
 * function here is scoped so a caller can only ever see: (a) their OWN
 * personal goals (`household_id IS NULL`), or (b) shared goals belonging to
 * a household they currently have an ACTIVE membership in — docs/03
 * §10.2. There is no separate "access check that throws" here the way
 * src/lib/services/savings.ts has one for writes: a query that doesn't
 * match either condition simply returns nothing/`null`, and the calling
 * page turns that into `notFound()` — same shape as
 * src/lib/services/households.ts's `requireHouseholdAccess` callers.
 */
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { households, savingsContributions, savingsGoals, users, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import type { Money } from '@/lib/finance/money';
import type { WalletOption } from '@/features/transactions/sheet-data';

export type SavingsGoalStatus = (typeof savingsGoals.$inferSelect)['status'];

/** The caller's own active wallets, for the contribute/withdraw sheets'
 * `<WalletPicker>` (src/features/transactions/components/wallet-picker.tsx)
 * — same shape/query as that component's own data source
 * (src/features/transactions/sheet-data.ts's private `listWalletOptions`),
 * duplicated here rather than imported since that module also pulls in
 * category data this feature has no use for. */
export async function listWalletOptions(userId: string): Promise<WalletOption[]> {
  return dbRead
    .select({
      id: wallets.id,
      name: wallets.name,
      type: wallets.type,
      icon: wallets.icon,
      color: wallets.color,
    })
    .from(wallets)
    .where(and(ownedBy(wallets, userId), eq(wallets.isArchived, false)))
    .orderBy(asc(wallets.type), asc(wallets.sortOrder));
}

export interface SavingsGoalListItem {
  id: string;
  name: string;
  targetAmount: Money;
  currentAmount: Money;
  targetDate: string | null;
  status: SavingsGoalStatus;
  icon: string;
  color: string;
  householdId: string | null;
  /** `null` for a personal goal. */
  householdName: string | null;
}

function selectGoalListShape() {
  return {
    id: savingsGoals.id,
    name: savingsGoals.name,
    targetAmount: savingsGoals.targetAmount,
    currentAmount: savingsGoals.currentAmount,
    targetDate: savingsGoals.targetDate,
    status: savingsGoals.status,
    icon: savingsGoals.icon,
    color: savingsGoals.color,
    householdId: savingsGoals.householdId,
    householdName: households.name,
  };
}

/**
 * Every goal `userId` can see: their own personal goals, plus shared goals
 * for every household they're an ACTIVE member of (excluding archived
 * households — same scope `listUserHouseholds`, src/features/household/queries.ts,
 * applies to the switcher). Archived GOALS are excluded too — this backs
 * the main `/wealth/savings` list, not an "everything ever created" view.
 */
export async function listGoals(userId: string): Promise<SavingsGoalListItem[]> {
  const rows = await dbRead
    .select(selectGoalListShape())
    .from(savingsGoals)
    .leftJoin(households, eq(households.id, savingsGoals.householdId))
    .where(
      and(
        sql`(
          (${savingsGoals.householdId} IS NULL AND ${savingsGoals.userId} = ${userId})
          OR ${savingsGoals.householdId} IN (
            SELECT household_id FROM household_members
            WHERE user_id = ${userId} AND status = 'active'
          )
        )`,
        sql`${savingsGoals.householdId} IS NULL OR ${households.isArchived} = false`,
        sql`${savingsGoals.status} <> 'archived'`,
      ),
    )
    .orderBy(desc(savingsGoals.createdAt));

  return rows;
}

/** For the household savings page (`/household/[id]/savings`) — the caller
 * already sits behind that segment's membership guard (layout.tsx), so this
 * doesn't re-check membership, same as every other query under
 * src/features/household. */
export async function listHouseholdGoals(householdId: string): Promise<SavingsGoalListItem[]> {
  const rows = await dbRead
    .select(selectGoalListShape())
    .from(savingsGoals)
    .leftJoin(households, eq(households.id, savingsGoals.householdId))
    .where(and(eq(savingsGoals.householdId, householdId), sql`${savingsGoals.status} <> 'archived'`))
    .orderBy(desc(savingsGoals.createdAt));

  return rows;
}

export interface SavingsGoalDetail {
  id: string;
  userId: string;
  name: string;
  targetAmount: Money;
  currentAmount: Money;
  targetDate: string | null;
  status: SavingsGoalStatus;
  icon: string;
  color: string;
  householdId: string | null;
  householdName: string | null;
  /** Count of active members of the goal's household — `null` for a
   * personal goal. Used for `suggestedMonthlyPerMember`
   * (src/lib/finance/savings.ts). */
  activeMemberCount: number | null;
}

/**
 * A single goal, scoped to what `userId` may see — `null` if it doesn't
 * exist, or exists but isn't a personal goal of theirs nor a shared goal of
 * a household they're an active member of. The calling page turns `null`
 * into `notFound()`.
 */
export async function getGoal(userId: string, goalId: string): Promise<SavingsGoalDetail | null> {
  const [row] = await dbRead
    .select({
      id: savingsGoals.id,
      userId: savingsGoals.userId,
      name: savingsGoals.name,
      targetAmount: savingsGoals.targetAmount,
      currentAmount: savingsGoals.currentAmount,
      targetDate: savingsGoals.targetDate,
      status: savingsGoals.status,
      icon: savingsGoals.icon,
      color: savingsGoals.color,
      householdId: savingsGoals.householdId,
      householdName: households.name,
      activeMemberCount: sql<number | null>`(
        CASE WHEN ${savingsGoals.householdId} IS NULL THEN NULL
        ELSE (
          SELECT count(*)::int FROM household_members hm2
          WHERE hm2.household_id = ${savingsGoals.householdId} AND hm2.status = 'active'
        ) END
      )`,
    })
    .from(savingsGoals)
    .leftJoin(households, eq(households.id, savingsGoals.householdId))
    .where(
      and(
        eq(savingsGoals.id, goalId),
        sql`(
          (${savingsGoals.householdId} IS NULL AND ${savingsGoals.userId} = ${userId})
          OR ${savingsGoals.householdId} IN (
            SELECT household_id FROM household_members
            WHERE user_id = ${userId} AND status = 'active'
          )
        )`,
      ),
    )
    .limit(1);

  return row ?? null;
}

export interface ContributionHistoryItem {
  id: string;
  userId: string;
  contributorName: string | null;
  contributorImage: string | null;
  /** Positive = contribution, negative = withdrawal — schema comment on
   * `savings_contributions.amount`. */
  amount: Money;
  contributionDate: Date;
  note: string | null;
  walletId: string;
}

/** Full contribution/withdrawal history for a goal, newest first, with the
 * contributor's name attached — spec.md "Riwayat kontribusi menampilkan
 * nama kontributor pada goal bersama" (shown for personal goals too; it's
 * just always the caller's own name there). Access is NOT re-checked here —
 * callers always pair this with `getGoal`, which already returned non-null. */
export async function listContributions(goalId: string): Promise<ContributionHistoryItem[]> {
  return dbRead
    .select({
      id: savingsContributions.id,
      userId: savingsContributions.userId,
      contributorName: users.name,
      contributorImage: users.image,
      amount: savingsContributions.amount,
      contributionDate: savingsContributions.contributionDate,
      note: savingsContributions.note,
      walletId: savingsContributions.walletId,
    })
    .from(savingsContributions)
    .innerJoin(users, eq(users.id, savingsContributions.userId))
    .where(and(eq(savingsContributions.savingsGoalId, goalId), isNull(savingsContributions.voidedAt)))
    .orderBy(desc(savingsContributions.contributionDate), desc(savingsContributions.id));
}

export interface MemberContributionTotal {
  userId: string;
  name: string | null;
  image: string | null;
  /** Net total (contributions minus that same member's withdrawals) — always >= 0
   * in practice, since `withdraw` never lets a member's own net go negative. */
  total: Money;
}

/**
 * Per-contributor running totals for a SHARED goal's breakdown table —
 * spec.md's example:
 * ```
 * Wahid   Rp5.000.000
 * Istri   Rp3.000.000
 * ─────────────────────
 * Total   Rp8.000.000   → 40%
 * ```
 * `getContributionsByMember` (todo.md's name for this). Ordered by total
 * descending so the biggest contributor leads, matching the example.
 */
export async function getContributionsByMember(goalId: string): Promise<MemberContributionTotal[]> {
  const rows = await dbRead
    .select({
      userId: savingsContributions.userId,
      name: users.name,
      image: users.image,
      total: sql<string>`SUM(${savingsContributions.amount})`,
    })
    .from(savingsContributions)
    .innerJoin(users, eq(users.id, savingsContributions.userId))
    .where(and(eq(savingsContributions.savingsGoalId, goalId), isNull(savingsContributions.voidedAt)))
    .groupBy(savingsContributions.userId, users.name, users.image)
    .orderBy(desc(sql`SUM(${savingsContributions.amount})`));

  return rows.map((r) => ({ userId: r.userId, name: r.name, image: r.image, total: BigInt(r.total) }));
}

/** Σ savings_contributions.amount (non-void), across EVERY goal `userId` has
 * ever contributed to (personal or shared) — docs/03 §14.1's savings line
 * item, consumed by src/lib/finance/net-worth.ts. Contributions net out
 * withdrawals automatically since a withdrawal is stored as a negative
 * amount in this same column (schema comment on `savings_contributions.amount`). */
export async function getTotalSavings(userId: string): Promise<Money> {
  const [row] = await dbRead
    .select({ total: sql<string>`COALESCE(SUM(${savingsContributions.amount}), 0)` })
    .from(savingsContributions)
    .where(and(eq(savingsContributions.userId, userId), isNull(savingsContributions.voidedAt)));

  return BigInt(row?.total ?? '0');
}

/**
 * `userId`'s own net-funded amount on ONE goal — contributions minus that
 * SAME user's prior withdrawals on that SAME goal. This is the exact
 * ceiling `withdraw` (src/lib/services/savings.ts) enforces server-side;
 * exposing it here lets the withdraw sheet show "kontribusi Anda: RpX" and
 * disable the keypad's save past it client-side, in addition to (never
 * instead of) the server's own check.
 */
export async function getOwnFundedAmount(userId: string, goalId: string): Promise<Money> {
  const [row] = await dbRead
    .select({ total: sql<string>`COALESCE(SUM(${savingsContributions.amount}), 0)` })
    .from(savingsContributions)
    .where(
      and(
        eq(savingsContributions.savingsGoalId, goalId),
        eq(savingsContributions.userId, userId),
        isNull(savingsContributions.voidedAt),
      ),
    );

  return BigInt(row?.total ?? '0');
}
