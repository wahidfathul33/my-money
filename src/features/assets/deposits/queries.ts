/**
 * Deposits reads — `dbRead` only (docs/11-tech-architecture.md §2), scoped
 * to the caller via `ownedBy` on every query. Mirrors
 * src/features/savings/queries.ts's split: mutations live in
 * src/lib/services/deposits.ts, reads live here.
 *
 * Display-only derived figures (accrued interest ESTIMATE, days remaining,
 * current value) are deliberately NOT computed here — they need "today" at
 * RENDER time, and src/features/savings/components/goal-card.tsx already
 * establishes the pattern this feature follows instead: hand the raw,
 * serialized deposit fields to a Client Component and call
 * src/lib/finance/deposit.ts's pure functions there, with `new Date()`.
 * `getTotalDepositValue` and `getUpcomingMaturities` below are the two
 * exceptions — they're aggregates/filters that need "today" server-side
 * for a WHERE clause, not a value to display.
 */
import { and, asc, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { dbRead } from '@/lib/db/read';
import { assets, deposits, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import type { Money } from '@/lib/finance/money';
import { toLocalDate } from '@/lib/date/timezone';
import type { WalletOption } from '@/features/transactions/sheet-data';

export type DepositStatus = (typeof deposits.$inferSelect)['status'];
export type PayoutSchedule = (typeof deposits.$inferSelect)['payoutSchedule'];

/** The caller's own active wallets, for the create sheet's source-wallet
 * picker and the withdraw dialog's destination-wallet picker — same
 * shape/query as src/features/savings/queries.ts's identically-named
 * function (duplicated rather than imported for the same reason that file
 * gives: importing from src/features/transactions/sheet-data.ts would pull
 * in category data this feature has no use for). */
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

export interface DepositListItem {
  id: string;
  assetId: string;
  bankName: string;
  principal: Money;
  /** NUMERIC(7,4) as Drizzle returns it — a decimal string, e.g. `"4.2500"`. */
  interestRateAnnual: string;
  /** NUMERIC(5,4) as a decimal string, e.g. `"0.2000"`. */
  taxRate: string;
  startDate: string; // YYYY-MM-DD
  maturityDate: string; // YYYY-MM-DD
  payoutSchedule: PayoutSchedule;
  aroEnabled: boolean;
  aroIncludeInterest: boolean;
  status: DepositStatus;
  walletId: string | null;
  rolledFromId: string | null;
  lastInterestPaymentDate: string | null;
  excludeFromHousehold: boolean;
}

function selectDepositListShape() {
  return {
    id: deposits.id,
    assetId: deposits.assetId,
    bankName: deposits.bankName,
    principal: deposits.principal,
    interestRateAnnual: deposits.interestRateAnnual,
    taxRate: deposits.taxRate,
    startDate: deposits.startDate,
    maturityDate: deposits.maturityDate,
    payoutSchedule: deposits.payoutSchedule,
    aroEnabled: deposits.aroEnabled,
    aroIncludeInterest: deposits.aroIncludeInterest,
    status: deposits.status,
    walletId: deposits.walletId,
    rolledFromId: deposits.rolledFromId,
    lastInterestPaymentDate: deposits.lastInterestPaymentDate,
    excludeFromHousehold: assets.excludeFromHousehold,
  };
}

/** Every deposit `userId` owns, EXCLUDING `withdrawn` ones — this backs the
 * main `/wealth/assets/deposits` list, not a full history. `matured`
 * deposits still show (spec.md: still withdrawable, and ARO-pending ones
 * need to stay visible), only a completed withdrawal drops off. Newest
 * first by creation. */
export async function listDeposits(userId: string): Promise<DepositListItem[]> {
  return dbRead
    .select(selectDepositListShape())
    .from(deposits)
    .innerJoin(assets, eq(assets.id, deposits.assetId))
    .where(and(ownedBy(deposits, userId), ne(deposits.status, 'withdrawn')))
    .orderBy(desc(deposits.createdAt));
}

/** Σ `principal` of `active` deposits ONLY — docs/03 §14.1's exact formula
 * ("nilai_deposito = Σ pokok deposito aktif"). Deliberately does NOT read
 * `assets.cached_value` (see src/lib/services/deposits.ts's file header on
 * why that column can lag/differ) and deliberately does NOT include
 * `matured` deposits — ADR-013's accepted cost of skipping ARO. */
export async function getTotalDepositValue(userId: string): Promise<Money> {
  const [row] = await dbRead
    .select({ total: sql<string>`COALESCE(SUM(${deposits.principal}), 0)` })
    .from(deposits)
    .where(and(ownedBy(deposits, userId), eq(deposits.status, 'active')));

  return BigInt(row?.total ?? '0');
}

export interface UpcomingMaturity {
  id: string;
  bankName: string;
  principal: Money;
  maturityDate: string;
}

/** `active` deposits maturing within `days` days (inclusive), soonest
 * first — feeds the future dashboard's "Perlu Perhatian" section
 * (docs/09-screen-specs.md §1/§6: "Deposito jatuh tempo dalam 7 hari...
 * muncul di 'Perlu Perhatian' dashboard"). That section doesn't exist yet
 * (src/app/(app)/page.tsx is still task 04's placeholder — see that file's
 * own doc comment), so this is the query the dashboard task consumes,
 * same "build the capability, dashboard wires it in later" shape
 * src/lib/finance/budget.ts's `needsAttention` already established for
 * budgets. */
export async function getUpcomingMaturities(userId: string, days: number, today: Date = new Date()): Promise<UpcomingMaturity[]> {
  const todayStr = toLocalDate(today);
  const cutoffStr = toLocalDate(new Date(today.getTime() + days * 86_400_000));

  return dbRead
    .select({ id: deposits.id, bankName: deposits.bankName, principal: deposits.principal, maturityDate: deposits.maturityDate })
    .from(deposits)
    .where(and(ownedBy(deposits, userId), eq(deposits.status, 'active'), gte(deposits.maturityDate, todayStr), lte(deposits.maturityDate, cutoffStr)))
    .orderBy(asc(deposits.maturityDate));
}

export interface DepositDetail extends DepositListItem {
  userId: string;
  /** Bank name of the deposit this one was rolled FROM, for the "tautan ke
   * deposito asal" link (todo.md) — `null` when `rolledFromId` is `null`. */
  rolledFromBankName: string | null;
}

const rolledFromDeposits = alias(deposits, 'rolled_from_deposits');

/** A single deposit, scoped to `userId` — `null` if it doesn't exist or
 * isn't theirs (the calling page turns that into `notFound()`, same shape
 * as every other detail query in this codebase). Includes `withdrawn`
 * deposits (unlike `listDeposits`) so a direct link to one — e.g. from a
 * successor's "rolled from" badge — still resolves. */
export async function getDeposit(userId: string, depositId: string): Promise<DepositDetail | null> {
  const [row] = await dbRead
    .select({
      ...selectDepositListShape(),
      userId: deposits.userId,
      rolledFromBankName: rolledFromDeposits.bankName,
    })
    .from(deposits)
    .innerJoin(assets, eq(assets.id, deposits.assetId))
    .leftJoin(rolledFromDeposits, eq(rolledFromDeposits.id, deposits.rolledFromId))
    .where(and(eq(deposits.id, depositId), ownedBy(deposits, userId)))
    .limit(1);

  return row ? { ...row, rolledFromBankName: row.rolledFromBankName ?? null } : null;
}
