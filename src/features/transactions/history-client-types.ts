/**
 * Wire-safe shape for `/transactions` history items — same reasoning as
 * src/features/transactions/client-types.ts (task 07's): `amount` is the
 * only `bigint` field, so it crosses any boundary (Server → Client
 * Component flight serialization, OR the `GET /api/transactions` JSON
 * response) as a decimal string.
 *
 * Used uniformly by BOTH sources a `<TransactionList>` renders from: the
 * initial Server Component page (src/app/(app)/transactions/page.tsx, via
 * `toHistoryClientItem`) and every subsequent `/api/transactions` fetch
 * (parsed by `parseHistoryItemResponse` in
 * src/features/transactions/components/transaction-list.tsx) — so infinite
 * scroll can append pages from either source into one array without a
 * shape mismatch.
 */
import { deserializeMoney, serializeMoney, type Money } from '@/lib/finance/money';
import type {
  HistoryCategoryInfo,
  HistoryTransactionType,
  HistoryWalletInfo,
  TransactionHistoryItem,
} from './history-queries';
import type { TransactionClientData } from './client-types';

export interface TransactionHistoryClientItem {
  id: string;
  type: HistoryTransactionType;
  amount: string;
  transactionDate: Date;
  note: string | null;
  category: HistoryCategoryInfo | null;
  wallet: HistoryWalletInfo | null;
  transferFrom: HistoryWalletInfo | null;
  transferTo: HistoryWalletInfo | null;
  counterpartyName: string | null;
}

export function toHistoryClientItem(row: TransactionHistoryItem): TransactionHistoryClientItem {
  return {
    id: row.id,
    type: row.type,
    amount: serializeMoney(row.amount),
    transactionDate: row.transactionDate,
    note: row.note,
    category: row.category,
    wallet: row.wallet,
    transferFrom: row.transferFrom,
    transferTo: row.transferTo,
    counterpartyName: row.counterpartyName,
  };
}

/** Parses one item from `GET /api/transactions`'s JSON body — `transactionDate` arrives as an ISO string (JSON has no Date type), unlike the Server Component path where RSC flight serialization carries `Date` across directly. */
export function parseHistoryItemResponse(raw: {
  id: string;
  type: HistoryTransactionType;
  amount: string;
  transactionDate: string;
  note: string | null;
  category: HistoryCategoryInfo | null;
  wallet: HistoryWalletInfo | null;
  transferFrom: HistoryWalletInfo | null;
  transferTo: HistoryWalletInfo | null;
  counterpartyName: string | null;
}): TransactionHistoryClientItem {
  return { ...raw, transactionDate: new Date(raw.transactionDate) };
}

export function historyItemAmount(item: TransactionHistoryClientItem): Money {
  return deserializeMoney(item.amount);
}

/**
 * Signed for display — `income` → `+`, `expense` → `−` (docs/03 §8.1).
 * `transfer` returns the unsigned magnitude: it's rendered with
 * `MoneyText`'s `tone="neutral"` and `showSign={false}` (docs/09 §3 "netral,
 * tanpa tanda" — no +/− prefix, no green/red), so the sign returned here is
 * never used for a transfer row, but staying unsigned keeps this function
 * honest rather than returning a meaningless negative.
 */
export function signedHistoryAmount(item: TransactionHistoryClientItem): Money {
  const amount = historyItemAmount(item);
  if (item.type === 'income') return amount;
  if (item.type === 'expense') return -amount;
  return amount;
}

/**
 * Converts an income/expense history item into the shape
 * `<EditTransactionSheet>` (task 07's, untouched) expects. Returns `null`
 * for a transfer — there's no edit flow for transfers yet (task 08's
 * `voidTransaction`/`updateTransaction` explicitly refuse `type: 'transfer'`,
 * src/lib/services/transactions.ts), so the history detail sheet never
 * offers "Edit" for one (see components/detail-sheet.tsx).
 */
export function toEditableTransactionClientData(item: TransactionHistoryClientItem): TransactionClientData | null {
  if (item.type !== 'income' && item.type !== 'expense') return null;
  return {
    id: item.id,
    type: item.type,
    amount: item.amount,
    transactionDate: item.transactionDate,
    note: item.note,
    category: item.category,
    wallet: item.wallet,
  };
}
