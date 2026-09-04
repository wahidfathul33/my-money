/**
 * Wire-safe transaction shape for crossing the Server → Client Component
 * boundary — same reasoning as src/features/wallets/client-types.ts:
 * `amount` is the only `bigint` field here (`transactionDate` is a plain
 * `Date`, which RSC's flight serialization DOES special-case and carry
 * across fine, unlike `bigint`).
 */
import { deserializeMoney, serializeMoney, type Money } from '@/lib/finance/money';
import type {
  TransactionCategoryInfo,
  TransactionItemType,
  TransactionListItem,
  TransactionWalletInfo,
} from './queries';
import type { TransferWalletInfo } from '@/features/transfers/queries';

export interface TransactionClientData {
  id: string;
  type: TransactionItemType;
  amount: string;
  transactionDate: Date;
  note: string | null;
  category: TransactionCategoryInfo | null;
  wallet: TransactionWalletInfo | null;
  transfer: { fromWallet: TransferWalletInfo; toWallet: TransferWalletInfo } | null;
  /** tasks/12-sharing-and-privacy — the 🏠 tag, `null` when untagged. Feeds
   * the edit sheet's household toggle default (src/features/transactions/components/edit-transaction-sheet.tsx). */
  householdId: string | null;
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
    transfer: row.transfer,
    // getRecentTransactions/TransactionListItem (this file's other half)
    // predates household tagging and isn't read by any page today (only
    // src/features/transactions/history-queries.ts's pipeline is live) — see
    // this task's final report. Hardcoded rather than plumbed through that
    // dead path.
    householdId: null,
  };
}

export function transactionAmount(row: TransactionClientData): Money {
  return deserializeMoney(row.amount);
}

/**
 * Signed for display — docs/03 §8.1 (`income` → `+`, `expense` → `−`).
 * Never stored signed. A transfer has NO sign (docs/03 §9.4, spec.md
 * "tanpa awalan + atau −") — callers that need a transfer's amount for
 * display should use `transactionAmount` directly with `tone="neutral"`
 * (src/components/finance/money-text.tsx), never this function.
 */
export function signedTransactionAmount(row: TransactionClientData): Money {
  const amount = transactionAmount(row);
  if (row.type === 'transfer') return amount;
  return row.type === 'income' ? amount : -amount;
}
