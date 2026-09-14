/**
 * Wire-safe obligation shapes for crossing the Server -> Client Component
 * boundary — RSC flight serialization can't carry a raw `bigint`, so every
 * `Money` field here is a `serializeMoney`'d string. Same reasoning/shape as
 * src/features/savings/client-types.ts and src/features/wallets/client-types.ts.
 */
import { serializeMoney } from '@/lib/finance/money';
import type { ObligationListItem, UpcomingObligation } from './queries';

export interface ObligationListItemClientData {
  id: string;
  kind: 'debt' | 'receivable';
  name: string;
  initialAmount: string;
  remainingAmount: string;
  status: 'active' | 'partially_paid' | 'paid' | 'written_off';
  startDate: string;
  dueDate: string | null;
  affectsWallet: boolean;
  counterpartyUserId: string | null;
  counterpartyName: string | null;
  counterpartRecordExists: boolean;
  excludeFromHousehold: boolean;
  note: string | null;
  overdue: boolean;
}

export function toObligationListItemClientData(item: ObligationListItem): ObligationListItemClientData {
  return {
    ...item,
    initialAmount: serializeMoney(item.initialAmount),
    remainingAmount: serializeMoney(item.remainingAmount),
  };
}

export interface UpcomingObligationClientData {
  id: string;
  kind: 'debt' | 'receivable';
  name: string;
  remainingAmount: string;
  dueDate: string | null;
  overdue: boolean;
}

export function toUpcomingClientData(item: UpcomingObligation): UpcomingObligationClientData {
  return { ...item, remainingAmount: serializeMoney(item.remainingAmount) };
}
