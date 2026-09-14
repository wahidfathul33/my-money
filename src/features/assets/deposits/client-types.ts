/**
 * Wire-safe deposit shapes for crossing the Server → Client Component
 * boundary — same reasoning as src/features/savings/client-types.ts's file
 * header: RSC flight serialization can't carry a raw `bigint`, so every
 * `Money` field here is a `serializeMoney`'d string. Rate/tax/date fields
 * are already plain strings from the DB (NUMERIC/DATE columns — see
 * src/features/assets/deposits/queries.ts), so they pass through as-is.
 *
 * Client components (deposit-card.tsx, deposit-detail-client.tsx)
 * reconstruct a `DepositSnapshot` from these fields and call
 * src/lib/finance/deposit.ts's pure functions directly with `new Date()` —
 * see queries.ts's file header for why that computation isn't done here.
 */
import { deserializeMoney, serializeMoney } from '@/lib/finance/money';
import type { DepositSnapshot } from '@/lib/finance/deposit';
import type { DepositDetail, DepositListItem } from './queries';

export interface DepositListItemClientData {
  id: string;
  assetId: string;
  bankName: string;
  principal: string;
  interestRateAnnual: string;
  taxRate: string;
  startDate: string;
  maturityDate: string;
  payoutSchedule: 'at_maturity' | 'monthly';
  aroEnabled: boolean;
  aroIncludeInterest: boolean;
  status: 'active' | 'matured' | 'withdrawn';
  walletId: string | null;
  rolledFromId: string | null;
  lastInterestPaymentDate: string | null;
  excludeFromHousehold: boolean;
}

export function toDepositListClientData(deposit: DepositListItem): DepositListItemClientData {
  return { ...deposit, principal: serializeMoney(deposit.principal) };
}

export interface DepositDetailClientData extends DepositListItemClientData {
  userId: string;
  rolledFromBankName: string | null;
}

export function toDepositDetailClientData(deposit: DepositDetail): DepositDetailClientData {
  return { ...deposit, principal: serializeMoney(deposit.principal) };
}

function toUtcMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** The inverse of the two functions above — reconstructs the `Date`/`number`
 * shape src/lib/finance/deposit.ts's pure functions take, from whatever a
 * Client Component was handed over the wire. Used by deposit-card.tsx and
 * deposit-detail-client.tsx so neither re-implements this parsing. */
export function toDepositSnapshot(deposit: DepositListItemClientData): DepositSnapshot {
  return {
    principal: deserializeMoney(deposit.principal),
    interestRateAnnual: Number(deposit.interestRateAnnual),
    taxRate: Number(deposit.taxRate),
    startDate: toUtcMidnight(deposit.startDate),
    maturityDate: toUtcMidnight(deposit.maturityDate),
    payoutSchedule: deposit.payoutSchedule,
    lastInterestPaymentDate: deposit.lastInterestPaymentDate ? toUtcMidnight(deposit.lastInterestPaymentDate) : null,
  };
}
