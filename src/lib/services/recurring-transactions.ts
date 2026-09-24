/**
 * Recurring transactions service — dbWrite transactions live here, per
 * docs/11-tech-architecture.md §3 (only src/lib/services/** may import
 * `@/lib/db/write`). tasks/24-recurring-transactions/spec.md.
 *
 * Ownership model (spec.md "Model Kepemilikan"): a `recurring_transactions`
 * row is owned by exactly ONE user, using a wallet THAT user owns —
 * identical to an ordinary `transactions` row. `household_id` only TAGS the
 * transaction rows a materialization run produces as visible to the
 * household; it is never a household-owned rule, so there is deliberately
 * NO `requireHouseholdMember` gate anywhere in this file — `createTransaction`
 * (src/lib/services/transactions.ts) already re-verifies membership INSIDE
 * its own transaction, at the moment a tagged transaction is actually
 * posted, which is the only moment that matters (membership can change
 * between rule creation and any given cron run).
 *
 * Posting itself is never reimplemented here — every materialized
 * occurrence goes through `createTransaction` exactly as every other
 * income/expense row does, including all of ITS validation (wallet
 * ownership, category/type match, the future-date guard). This module only
 * owns: the `recurring_transactions` row's own CRUD, and the schedule
 * bookkeeping (`next_run_date`/`status`) around each materialization.
 *
 * ## Idempotency without one giant wrapping transaction
 *
 * `createTransaction` already opens (and commits) its own
 * `dbWrite.transaction()` internally — nesting a second, unrelated
 * transaction inside it would either need a savepoint `createTransaction`
 * doesn't know about, or (using the same top-level `dbWrite` handle) start
 * an entirely separate, non-atomic transaction anyway. So rather than
 * wrapping "post + advance next_run_date" in one artificial transaction,
 * this module relies on the SAME two-part idempotency guarantee the rest of
 * this codebase already leans on:
 *
 *  1. `createTransaction`'s own idempotency key — deterministically derived
 *     from `(recurring row id, the next_run_date value being materialized)`,
 *     NOT from wall-clock time — so calling it twice for the SAME due date
 *     always resolves to the SAME transaction row (retry-safe on its own).
 *  2. The `next_run_date` advance runs as a conditional UPDATE
 *     (`WHERE id = ... AND next_run_date = <the value just materialized>`)
 *     — a no-op if a concurrent/retried run already advanced it.
 *
 * If a crash lands between (1) and (2), the row is simply picked up again
 * on the next cron pass: step (1) resolves to the already-created
 * transaction (no duplicate — the idempotency key is unchanged, since
 * `next_run_date` never moved), and step (2) gets another chance to
 * succeed. No duplicate transaction is possible either way, matching
 * spec.md's acceptance criterion.
 */
import { and, eq, lte } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { categories, recurringTransactions, users, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import { createTransaction, type RecordableTransactionType } from './transactions';
import { computeNextRunDate, localDateToNoonUtc, type RecurringFrequency } from '@/lib/date/recurring';
import { DEFAULT_TIMEZONE, toLocalDate } from '@/lib/date/timezone';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import type { Money } from '@/lib/finance/money';
import type { TransactionClient } from '@/lib/db';

export type RecurringTransactionRow = typeof recurringTransactions.$inferSelect;

function assertPositiveAmount(amount: Money): void {
  if (amount <= 0n) {
    throw new ValidationError({ amount: ['Jumlah harus lebih dari Rp0'] });
  }
}

function assertValidDateRange(startDate: string, endDate: string | null): void {
  if (endDate !== null && endDate < startDate) {
    throw new ValidationError({ endDate: ['Tanggal berakhir tidak boleh sebelum tanggal mulai'] });
  }
}

/** Same ownership-only check `createTransaction` itself uses (transactions.ts's
 * `assertWalletOwned`) — duplicated locally rather than imported since it's
 * unexported there, same "each service defines its own tiny guard" pattern
 * src/lib/services/savings.ts already follows relative to transactions.ts. */
async function assertWalletOwned(tx: TransactionClient, userId: string, walletId: string): Promise<void> {
  const [wallet] = await tx
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.id, walletId), ownedBy(wallets, userId)))
    .limit(1);
  if (!wallet) {
    throw new ValidationError({ walletId: ['Dompet tidak ditemukan'] });
  }
}

async function assertCategoryMatchesType(
  tx: TransactionClient,
  userId: string,
  categoryId: string,
  type: RecordableTransactionType,
): Promise<void> {
  const [category] = await tx
    .select({ type: categories.type })
    .from(categories)
    .where(and(eq(categories.id, categoryId), ownedBy(categories, userId)))
    .limit(1);
  if (!category) {
    throw new ValidationError({ categoryId: ['Kategori tidak ditemukan'] });
  }
  if (category.type !== type) {
    throw new ValidationError({
      categoryId: [
        type === 'expense'
          ? 'Kategori ini untuk pemasukan, bukan pengeluaran'
          : 'Kategori ini untuk pengeluaran, bukan pemasukan',
      ],
    });
  }
}

async function resolveUserTimezone(userId: string): Promise<string> {
  const [row] = await dbWrite.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.timezone ?? DEFAULT_TIMEZONE;
}

export interface CreateRecurringTransactionInput {
  type: RecordableTransactionType;
  amount: Money;
  categoryId: string;
  walletId: string;
  note: string | null;
  frequency: RecurringFrequency;
  /** `YYYY-MM-DD`. Also becomes the initial `next_run_date`. */
  startDate: string;
  /** `YYYY-MM-DD`, or `null` for no end. */
  endDate: string | null;
  householdId?: string | null;
}

/**
 * Materializes ONE due occurrence and advances its schedule — the single
 * shared code path behind both `materializeRecurringTransactions` (the
 * cron's bulk pass) and `createRecurringTransaction`'s synchronous
 * "start_date is today" first-occurrence materialization (spec.md — "panggil
 * ulang logika materialize-satu-baris, jangan duplikasi"). Never throws:
 * `createTransaction` failures (archived wallet, deleted category, etc.)
 * are caught here and reported as `'failed'`, per spec.md's per-row
 * isolation requirement.
 */
async function materializeOneDueRow(
  row: Pick<
    RecurringTransactionRow,
    'id' | 'userId' | 'householdId' | 'type' | 'amount' | 'categoryId' | 'walletId' | 'note' | 'frequency' | 'endDate' | 'nextRunDate' | 'status'
  >,
  tz: string,
): Promise<'succeeded' | 'failed'> {
  try {
    await createTransaction(row.userId, {
      type: row.type as RecordableTransactionType,
      amount: row.amount,
      categoryId: row.categoryId,
      walletId: row.walletId,
      transactionDate: localDateToNoonUtc(row.nextRunDate, tz),
      note: row.note,
      idempotencyKey: `recurring:${row.id}:${row.nextRunDate}`,
      householdId: row.householdId,
    });
  } catch {
    return 'failed';
  }

  const nextRunDate = computeNextRunDate(row.nextRunDate, row.frequency as RecurringFrequency);
  const status = row.endDate !== null && nextRunDate > row.endDate ? 'ended' : row.status;

  // Conditional on the OLD next_run_date — a no-op if a concurrent/retried
  // pass already advanced this same row (see this module's file header).
  await dbWrite
    .update(recurringTransactions)
    .set({ nextRunDate, status, updatedAt: new Date() })
    .where(and(eq(recurringTransactions.id, row.id), eq(recurringTransactions.nextRunDate, row.nextRunDate)));

  return 'succeeded';
}

/**
 * Creates a recurring transaction rule. Wallet ownership and category
 * type-match are verified immediately (same checks `createTransaction`
 * itself performs at materialize time) so a user gets an immediate,
 * actionable error instead of a silently-`failed` cron run weeks later —
 * NOT a household-membership check, which deliberately stays absent (see
 * this module's file header).
 *
 * If `startDate` is TODAY in the caller's own local timezone, the first
 * occurrence is materialized synchronously, in this same request — spec.md:
 * a user recording "gaji hari ini" on payday itself expects it recorded
 * NOW, not tomorrow. The returned row reflects the POST-materialization
 * state (`next_run_date` already advanced) when that happens.
 */
export async function createRecurringTransaction(
  userId: string,
  input: CreateRecurringTransactionInput,
): Promise<RecurringTransactionRow> {
  assertPositiveAmount(input.amount);
  assertValidDateRange(input.startDate, input.endDate);

  const created = await dbWrite.transaction(async (tx) => {
    await assertWalletOwned(tx, userId, input.walletId);
    await assertCategoryMatchesType(tx, userId, input.categoryId, input.type);

    const [row] = await tx
      .insert(recurringTransactions)
      .values({
        id: uuidv7(),
        userId,
        householdId: input.householdId ?? null,
        type: input.type,
        amount: input.amount,
        categoryId: input.categoryId,
        walletId: input.walletId,
        note: input.note,
        frequency: input.frequency,
        startDate: input.startDate,
        endDate: input.endDate,
        nextRunDate: input.startDate,
        status: 'active',
      })
      .returning();

    return row!;
  });

  const tz = await resolveUserTimezone(userId);
  const today = toLocalDate(new Date(), tz);
  if (created.startDate === today) {
    await materializeOneDueRow(created, tz);
    const [refreshed] = await dbWrite
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.id, created.id))
      .limit(1);
    return refreshed ?? created;
  }

  return created;
}

/** Pauses a rule — materialization skips anything not `status = 'active'`.
 * `next_run_date` is left untouched, so `resumeRecurringTransaction` picks
 * up exactly where it left off, never from "today" (spec.md acceptance
 * criterion). */
export async function pauseRecurringTransaction(userId: string, id: string): Promise<RecurringTransactionRow> {
  return dbWrite.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(recurringTransactions)
      .where(and(eq(recurringTransactions.id, id), ownedBy(recurringTransactions, userId)))
      .limit(1);
    if (!existing) {
      throw new NotFoundError('Transaksi rutin tidak ditemukan');
    }
    if (existing.status === 'ended') {
      throw new ValidationError({ status: ['Transaksi rutin ini sudah berakhir'] });
    }

    const [updated] = await tx
      .update(recurringTransactions)
      .set({ status: 'paused', updatedAt: new Date() })
      .where(eq(recurringTransactions.id, id))
      .returning();
    return updated!;
  });
}

export async function resumeRecurringTransaction(userId: string, id: string): Promise<RecurringTransactionRow> {
  return dbWrite.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(recurringTransactions)
      .where(and(eq(recurringTransactions.id, id), ownedBy(recurringTransactions, userId)))
      .limit(1);
    if (!existing) {
      throw new NotFoundError('Transaksi rutin tidak ditemukan');
    }
    if (existing.status !== 'paused') {
      throw new ValidationError({ status: ['Hanya transaksi rutin yang dijeda dapat dilanjutkan'] });
    }

    const [updated] = await tx
      .update(recurringTransactions)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(recurringTransactions.id, id))
      .returning();
    return updated!;
  });
}

export async function deleteRecurringTransaction(userId: string, id: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: recurringTransactions.id })
      .from(recurringTransactions)
      .where(and(eq(recurringTransactions.id, id), ownedBy(recurringTransactions, userId)))
      .limit(1);
    if (!existing) {
      throw new NotFoundError('Transaksi rutin tidak ditemukan');
    }
    await tx.delete(recurringTransactions).where(eq(recurringTransactions.id, id));
  });
}

export interface MaterializeTransactionsResult {
  succeeded: number;
  failed: number;
}

/**
 * The cron's bulk pass — `/api/cron/recurring` (spec.md). Runs DAILY,
 * per-user-timezone, exactly like `materializeRecurringBudgets`
 * (src/lib/services/budgets.ts): resolves every DISTINCT `users.timezone`
 * in use, and for each one asks "what's due, in THIS timezone's today" —
 * most invocations touch zero rows for a given timezone, which is expected,
 * not an error (this cron runs daily regardless of which users' local
 * calendar actually advanced).
 */
export async function materializeRecurringTransactions(now: Date = new Date()): Promise<MaterializeTransactionsResult> {
  const timezones = await dbWrite.selectDistinct({ timezone: users.timezone }).from(users);

  let succeeded = 0;
  let failed = 0;

  for (const { timezone } of timezones) {
    const today = toLocalDate(now, timezone);

    const dueRows = await dbWrite
      .select({
        id: recurringTransactions.id,
        userId: recurringTransactions.userId,
        householdId: recurringTransactions.householdId,
        type: recurringTransactions.type,
        amount: recurringTransactions.amount,
        categoryId: recurringTransactions.categoryId,
        walletId: recurringTransactions.walletId,
        note: recurringTransactions.note,
        frequency: recurringTransactions.frequency,
        endDate: recurringTransactions.endDate,
        nextRunDate: recurringTransactions.nextRunDate,
        status: recurringTransactions.status,
      })
      .from(recurringTransactions)
      .innerJoin(users, eq(users.id, recurringTransactions.userId))
      .where(
        and(
          eq(users.timezone, timezone),
          eq(recurringTransactions.status, 'active'),
          lte(recurringTransactions.nextRunDate, today),
        ),
      );

    for (const row of dueRows) {
      const outcome = await materializeOneDueRow(row, timezone);
      if (outcome === 'succeeded') succeeded++;
      else failed++;
    }
  }

  return { succeeded, failed };
}
