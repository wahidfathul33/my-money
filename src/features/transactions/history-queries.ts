/**
 * `/transactions` history reads — cursor keyset pagination, day-grouped
 * subtotals, and filtering, per tasks/09-transaction-history/spec.md and
 * docs/06-api-contracts.md §6 (`GET /api/transactions`).
 *
 * Deliberately a SEPARATE module from src/features/transactions/queries.ts
 * (task 07's) rather than an extension of it: `queries.ts`'s
 * `getRecentTransactions`/`getTransaction` are restricted to
 * `type IN ('income', 'expense')` by design (their single-`leftJoin`
 * shape fans out on a transfer's two ledger entries — see that file's own
 * header comment). This module handles all three transaction types,
 * including `transfer`, by querying `transactions` and `ledger_entries`
 * SEPARATELY (never joined in one fanning-out query) and assembling them in
 * application code — the only way to keep keyset pagination exact AND
 * support a two-entry self-transfer in the same list.
 *
 * `dbRead` only — no mutation ever happens from a history read (docs/11 §2).
 */
import { alias } from 'drizzle-orm/pg-core';
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { categories, ledgerEntries, transactions, users, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import type { Money } from '@/lib/finance/money';
import {
  DEFAULT_TIMEZONE,
  localDayRange,
  localMonthRange,
  toLocalDate,
  toLocalMonth,
  type UtcRange,
} from '@/lib/date/timezone';
import { decodeCursor, encodeCursor } from './cursor';

export type HistoryTransactionType = 'income' | 'expense' | 'transfer';

export interface HistoryWalletInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface HistoryCategoryInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface TransactionHistoryItem {
  id: string;
  type: HistoryTransactionType;
  /** Always positive — apply sign for display via `type` (docs/03 §8.1). */
  amount: Money;
  transactionDate: Date;
  note: string | null;
  category: HistoryCategoryInfo | null;
  /** income/expense only. */
  wallet: HistoryWalletInfo | null;
  /** transfer only — the wallet the money left. `null` when the other side
   * of a household member-transfer isn't a wallet this user can see. */
  transferFrom: HistoryWalletInfo | null;
  /** transfer only — the wallet the money landed in. */
  transferTo: HistoryWalletInfo | null;
  /** transfer only, member-transfers only (task 12+ territory) — the other
   * household member's name, for when only one side of the transfer is a
   * wallet visible to this query (`transferFrom`/`transferTo` has a gap). */
  counterpartyName: string | null;
}

export interface TransactionHistoryFilters {
  walletId?: string;
  categoryId?: string;
  type?: HistoryTransactionType;
  /** WIB calendar date, `YYYY-MM-DD`, inclusive. */
  from?: string;
  /** WIB calendar date, `YYYY-MM-DD`, inclusive. */
  to?: string;
  /** Trigram search over `note` and category name — ignored below 2 chars. */
  q?: string;
}

export interface ListTransactionsPageOptions {
  cursor?: string | null;
  limit?: number;
  filters?: TransactionHistoryFilters;
  tz?: string;
}

export interface ListTransactionsPageResult {
  items: TransactionHistoryItem[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MIN_SEARCH_LENGTH = 2;

/** Only Asia/Jakarta is supported for MVP — see src/lib/date/timezone.ts's own header. */
function assertSupportedTimezone(tz: string): void {
  if (tz !== DEFAULT_TIMEZONE) {
    throw new RangeError(`Unsupported timezone for aggregation: "${tz}"`);
  }
}

function walletFilterCondition(userId: string, walletId: string) {
  // Correlated EXISTS against the OUTER `transactions.id` — a wallet filter
  // must match regardless of whether the row has one ledger entry (income/
  // expense, member-transfer) or two (self-transfer).
  return sql`EXISTS (
    SELECT 1 FROM ${ledgerEntries}
    WHERE ${ledgerEntries.transactionId} = ${transactions.id}
      AND ${ledgerEntries.walletId} = ${walletId}
      AND ${ledgerEntries.userId} = ${userId}
      AND ${ledgerEntries.voidedAt} IS NULL
  )`;
}

function searchFilterCondition(q: string) {
  const pattern = `%${q}%`;
  // `note` has a GIN trigram index (`tx_note_trgm_idx`); category name
  // doesn't need one at this data scale (few categories per user).
  return sql`(
    ${transactions.note} ILIKE ${pattern}
    OR EXISTS (
      SELECT 1 FROM ${categories}
      WHERE ${categories.id} = ${transactions.categoryId}
        AND ${categories.name} ILIKE ${pattern}
    )
  )`;
}

/**
 * Shared WHERE conditions for both the paginated list and `getDayTotals` —
 * kept in one place so a day's subtotal always reflects exactly the same
 * wallet/category/date-range/search filters the list below it is showing.
 * `filters.type` is intentionally applied here (list) but NOT reused as-is
 * by `getDayTotals` (which always wants income+expense together) — see that
 * function's own comment.
 */
function buildFilterConditions(userId: string, filters: TransactionHistoryFilters, tz: string) {
  const conditions = [ownedBy(transactions, userId), isNull(transactions.voidedAt)];

  if (filters.type) conditions.push(eq(transactions.type, filters.type));
  if (filters.categoryId) conditions.push(eq(transactions.categoryId, filters.categoryId));

  if (filters.from) {
    const { start } = localDayRange(filters.from, tz);
    conditions.push(gte(transactions.transactionDate, start));
  }
  if (filters.to) {
    const { end } = localDayRange(filters.to, tz);
    conditions.push(lt(transactions.transactionDate, end));
  }

  if (filters.walletId) {
    conditions.push(walletFilterCondition(userId, filters.walletId));
  }

  const q = filters.q?.trim();
  if (q && q.length >= MIN_SEARCH_LENGTH) {
    conditions.push(searchFilterCondition(q));
  }

  return conditions;
}

interface LedgerEntryInfo {
  amount: Money;
  wallet: HistoryWalletInfo;
}

/** Batch-fetches this user's own ledger entries for a page of transaction ids — never joined into the main list query (would fan out a self-transfer's 2 entries into 2 rows and break keyset pagination). */
async function loadLedgerInfo(userId: string, transactionIds: string[]): Promise<Map<string, LedgerEntryInfo[]>> {
  const map = new Map<string, LedgerEntryInfo[]>();
  if (transactionIds.length === 0) return map;

  const rows = await dbRead
    .select({
      transactionId: ledgerEntries.transactionId,
      amount: ledgerEntries.amount,
      walletId: wallets.id,
      walletName: wallets.name,
      walletIcon: wallets.icon,
      walletColor: wallets.color,
    })
    .from(ledgerEntries)
    .innerJoin(wallets, eq(wallets.id, ledgerEntries.walletId))
    .where(
      and(
        inArray(ledgerEntries.transactionId, transactionIds),
        ownedBy(ledgerEntries, userId),
        isNull(ledgerEntries.voidedAt),
      ),
    );

  for (const row of rows) {
    if (row.transactionId === null) continue;
    const list = map.get(row.transactionId) ?? [];
    list.push({
      amount: row.amount,
      wallet: { id: row.walletId, name: row.walletName, icon: row.walletIcon, color: row.walletColor },
    });
    map.set(row.transactionId, list);
  }
  return map;
}

interface RawTransactionRow {
  id: string;
  type: string;
  amount: Money;
  transactionDate: Date;
  note: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  counterpartyName: string | null;
}

/**
 * Assembles one display row from its `transactions` row + its (0–2) live
 * ledger entries:
 *   - income/expense → exactly 1 entry → that entry's wallet.
 *   - transfer, 2 entries (self-transfer, both entries owned by this user) →
 *     the negative one is `transferFrom`, the positive one `transferTo`.
 *   - transfer, 1 entry (member-transfer — only THIS user's own side has an
 *     entry in their own ledger; task 08 is self-transfer only, but the
 *     schema already allows this shape) → sign decides which side of the
 *     pair this row represents.
 */
function assembleItem(row: RawTransactionRow, entries: LedgerEntryInfo[]): TransactionHistoryItem {
  const category = row.categoryId
    ? {
        id: row.categoryId,
        name: row.categoryName!,
        icon: row.categoryIcon!,
        color: row.categoryColor!,
      }
    : null;

  if (row.type === 'transfer') {
    let transferFrom: HistoryWalletInfo | null = null;
    let transferTo: HistoryWalletInfo | null = null;

    if (entries.length === 2) {
      transferFrom = entries.find((e) => e.amount < 0n)?.wallet ?? null;
      transferTo = entries.find((e) => e.amount > 0n)?.wallet ?? null;
    } else if (entries.length === 1) {
      const entry = entries[0]!;
      if (entry.amount < 0n) transferFrom = entry.wallet;
      else transferTo = entry.wallet;
    }

    return {
      id: row.id,
      type: 'transfer',
      amount: row.amount,
      transactionDate: row.transactionDate,
      note: row.note,
      category: null,
      wallet: null,
      transferFrom,
      transferTo,
      counterpartyName: row.counterpartyName,
    };
  }

  return {
    id: row.id,
    type: row.type as 'income' | 'expense',
    amount: row.amount,
    transactionDate: row.transactionDate,
    note: row.note,
    category,
    wallet: entries[0]?.wallet ?? null,
    transferFrom: null,
    transferTo: null,
    counterpartyName: null,
  };
}

const counterpartyUsers = alias(users, 'counterparty_users');

/**
 * One page of the caller's transaction history, newest first — cursor
 * keyset on `(transaction_date DESC, id DESC)`, matching `tx_user_date_idx`
 * exactly (tasks/09-transaction-history/spec.md "Cursor keyset ... cocok
 * persis dengan tx_user_date_idx"). An invalid/stale `cursor` is treated as
 * "no cursor" (starts from the top) rather than erroring — a bookmarked or
 * shared URL with a stale cursor should still load something.
 */
export async function listTransactionsPage(
  userId: string,
  options: ListTransactionsPageOptions = {},
): Promise<ListTransactionsPageResult> {
  const tz = options.tz ?? DEFAULT_TIMEZONE;
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const filters = options.filters ?? {};

  const conditions = buildFilterConditions(userId, filters, tz);

  if (options.cursor) {
    const decoded = decodeCursor(options.cursor);
    if (decoded) {
      // Row-wise comparison — the standard keyset predicate for an
      // ORDER BY (a DESC, b DESC) index: strictly-smaller tuples are the
      // rows that come AFTER the cursor row in that ordering.
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
      counterpartyName: counterpartyUsers.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(counterpartyUsers, eq(counterpartyUsers.id, transactions.counterpartyUserId))
    .where(and(...conditions))
    .orderBy(desc(transactions.transactionDate), desc(transactions.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const ledgerByTx = await loadLedgerInfo(
    userId,
    page.map((r) => r.id),
  );

  const items = page.map((row) => assembleItem(row, ledgerByTx.get(row.id) ?? []));

  const last = page.at(-1);
  const nextCursor =
    hasMore && last ? encodeCursor({ transactionDate: last.transactionDate.toISOString(), id: last.id }) : null;

  return { items, nextCursor };
}

export interface DayTotal {
  income: Money;
  expense: Money;
}

/**
 * The `[start, end)` UTC range spanning every item's WIB calendar date —
 * the exact `range` `getDayTotals` needs to cover one page's worth of day
 * headers. Shared by both callers (the initial Server Component page and
 * `GET /api/transactions`) so they compute it identically. `null` for an
 * empty page (nothing to total).
 */
export function dayTotalsRangeForItems(items: TransactionHistoryItem[], tz: string = DEFAULT_TIMEZONE): UtcRange | null {
  if (items.length === 0) return null;
  const localDates = items.map((item) => toLocalDate(item.transactionDate, tz));
  const minDate = localDates.reduce((a, b) => (a < b ? a : b));
  const maxDate = localDates.reduce((a, b) => (a > b ? a : b));
  return { start: localDayRange(minDate, tz).start, end: localDayRange(maxDate, tz).end };
}

/**
 * Server-side daily subtotals (income − expense computed by the CALLER from
 * the two fields, never by this function or the client — docs/06 §6
 * "dayTotals dihitung server-side ... supaya klien tidak perlu menjumlah"),
 * one entry per WIB calendar date with at least one matching transaction in
 * `range`. Always excludes `transfer` and voided rows regardless of
 * `filters.type` — a day's subtotal answers "how much came in/went out that
 * day", a fixed pair, independent of which type chip the list itself is
 * currently narrowed to. The other filters (wallet/category/date-range/
 * search) DO apply, so the subtotal always matches what's visible in the
 * filtered list beneath it.
 */
export async function getDayTotals(
  userId: string,
  range: UtcRange,
  filters: TransactionHistoryFilters = {},
  tz: string = DEFAULT_TIMEZONE,
): Promise<Record<string, DayTotal>> {
  assertSupportedTimezone(tz);

  const conditions = buildFilterConditions(userId, { ...filters, type: undefined }, tz);
  conditions.push(inArray(transactions.type, ['income', 'expense']));
  conditions.push(gte(transactions.transactionDate, range.start));
  conditions.push(lt(transactions.transactionDate, range.end));

  // `tz` as a LITERAL, not a bound parameter: `${tz}` in the SELECT list and
  // `${tz}` in GROUP BY would each get their OWN placeholder ($1, $7, ...),
  // and Postgres's "must appear in GROUP BY" check compares parse trees —
  // two Param nodes with different placeholder numbers are NOT recognized
  // as the same expression even though they'd bind to the same value at
  // runtime (confirmed against the real DB: 42803 "must appear in the GROUP
  // BY clause"). `assertSupportedTimezone` above guarantees `tz` is exactly
  // `DEFAULT_TIMEZONE`, so inlining it as a literal is safe — and it also
  // makes this expression byte-identical to `tx_user_local_date_idx`'s own
  // `(transaction_date AT TIME ZONE 'Asia/Jakarta')::date` (src/lib/db/schema/transactions.ts).
  const localDateExpr = sql<string>`(${transactions.transactionDate} AT TIME ZONE ${sql.raw(`'${tz}'`)})::date`;

  const rows = await dbRead
    .select({
      localDate: sql<string>`(${localDateExpr})::text`,
      income: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
      expense: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(localDateExpr);

  const result: Record<string, DayTotal> = {};
  for (const row of rows) {
    result[row.localDate] = { income: BigInt(row.income), expense: BigInt(row.expense) };
  }
  return result;
}

export interface PeriodSummary {
  income: Money;
  expense: Money;
}

/**
 * Whole-month income/expense summary for `PeriodPicker`'s header ("Masuk
 * 15,0 jt · Keluar 8,3 jt", docs/09 §3) — WIB month boundaries via
 * `localMonthRange`, deliberately NOT `getMonthlyTotals`
 * (src/features/transactions/queries.ts), which bounds the month in UTC.
 * Not filtered by the list's wallet/category/type/search filters — this is
 * a period-wide overview, always for the whole month regardless of what the
 * list below it is currently narrowed to.
 */
export async function getPeriodSummary(
  userId: string,
  period: string,
  tz: string = DEFAULT_TIMEZONE,
): Promise<PeriodSummary> {
  const { start, end } = localMonthRange(period, tz);

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
 * The WIB `YYYY-MM` of the caller's single most recent (non-void)
 * transaction, of ANY type — `null` if they've never recorded one. Powers
 * the empty-state distinction tasks/09-transaction-history/todo.md calls
 * for: "Periode kosong tapi ada di bulan lain → tautan ke periode terakhir
 * yang ada" (as opposed to "belum pernah ada transaksi sama sekali", which
 * is exactly the `null` case here).
 */
export async function getMostRecentTransactionPeriod(
  userId: string,
  tz: string = DEFAULT_TIMEZONE,
): Promise<string | null> {
  const [row] = await dbRead
    .select({ transactionDate: transactions.transactionDate })
    .from(transactions)
    .where(and(ownedBy(transactions, userId), isNull(transactions.voidedAt)))
    .orderBy(desc(transactions.transactionDate), desc(transactions.id))
    .limit(1);

  if (!row) return null;
  return toLocalMonth(row.transactionDate, tz);
}
