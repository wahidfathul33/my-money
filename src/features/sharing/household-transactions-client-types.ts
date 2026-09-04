/**
 * Wire-safe shape for the household expenses page — same reasoning as
 * src/features/transactions/history-client-types.ts: `amount` is the only
 * `bigint` field, so it crosses the Server → Client boundary (both the
 * initial Server Component render and `GET /api/households/[id]/transactions`
 * JSON) as a decimal string.
 */
import { deserializeMoney, type Money } from '@/lib/finance/money';
import type {
  HouseholdTransactionCategoryInfo,
  HouseholdTransactionItem,
  HouseholdTransactionWalletInfo,
} from './household-transactions-queries';

export interface HouseholdTransactionClientItem {
  id: string;
  type: 'income' | 'expense';
  amount: string;
  transactionDate: Date;
  note: string | null;
  category: HouseholdTransactionCategoryInfo | null;
  payerId: string;
  payerName: string;
  /** Name/icon/color only — never a balance. docs/09-screen-specs.md §13's
   * meta row: "Wahid · BCA". */
  wallet: HouseholdTransactionWalletInfo | null;
}

export function toHouseholdTransactionClientItem(
  row: HouseholdTransactionItem,
): HouseholdTransactionClientItem {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount.toString(),
    transactionDate: row.transactionDate,
    note: row.note,
    category: row.category,
    payerId: row.payerId,
    payerName: row.payerName,
    wallet: row.wallet,
  };
}

/** Parses one item from the API route's JSON body — `transactionDate` arrives as an ISO string. */
export function parseHouseholdTransactionResponse(raw: {
  id: string;
  type: 'income' | 'expense';
  amount: string;
  transactionDate: string;
  note: string | null;
  category: HouseholdTransactionCategoryInfo | null;
  payerId: string;
  payerName: string;
  wallet: HouseholdTransactionWalletInfo | null;
}): HouseholdTransactionClientItem {
  return { ...raw, transactionDate: new Date(raw.transactionDate) };
}

export function householdTransactionAmount(item: HouseholdTransactionClientItem): Money {
  return deserializeMoney(item.amount);
}

/** Signed for display — `income` → `+`, `expense` → `−` (docs/03 §8.1). */
export function signedHouseholdTransactionAmount(item: HouseholdTransactionClientItem): Money {
  const amount = householdTransactionAmount(item);
  return item.type === 'income' ? amount : -amount;
}
