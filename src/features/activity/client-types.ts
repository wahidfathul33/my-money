/**
 * Wire-safe shape for `/activity` items — same reasoning as
 * src/features/transactions/history-client-types.ts: `amount` (a `bigint`)
 * is the only field that can't cross the Server → Client Component
 * boundary as-is, so it's the only one serialized.
 */
import { deserializeMoney, serializeMoney, type Money } from '@/lib/finance/money';
import type { ActivityItem, ActivityWalletInfo } from './queries';

export interface ActivityClientItem {
  id: string;
  amount: string;
  transactionDate: Date;
  note: string | null;
  senderName: string | null;
  senderEmail: string;
  wallet: ActivityWalletInfo | null;
  householdName: string | null;
  acknowledgedAt: Date | null;
}

export function toActivityClientItem(item: ActivityItem): ActivityClientItem {
  return { ...item, amount: serializeMoney(item.amount) };
}

export function activityItemAmount(item: ActivityClientItem): Money {
  return deserializeMoney(item.amount);
}
