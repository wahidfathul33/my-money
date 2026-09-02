/**
 * Wire-safe transaction shape for crossing the Server → Client Component
 * boundary — same reasoning as src/features/wallets/client-types.ts:
 * `amount` is the only `bigint` field here (`transactionDate` is a plain
 * `Date`, which RSC's flight serialization DOES special-case and carry
 * across fine, unlike `bigint`).
 */
import { deserializeMoney, serializeMoney, type Money } from '@/lib/finance/money';
import type { RecordableTransactionType, TransactionCategoryInfo, TransactionListItem, TransactionWalletInfo } from './queries';

export interface TransactionClientData {
  id: string;
  type: RecordableTransactionType;
  amount: string;
  transactionDate: Date;
  note: string | null;
  category: TransactionCategoryInfo | null;
  wallet: TransactionWalletInfo | null;
}

export function toTransactionClientData(row: TransactionListItem): TransactionClientData {
  return {
    id: row.id,
    type: row.type,
    amount: serializeMoney(row.amount),
    transactionDate: row.transactionDate,
    note: row.note,
    category: row.category,
    wallet: row.wallet,
  };
}

export function transactionAmount(row: TransactionClientData): Money {
  return deserializeMoney(row.amount);
}

/** Signed for display — docs/03 §8.1 (`income` → `+`, `expense` → `−`). Never stored signed. */
export function signedTransactionAmount(row: TransactionClientData): Money {
  const amount = transactionAmount(row);
  return row.type === 'income' ? amount : -amount;
}
