/**
 * Transactions reads — `dbRead` only (docs/11-tech-architecture.md §2).
 * The record-specific queries below (`getQuickCategories`, `getMonthlyTotals`,
 * category/type validation) stay restricted to `type IN ('income', 'expense')`
 * — `transfer` never has a category and is never income/expense
 * (tasks/08-transfers-self/spec.md "Transfer bukan income maupun expense").
 *
 * `getRecentTransactions`/`getTransaction` are the exception: they merge in
 * self-transfers (via `@/features/transfers/queries`'s own two-entries-per-
 * transaction shaped query) so `/transactions` shows one unified history —
 * task 08's own acceptance criteria need transfers visible there, alongside
 * income/expense. Kept as a MERGE of two separately-shaped queries rather
 * than one query, since a transfer's two-ledger-entries-per-transaction
 * shape doesn't fit the single-entry LEFT JOIN below.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { categories, ledgerEntries, transactions, users, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import type { Money } from '@/lib/finance/money';
import {
  getRecentCategories,
  listCategories,
  type CategoryRow,
  type CategoryWithChildren,
} from '@/features/categories/queries';
import { getTransferDetail, listRecentTransfers, type TransferWalletInfo } from '@/features/transfers/queries';

export type RecordableTransactionType = 'income' | 'expense';
export type TransactionItemType = RecordableTransactionType | 'transfer';

export interface TransactionCategoryInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface TransactionWalletInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface TransactionListItem {
  id: string;
  type: TransactionItemType;
  /** Always positive — docs/03 §8.1/§9.2. Apply sign for display via `type` (transfer gets neither). */
  amount: Money;
  transactionDate: Date;
  note: string | null;
  category: TransactionCategoryInfo | null;
  /** The single wallet for income/expense; `null` for a transfer (see `transfer` below instead). */
  wallet: TransactionWalletInfo | null;
  /** `null` for income/expense; the from/to pair for a transfer. */
  transfer: { fromWallet: TransferWalletInfo; toWallet: TransferWalletInfo } | null;
}

function selectTransactionListShape() {
  return {
    id: transactions.id,
    type: transactions.type,
    amount: transactions.amount,
    transactionDate: transactions.transactionDate,
    note: transactions.note,
    categoryId: categories.id,
    categoryName: categories.name,
    categoryIcon: categories.icon,
    categoryColor: categories.color,
    walletId: wallets.id,
    walletName: wallets.name,
    walletIcon: wallets.icon,
    walletColor: wallets.color,
  };
}

function toListItem(row: {
  id: string;
  type: string;
  amount: Money;
  transactionDate: Date;
  note: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  walletId: string | null;
  walletName: string | null;
  walletIcon: string | null;
  walletColor: string | null;
}): TransactionListItem {
  return {
    id: row.id,
    type: row.type as RecordableTransactionType,
    amount: row.amount,
    transactionDate: row.transactionDate,
    note: row.note,
    category: row.categoryId
      ? {
          id: row.categoryId,
          name: row.categoryName!,
          icon: row.categoryIcon!,
          color: row.categoryColor!,
        }
      : null,
    wallet: row.walletId
      ? { id: row.walletId, name: row.walletName!, icon: row.walletIcon!, color: row.walletColor! }
      : null,
    transfer: null,
  };
}

function transferToListItem(transfer: Awaited<ReturnType<typeof listRecentTransfers>>[number]): TransactionListItem {
  return {
    id: transfer.id,
    type: 'transfer',
    amount: transfer.amount,
    transactionDate: transfer.transactionDate,
    note: transfer.note,
    category: null,
    wallet: null,
    transfer: { fromWallet: transfer.fromWallet, toWallet: transfer.toWallet },
  };
}

/** Newest-first merge of two already-sorted lists, by `transactionDate` then `id` as a stable tiebreaker. */
function mergeByDateDesc(a: TransactionListItem[], b: TransactionListItem[], limit: number): TransactionListItem[] {
  return [...a, ...b]
    .sort((x, y) => {
      const byDate = y.transactionDate.getTime() - x.transactionDate.getTime();
      if (byDate !== 0) return byDate;
      return x.id < y.id ? 1 : x.id > y.id ? -1 : 0;
    })
    .slice(0, limit);
}

/**
 * The caller's most recent non-void transactions AND self-transfers, newest
 * first — feeds the minimal `/transactions` list this task adds (full
 * grouping/filtering/search is task 09's). Fetches each shape with its own
 * query (a transfer's two-ledger-entries-per-transaction join doesn't fit
 * the single-entry LEFT JOIN below) and merges by date in application code.
 */
export async function getRecentTransactions(userId: string, limit = 50): Promise<TransactionListItem[]> {
  const [rows, transfers] = await Promise.all([
    dbRead
      .select(selectTransactionListShape())
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .leftJoin(
        ledgerEntries,
        and(eq(ledgerEntries.transactionId, transactions.id), isNull(ledgerEntries.voidedAt)),
      )
      .leftJoin(wallets, eq(wallets.id, ledgerEntries.walletId))
      .where(
        and(
          ownedBy(transactions, userId),
          isNull(transactions.voidedAt),
          inArray(transactions.type, ['income', 'expense']),
        ),
      )
      .orderBy(desc(transactions.transactionDate), desc(transactions.id))
      .limit(limit),
    listRecentTransfers(userId, limit),
  ]);

  return mergeByDateDesc(rows.map(toListItem), transfers.map(transferToListItem), limit);
}

/** A single transaction (for the detail sheet / edit form) — `null` if it doesn't exist, isn't the caller's, or is voided. */
export async function getTransaction(
  userId: string,
  transactionId: string,
): Promise<TransactionListItem | null> {
  const [row] = await dbRead
    .select(selectTransactionListShape())
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(
      ledgerEntries,
      and(eq(ledgerEntries.transactionId, transactions.id), isNull(ledgerEntries.voidedAt)),
    )
    .leftJoin(wallets, eq(wallets.id, ledgerEntries.walletId))
    .where(
      and(
        eq(transactions.id, transactionId),
        ownedBy(transactions, userId),
        isNull(transactions.voidedAt),
        inArray(transactions.type, ['income', 'expense']),
      ),
    )
    .limit(1);

  if (row) return toListItem(row);

  const transfer = await getTransferDetail(userId, transactionId);
  return transfer ? transferToListItem(transfer) : null;
}

export interface MonthlyTotals {
  income: Money;
  expense: Money;
}

/**
 * Sum of income and expense (each independently) for a calendar month —
 * excludes `transfer` and voided rows (docs/03 §8.1, §8.3). Summed in
 * application code rather than SQL `SUM()`: the caller's transaction count
 * per month is small (personal finance, not a ledger of millions of rows),
 * and this keeps every amount flowing through the same `bigint` arithmetic
 * as everywhere else instead of a driver-dependent aggregate return type.
 */
export async function getMonthlyTotals(
  userId: string,
  period: { year: number; month: number },
): Promise<MonthlyTotals> {
  const start = new Date(Date.UTC(period.year, period.month - 1, 1));
  const end = new Date(Date.UTC(period.year, period.month, 1));

  const rows = await dbRead
    .select({ type: transactions.type, amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        ownedBy(transactions, userId),
        isNull(transactions.voidedAt),
        inArray(transactions.type, ['income', 'expense']),
        gte(transactions.transactionDate, start),
        lt(transactions.transactionDate, end),
      ),
    );

  let income = 0n;
  let expense = 0n;
  for (const row of rows) {
    if (row.type === 'income') income += row.amount;
    else if (row.type === 'expense') expense += row.amount;
  }
  return { income, expense };
}

/**
 * Quick-pick chips: the 4 most-used categories of `type` in the last 30
 * days (`getRecentCategories`, src/features/categories/queries.ts — built
 * in task 06 specifically for this), backfilled from the catalog in
 * `sort_order` when a user has fewer than `limit` — a brand new user with no
 * transaction history yet must still see 4 usable chips, not an empty row
 * (tasks/07 spec.md "3 tap" depends on a chip always being tappable).
 */
export async function getQuickCategories(
  userId: string,
  type: RecordableTransactionType,
  limit = 4,
): Promise<CategoryRow[]> {
  const recent = await getRecentCategories(userId, type, limit);
  if (recent.length >= limit) return recent;

  const all = await listCategories(userId, type);
  const seen = new Set(recent.map((c) => c.id));
  const backfill = all
    .flatMap((c) => [c, ...c.children])
    .filter((c) => !seen.has(c.id));

  return [...recent, ...backfill].slice(0, limit);
}

/** Full hierarchical category list for the "lainnya" grid — re-exported for convenience so callers only import from this module. */
export type { CategoryRow, CategoryWithChildren };
export { listCategories };

/**
 * Resolves the wallet a freshly-opened Add Transaction sheet should default
 * to — docs/09 §2: `users.default_wallet_id`, else the most recently used
 * active wallet, else the first active wallet by `sort_order`. Returns
 * `null` only when the caller has no active wallet at all (shouldn't happen
 * post-onboarding, since `seedNewUser` always creates a starter "Tunai").
 */
export async function resolveDefaultWalletId(userId: string): Promise<string | null> {
  const [user] = await dbRead
    .select({ defaultWalletId: users.defaultWalletId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.defaultWalletId) {
    const [wallet] = await dbRead
      .select({ id: wallets.id })
      .from(wallets)
      .where(and(eq(wallets.id, user.defaultWalletId), eq(wallets.isArchived, false)))
      .limit(1);
    if (wallet) return wallet.id;
  }

  const [lastUsed] = await dbRead
    .select({ walletId: ledgerEntries.walletId })
    .from(ledgerEntries)
    .innerJoin(wallets, eq(wallets.id, ledgerEntries.walletId))
    .where(
      and(ownedBy(ledgerEntries, userId), eq(wallets.isArchived, false), isNull(ledgerEntries.voidedAt)),
    )
    .orderBy(desc(ledgerEntries.entryDate), desc(ledgerEntries.createdAt))
    .limit(1);
  if (lastUsed) return lastUsed.walletId;

  const [firstActive] = await dbRead
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(ownedBy(wallets, userId), eq(wallets.isArchived, false)))
    .orderBy(asc(wallets.sortOrder), asc(wallets.createdAt))
    .limit(1);
  return firstActive?.id ?? null;
}
