/**
 * Debts & receivables reads — `dbRead` only (docs/11-tech-architecture.md
 * §2). Every query is scoped to `ownedBy(table, userId)` — debts/receivables
 * are always personal (no household-shared concept, unlike savings goals),
 * so there is no separate "shared" access path to reason about here.
 *
 * `overdue` is computed HERE, in application code, from `dueDate`/`status`
 * plus the caller-resolved "now"/timezone — NEVER a stored column (spec.md,
 * docs/03 §12, src/lib/finance/obligation.ts's own doc comment). Every
 * function that needs it takes `now`/`tz` as parameters rather than
 * resolving them itself, so a single page load that calls several of these
 * functions (e.g. the dashboard's "Perlu Perhatian" card, which needs both
 * debts and receivables) does exactly one `getUserTimezone` lookup, not one
 * per query.
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { debts, receivables } from '@/lib/db/schema/obligations';
import { households, householdMembers } from '@/lib/db/schema/households';
import { users } from '@/lib/db/schema/users';
import { wallets } from '@/lib/db/schema/wallets';
import { ownedBy } from '@/lib/db/scoped';
import { DEFAULT_TIMEZONE, toLocalDate } from '@/lib/date/timezone';
import { isOverdue, type ObligationStatus } from '@/lib/finance/obligation';
import type { Money } from '@/lib/finance/money';
import type { WalletOption } from '@/features/transactions/sheet-data';

export type ObligationKind = 'debt' | 'receivable';

export interface ObligationListItem {
  id: string;
  kind: ObligationKind;
  /** `creditorName` for a debt, `debtorName` for a receivable. */
  name: string;
  initialAmount: Money;
  remainingAmount: Money;
  status: ObligationStatus;
  startDate: string;
  dueDate: string | null;
  affectsWallet: boolean;
  counterpartyUserId: string | null;
  /** Joined `users.name` for `counterpartyUserId` — `null` when unset. */
  counterpartyName: string | null;
  /** True when the MIRROR table already has a row pointing back at the
   * caller from this counterparty — spec.md's "Pasangan catatan dari
   * {nama} belum ada" note shows only when this is `false` AND
   * `counterpartyUserId` is set. Always `false` when `counterpartyUserId`
   * is `null` (nothing to check). */
  counterpartRecordExists: boolean;
  excludeFromHousehold: boolean;
  note: string | null;
  /** Derived, per this module's file header — never trust a stored column
   * for this because there isn't one. */
  overdue: boolean;
}

/** The caller's own active wallets, for the create/payment sheets' wallet
 * picker — same shape/duplication rationale as
 * src/features/savings/queries.ts's own `listWalletOptions` (that file's
 * doc comment explains why it's duplicated rather than imported across
 * features: sharing a single "sheet data" module would pull in unrelated
 * category data). */
export async function listWalletOptions(userId: string): Promise<WalletOption[]> {
  return dbRead
    .select({ id: wallets.id, name: wallets.name, type: wallets.type, icon: wallets.icon, color: wallets.color })
    .from(wallets)
    .where(and(ownedBy(wallets, userId), eq(wallets.isArchived, false)))
    .orderBy(asc(wallets.type), asc(wallets.sortOrder));
}

export interface CounterpartyCandidate {
  userId: string;
  name: string | null;
  email: string;
}

/**
 * Every OTHER person who is a fellow ACTIVE member of at least one
 * non-archived household the caller also actively belongs to — the
 * eligible set for `counterparty_user_id` (spec.md: "dapat diisi bila
 * lawannya sesama anggota household"). Empty when the caller has no
 * household at all; the create sheet hides the picker entirely in that
 * case (todo.md: "Pemilih counterparty_user_id bila ada household").
 */
export async function listCounterpartyCandidates(userId: string): Promise<CounterpartyCandidate[]> {
  return dbRead
    .selectDistinct({ userId: householdMembers.userId, name: users.name, email: users.email })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(
      and(
        eq(householdMembers.status, 'active'),
        eq(households.isArchived, false),
        sql`${householdMembers.userId} <> ${userId}`,
        sql`${householdMembers.householdId} IN (
          SELECT household_id FROM household_members
          WHERE user_id = ${userId} AND status = 'active'
        )`,
      ),
    );
}

/** `users.timezone` — resolved once per page load and threaded into every
 * `overdue`-deriving query below, rather than each one re-fetching it. */
export async function getUserTimezone(userId: string): Promise<string> {
  const [row] = await dbRead.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.timezone ?? DEFAULT_TIMEZONE;
}

function toListItem(
  kind: ObligationKind,
  row: {
    id: string;
    name: string;
    initialAmount: Money;
    remainingAmount: Money;
    status: ObligationStatus;
    startDate: string;
    dueDate: string | null;
    affectsWallet: boolean;
    counterpartyUserId: string | null;
    counterpartyName: string | null;
    counterpartRecordExists: boolean;
    excludeFromHousehold: boolean;
    note: string | null;
  },
  now: Date,
  tz: string,
): ObligationListItem {
  return { ...row, kind, overdue: isOverdue(row.dueDate, row.status, now, tz) };
}

/** Every debt `userId` owns, newest first, with `overdue` derived and the
 * counterpart-record check attached per row. */
export async function listDebts(
  userId: string,
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): Promise<ObligationListItem[]> {
  const rows = await dbRead
    .select({
      id: debts.id,
      name: debts.creditorName,
      initialAmount: debts.initialAmount,
      remainingAmount: debts.remainingAmount,
      status: debts.status,
      startDate: debts.startDate,
      dueDate: debts.dueDate,
      affectsWallet: debts.affectsWallet,
      counterpartyUserId: debts.counterpartyUserId,
      counterpartyName: users.name,
      excludeFromHousehold: debts.excludeFromHousehold,
      note: debts.note,
      // "Pasangan catatan dari {nama} belum ada" — spec.md. A mirror exists
      // when the counterparty has a RECEIVABLE naming the caller back.
      counterpartRecordExists: sql<boolean>`EXISTS (
        SELECT 1 FROM receivables r
        WHERE r.user_id = ${debts.counterpartyUserId}
          AND r.counterparty_user_id = ${debts.userId}
      )`,
    })
    .from(debts)
    .leftJoin(users, eq(users.id, debts.counterpartyUserId))
    .where(ownedBy(debts, userId))
    .orderBy(desc(debts.createdAt));

  return rows.map((row) => toListItem('debt', row, now, tz));
}

/** Every receivable `userId` owns — mirrors `listDebts` exactly. */
export async function listReceivables(
  userId: string,
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): Promise<ObligationListItem[]> {
  const rows = await dbRead
    .select({
      id: receivables.id,
      name: receivables.debtorName,
      initialAmount: receivables.initialAmount,
      remainingAmount: receivables.remainingAmount,
      status: receivables.status,
      startDate: receivables.startDate,
      dueDate: receivables.dueDate,
      affectsWallet: receivables.affectsWallet,
      counterpartyUserId: receivables.counterpartyUserId,
      counterpartyName: users.name,
      excludeFromHousehold: receivables.excludeFromHousehold,
      note: receivables.note,
      counterpartRecordExists: sql<boolean>`EXISTS (
        SELECT 1 FROM debts d
        WHERE d.user_id = ${receivables.counterpartyUserId}
          AND d.counterparty_user_id = ${receivables.userId}
      )`,
    })
    .from(receivables)
    .leftJoin(users, eq(users.id, receivables.counterpartyUserId))
    .where(ownedBy(receivables, userId))
    .orderBy(desc(receivables.createdAt));

  return rows.map((row) => toListItem('receivable', row, now, tz));
}

const LIVE_STATUSES: ObligationStatus[] = ['active', 'partially_paid'];

/** Σ debt.remaining_amount WHERE status NOT IN ('paid','written_off') —
 * docs/03 §14.1 (as refined by todo.md's Net Worth section, which excludes
 * BOTH terminal statuses, not just `paid`). Always a liability. */
export async function getTotalDebt(userId: string): Promise<Money> {
  const [row] = await dbRead
    .select({ total: sql<string>`COALESCE(SUM(${debts.remainingAmount}), 0)` })
    .from(debts)
    .where(and(ownedBy(debts, userId), sql`${debts.status} IN ('active','partially_paid')`));
  return BigInt(row?.total ?? '0');
}

/** Σ receivable.remaining_amount WHERE status NOT IN ('paid','written_off')
 * — counted as an asset only when the caller's `count_receivables_as_asset`
 * is true (ADR-010); this function always returns the raw total regardless,
 * leaving the conditional inclusion to src/lib/finance/net-worth.ts's
 * `calculateNetWorth`. */
export async function getTotalReceivable(userId: string): Promise<Money> {
  const [row] = await dbRead
    .select({ total: sql<string>`COALESCE(SUM(${receivables.remainingAmount}), 0)` })
    .from(receivables)
    .where(and(ownedBy(receivables, userId), sql`${receivables.status} IN ('active','partially_paid')`));
  return BigInt(row?.total ?? '0');
}

export interface UpcomingObligation {
  id: string;
  kind: ObligationKind;
  name: string;
  remainingAmount: Money;
  dueDate: string | null;
  overdue: boolean;
}

function toUpcoming(item: ObligationListItem): UpcomingObligation {
  return { id: item.id, kind: item.kind, name: item.name, remainingAmount: item.remainingAmount, dueDate: item.dueDate, overdue: item.overdue };
}

/** `YYYY-MM-DD` + `days` -> `YYYY-MM-DD`, pure calendar arithmetic (no
 * timezone conversion needed since the input is already a resolved local
 * date) — same day-overflow-normalizing `Date.UTC` technique
 * src/lib/date/timezone.ts's `localDayRange` uses. */
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/**
 * Debts + receivables due within `days` days from today, OR already
 * overdue — docs/09-screen-specs.md §1: "Perlu Perhatian ... hanya bila ada
 * yang jatuh tempo ≤7 hari / telat". A `dueDate <= today+days` window
 * naturally already includes anything overdue (`dueDate < today` implies
 * `dueDate <= today+days` for any `days >= 0`), so this single filter
 * covers docs' combined "due soon OR overdue" rule without a separate
 * union. Sorted soonest-due-or-most-overdue first.
 */
export async function getUpcomingDue(
  userId: string,
  days: number,
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): Promise<UpcomingObligation[]> {
  const [debtRows, receivableRows] = await Promise.all([listDebts(userId, now, tz), listReceivables(userId, now, tz)]);
  const windowEnd = addDaysToDateStr(toLocalDate(now, tz), days);

  return [...debtRows, ...receivableRows]
    .filter((o) => LIVE_STATUSES.includes(o.status as (typeof LIVE_STATUSES)[number]))
    .filter((o) => o.dueDate !== null && o.dueDate <= windowEnd)
    .map(toUpcoming)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : 0));
}

/** The strict subset of `getUpcomingDue` that's already overdue — used
 * where a caller wants ONLY overdue items (e.g. a "Yang telat" filter),
 * independent of any due-soon window. */
export async function getOverdue(
  userId: string,
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): Promise<UpcomingObligation[]> {
  const [debtRows, receivableRows] = await Promise.all([listDebts(userId, now, tz), listReceivables(userId, now, tz)]);
  return [...debtRows, ...receivableRows].filter((o) => o.overdue).map(toUpcoming);
}
