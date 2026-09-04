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
 * docs/09-screen-specs.md §13's own mockup shows the meta row as
 * "Wahid · BCA" — payer name AND wallet name, e.g. for "which account did
 * this come out of" context — so `wallets` IS joined here, but the SELECT
 * list only ever names `id`/`name`/`icon`/`color`, matching docs/12-security-and-auth.md
 * §4.3's transfer-target-picker discipline exactly: "Kolom balance TIDAK
 * PERNAH ikut di-SELECT di sini." spec.md's "TIDAK menampilkan saldo
 * dompet siapa pun" is about the BALANCE specifically, never the name —
 * §13 itself draws that same line ("Saldo dompet tidak pernah ditampilkan
 * ... bahkan untuk dompet yang dibagikan").
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { categories, ledgerEntries, transactions, users, wallets } from '@/lib/db/schema';
import type { Money } from '@/lib/finance/money';
import { decodeCursor, encodeCursor } from '@/features/transactions/cursor';
import { householdTaggedTransactionsWhere } from '@/lib/visibility/transactions';

export interface HouseholdTransactionCategoryInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/** Name/icon/color ONLY — never `balance`, same shape (and same reason) as
 * docs/12-security-and-auth.md §4.3's `TransferTargetDto`. */
export interface HouseholdTransactionWalletInfo {
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
  /** `null` only in the structurally-impossible case of a live income/
   * expense row with no live ledger entry at all. */
  wallet: HouseholdTransactionWalletInfo | null;
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
      // Name/icon/color ONLY — see this file's header comment. `balance`
      // is never named in this select list, so leaking it here would be a
      // type error at the call site, not just a review miss.
      walletId: wallets.id,
      walletName: wallets.name,
      walletIcon: wallets.icon,
      walletColor: wallets.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .innerJoin(users, eq(users.id, transactions.userId))
    // income/expense has exactly one LIVE ledger entry (an edit voids the
    // old one and writes a fresh one, same invariant
    // src/features/transactions/history-queries.ts's assembleItem relies
    // on) — never scoped to the caller's own id here, since this page
    // shows every member's transactions, each against ITS OWNER's wallet.
    .leftJoin(
      ledgerEntries,
      and(eq(ledgerEntries.transactionId, transactions.id), isNull(ledgerEntries.voidedAt)),
    )
    .leftJoin(wallets, eq(wallets.id, ledgerEntries.walletId))
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
    wallet: row.walletId
      ? { id: row.walletId, name: row.walletName!, icon: row.walletIcon!, color: row.walletColor! }
      : null,
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
