/**
 * Wire-safe recurring shapes for crossing the Server → Client Component
 * boundary — same rationale as src/features/budgets/client-types.ts: RSC
 * flight serialization doesn't support `bigint`, so every `Money` field is
 * serialized to a string before being handed to a `'use client'` component.
 */
import { serializeMoney } from '@/lib/finance/money';
import type {
  RecurringContributionListRow,
  RecurringStatus,
  RecurringTransactionListRow,
} from './queries';
import type { RecurringFrequency } from '@/lib/date/recurring';

export interface RecurringTransactionClientData {
  id: string;
  type: 'income' | 'expense';
  amount: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  walletName: string;
  frequency: RecurringFrequency;
  nextRunDate: string;
  endDate: string | null;
  status: RecurringStatus;
}

export function toRecurringTransactionClientData(
  row: RecurringTransactionListRow,
): RecurringTransactionClientData {
  return { ...row, amount: serializeMoney(row.amount) };
}

export interface RecurringContributionClientData {
  id: string;
  amount: string;
  goalId: string;
  goalName: string;
  goalIcon: string;
  goalColor: string;
  walletName: string;
  frequency: RecurringFrequency;
  nextRunDate: string;
  endDate: string | null;
  status: RecurringStatus;
}

export function toRecurringContributionClientData(
  row: RecurringContributionListRow,
): RecurringContributionClientData {
  return { ...row, amount: serializeMoney(row.amount) };
}
