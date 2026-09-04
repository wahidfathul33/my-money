/**
 * Household expenses page reads — `dbRead` only (docs/11-tech-architecture.md
 * §2). Tagged transactions for ONE household, newest first
 * (tasks/12-sharing-and-privacy spec.md: "Halaman pengeluaran keluarga
 * menampilkan transaksi bertanda dari semua anggota, dengan nama pembayar").
 *
 * Callers MUST verify the caller is an active member of `householdId`
 * BEFORE calling anything here (src/lib/services/households.ts
 * `requireHouseholdAccess` — the page sits behind
 * src/app/(app)/household/[householdId]/layout.tsx's guard already; the API
 * route re-verifies itself, since nothing guards routes under `/api/**`).
 * The household-tag filter itself still goes through
 * src/lib/visibility/transactions.ts's `householdTaggedTransactionsWhere` —
 * a DIFFERENT, narrower shape than that module's general
 * `visibleTransactionsWhere` (see that function's own doc comment for why
 * reusing the general one here would be a bug, not just redundant).
 *
 * Never selects any wallet or balance column — spec.md "Halaman itu TIDAK
 * menampilkan saldo dompet siapa pun." There's structurally nothing to leak
 * here: this file never joins `wallets` or `ledger_entries` at all, and the
 * payer's name comes from `users`, not a wallet.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { categories, transactions, users } from '@/lib/db/schema';
import type { Money } from '@/lib/finance/money';
import { decodeCursor, encodeCursor } from '@/features/transactions/cursor';
import { householdTaggedTransactionsWhere } from '@/lib/visibility/transactions';

export interface HouseholdTransactionCategoryInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface HouseholdTransactionItem {
  id: string;
  /** income/expense only — a transfer is neither (docs/03 §9.4) and has no
   * single "payer" the way this page's meta row assumes. */
  type: 'income' | 'expense';
  /** Always positive — apply sign for display via `type` (docs/03 §8.1). */
  amount: Money;
  transactionDate: Date;
  note: string | null;
  category: HouseholdTransactionCategoryInfo | null;
  payerId: string;
  payerName: string;
}

export interface ListHouseholdTransactionsOptions {
  cursor?: string | null;
  limit?: number;
  /** The "Chip filter Anggota" (todo.md) — narrows to one member's own transactions. */
  memberUserId?: string;
}

export interface ListHouseholdTransactionsResult {
  items: HouseholdTransactionItem[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export async function listHouseholdTransactionsPage(
  householdId: string,
  options: ListHouseholdTransactionsOptions = {},
): Promise<ListHouseholdTransactionsResult> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const conditions = [
    householdTaggedTransactionsWhere(householdId),
    isNull(transactions.voidedAt),
    inArray(transactions.type, ['income', 'expense']),
  ];
  if (options.memberUserId) {
    conditions.push(eq(transactions.userId, options.memberUserId));
  }
  if (options.cursor) {
    const decoded = decodeCursor(options.cursor);
    if (decoded) {
      // Same row-wise keyset predicate as src/features/transactions/history-queries.ts,
      // matching `tx_household_date_idx`'s (household_id, transaction_date DESC) shape.
      conditions.push(
        sql`(${transactions.transactionDate}, ${transactions.id}) < (${decoded.transactionDate}::timestamptz, ${decoded.id}::uuid)`,
      );
    }
  }

  const rows = await dbRead
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      transactionDate: transactions.transactionDate,
      note: transactions.note,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      payerId: users.id,
      payerName: users.name,
      payerEmail: users.email,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .innerJoin(users, eq(users.id, transactions.userId))
    .where(and(...conditions))
    .orderBy(desc(transactions.transactionDate), desc(transactions.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items: HouseholdTransactionItem[] = page.map((row) => ({
    id: row.id,
    type: row.type as 'income' | 'expense',
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
    payerId: row.payerId,
    payerName: row.payerName ?? row.payerEmail,
  }));

  const last = page.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({ transactionDate: last.transactionDate.toISOString(), id: last.id })
      : null;

  return { items, nextCursor };
}

/** Whether `householdId` has ANY tagged transaction at all — powers the
 * empty state's bulk-tagging CTA (spec.md "Empty state + CTA penandaan
 * massal"): only worth offering when the household is brand new to
 * tagging, not just to this particular member filter. */
export async function hasAnyHouseholdTransaction(householdId: string): Promise<boolean> {
  const [row] = await dbRead
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        householdTaggedTransactionsWhere(householdId),
        isNull(transactions.voidedAt),
        inArray(transactions.type, ['income', 'expense']),
      ),
    )
    .limit(1);
  return Boolean(row);
}
