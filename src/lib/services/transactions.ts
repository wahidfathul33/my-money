/**
 * Transactions service — dbWrite transactions live here, per
 * docs/11-tech-architecture.md §3 (only src/lib/services/** may import
 * `@/lib/db/write`). Every mutation re-verifies ownership INSIDE the
 * transaction (`ownedBy`), same discipline as src/lib/services/wallets.ts —
 * tasks/07-transactions-core/spec.md "Batasan": "verifikasi kepemilikan di
 * dalam transaction".
 *
 * `transactions.amount` is ALWAYS positive; the sign lives on the ledger,
 * applied by `signedAmount()` below from `type` alone — never from user
 * input (docs/03-domain-model.md §8.1, docs/05-financial-integrity.md §4).
 * `postEntries` (src/lib/finance/ledger.ts) is the only thing that ever
 * touches `wallets.balance`.
 *
 * `transfer` is explicitly out of scope here (tasks/08-transfers-self) —
 * every function refuses a `type: 'transfer'` row it encounters rather than
 * silently mishandling one, so task 08 has a clean seam to add its own
 * `recordTransfer` alongside these without this module accidentally having
 * grown half a transfer implementation already.
 *
 * ## Why edit voids a {old, reversal} PAIR but plain void does not
 *
 * `wallets.balance` is a pure running total: `postEntries` only ever adds a
 * newly-inserted entry's delta, and NEVER re-reads or adjusts it because
 * some earlier entry's `voided_at` changed. That makes the reconciliation
 * invariant (`balance = SUM(ledger_entries.amount WHERE voided_at IS NULL)`,
 * docs/05 §5 I1) hold only for entries whose `voided_at` NET CONTRIBUTION is
 * zero — i.e. you may only retroactively exclude a GROUP of entries from
 * that sum if the group's amounts already summed to zero, because excluding
 * a zero-sum group changes the filtered SUM by zero, matching that the
 * (delta-only) cache was never touched either.
 *
 * `voidTransaction` posts one reversal per live entry and deliberately
 * leaves BOTH the original and the reversal non-voided — their sum is zero,
 * so the SUM-based invariant holds with neither of them excluded, exactly
 * as docs/05 §4's table describes ("entry pembalik INSERT", no mention of
 * voiding the original).
 *
 * `updateTransaction` does one step more: after posting a reversal for each
 * old entry (making that {old, reversal} pair net zero), it sets
 * `voided_at` on BOTH of them together — a zero-sum group, so excluding it
 * changes the filtered SUM by exactly zero, keeping I1 exact — and THEN
 * posts the fresh entry for the new amount/wallet. The result: the ledger
 * keeps full history (old value, and the correction that superseded it,
 * both still rows in the table) while wallet detail views that filter on
 * `voided_at IS NULL` show only the one currently-true entry, matching
 * docs/05 §4's "void entry lama · pembalik INSERT · entry baru INSERT".
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { categories, ledgerEntries, transactions, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import { postEntries } from '@/lib/finance/ledger';
import type { Money } from '@/lib/finance/money';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireHouseholdMember } from '@/lib/auth/require-household';
import type { TransactionClient } from '@/lib/db';

export type TransactionRow = typeof transactions.$inferSelect;

/** `transfer` is task 08's — every function here only accepts these two. */
export type RecordableTransactionType = 'income' | 'expense';

const IDEMPOTENCY_CONSTRAINT = 'tx_idempotency_uniq';

// A transaction dated further out than this is rejected — docs/03 §8.4
// "transaction_date ≤ besok". A generous 2-day window (not exactly
// "tomorrow 23:59:59") absorbs client/server clock skew and timezone
// differences without needing to resolve the user's local "tomorrow" here.
const MAX_FUTURE_DAYS = 2;

/** True when `err` is a Postgres unique-violation (23505) on `constraintName` — docs/05 §6. */
function isUniqueViolation(err: unknown, constraintName: string): boolean {
  const pgErr = err as { code?: string; constraint?: string; cause?: unknown } | null;
  if (!pgErr || typeof pgErr !== 'object') return false;
  if (pgErr.code === '23505' && pgErr.constraint === constraintName) return true;
  // neon-serverless can wrap the underlying pg protocol error — check one level of `cause`.
  return pgErr.cause !== undefined && isUniqueViolation(pgErr.cause, constraintName);
}

/** Signed effect on the wallet at the ledger boundary — docs/03 §8.1. Never derived from user input. */
function signedAmount(type: RecordableTransactionType, amount: Money): Money {
  return type === 'income' ? amount : -amount;
}

function assertPositiveAmount(amount: Money): void {
  if (amount <= 0n) {
    throw new ValidationError({ amount: ['Jumlah harus lebih dari Rp0'] });
  }
}

function assertNotTooFarInFuture(date: Date): void {
  const limit = new Date();
  limit.setDate(limit.getDate() + MAX_FUTURE_DAYS);
  if (date.getTime() > limit.getTime()) {
    throw new ValidationError({ transactionDate: ['Tanggal tidak valid'] });
  }
}

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

/** Verifies the category belongs to the caller AND its `type` matches the transaction's — docs/03 §8.4. */
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

async function findByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): Promise<TransactionRow | undefined> {
  const [row] = await dbWrite
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row;
}

export interface CreateTransactionInput {
  type: RecordableTransactionType;
  amount: Money;
  categoryId: string;
  walletId: string;
  transactionDate: Date;
  note: string | null;
  idempotencyKey: string;
  /**
   * Household to tag this transaction to — docs/03-domain-model.md §8.2,
   * mechanism #1 of tasks/12-sharing-and-privacy/spec.md's "dua mekanisme
   * saja". `null` or omitted means a purely personal transaction (the
   * default — docs/12-security-and-auth.md's "default privat").
   *
   * Re-verified INSIDE this same `dbWrite.transaction()` via
   * `requireHouseholdMember`, never trusted from the caller alone — spec.md
   * "Keanggotaan aktif diverifikasi di dalam transaction saat menulis
   * household_id" and docs/12 §5 threat H1. Membership can be revoked at any
   * moment, so the check and the write it gates must be atomic.
   */
  householdId?: string | null;
}

/**
 * Catat income/expense — one `dbWrite.transaction()`: `transactions` INSERT
 * · `ledger_entries` INSERT · `wallets.balance` UPDATE (docs/05 §4).
 *
 * Idempotent: a repeat call with the same `idempotencyKey` returns the
 * transaction created by the FIRST call rather than erroring or creating a
 * duplicate — the unique-violation on `tx_idempotency_uniq` is caught
 * outside the (rolled-back) transaction and resolved by looking the
 * original row back up (docs/05 §6).
 */
export async function createTransaction(
  userId: string,
  input: CreateTransactionInput,
): Promise<TransactionRow> {
  assertPositiveAmount(input.amount);
  assertNotTooFarInFuture(input.transactionDate);

  try {
    return await dbWrite.transaction(async (tx) => {
      await assertWalletOwned(tx, userId, input.walletId);
      await assertCategoryMatchesType(tx, userId, input.categoryId, input.type);
      if (input.householdId) {
        await requireHouseholdMember(tx, userId, input.householdId);
      }

      const id = uuidv7();
      const [row] = await tx
        .insert(transactions)
        .values({
          id,
          userId,
          type: input.type,
          categoryId: input.categoryId,
          amount: input.amount,
          transactionDate: input.transactionDate,
          note: input.note,
          createdBy: userId,
          idempotencyKey: input.idempotencyKey,
          householdId: input.householdId ?? null,
        })
        .returning();

      await postEntries(tx, [
        {
          userId,
          walletId: input.walletId,
          amount: signedAmount(input.type, input.amount),
          source: 'transaction',
          entryDate: input.transactionDate,
          transactionId: id,
        },
      ]);

      return row!;
    });
  } catch (err) {
    if (isUniqueViolation(err, IDEMPOTENCY_CONSTRAINT)) {
      const existing = await findByIdempotencyKey(userId, input.idempotencyKey);
      if (existing) return existing;
    }
    throw err;
  }
}

export interface UpdateTransactionInput {
  type: RecordableTransactionType;
  amount: Money;
  categoryId: string;
  walletId: string;
  transactionDate: Date;
  note: string | null;
  /**
   * Household tag — same rule as `CreateTransactionInput.householdId`
   * (re-verified inside this transaction), but tri-state here because an
   * edit is otherwise a full field replace (every other field above is
   * always sent): `undefined` (the key omitted) leaves the transaction's
   * EXISTING tag untouched — for callers that don't care about this field at
   * all — `null` clears it, and a household id re-tags (or re-verifies) it.
   * The real edit sheet (src/features/transactions/components/edit-transaction-sheet.tsx)
   * always sends an explicit value, never omits it.
   */
  householdId?: string | null;
}

/**
 * Edit — one `dbWrite.transaction()`: void old entry(ies) · pembalik INSERT
 * · entry baru INSERT · saldo UPDATE (docs/05 §4). See this module's doc
 * comment for why the old+reversal pair gets `voided_at` set together.
 */
export async function updateTransaction(
  userId: string,
  transactionId: string,
  input: UpdateTransactionInput,
): Promise<TransactionRow> {
  assertPositiveAmount(input.amount);
  assertNotTooFarInFuture(input.transactionDate);

  return dbWrite.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: transactions.id, type: transactions.type })
      .from(transactions)
      .where(
        and(eq(transactions.id, transactionId), ownedBy(transactions, userId), isNull(transactions.voidedAt)),
      )
      .limit(1);
    if (!existing || existing.type === 'transfer') {
      throw new NotFoundError('Transaksi tidak ditemukan');
    }

    await assertWalletOwned(tx, userId, input.walletId);
    await assertCategoryMatchesType(tx, userId, input.categoryId, input.type);
    if (input.householdId) {
      await requireHouseholdMember(tx, userId, input.householdId);
    }

    const oldEntries = await tx
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.transactionId, transactionId), isNull(ledgerEntries.voidedAt)));

    const now = new Date();
    const reversalIds: string[] = [];
    for (const entry of oldEntries) {
      const [reversal] = await postEntries(tx, [
        {
          userId: entry.userId,
          walletId: entry.walletId,
          amount: -entry.amount,
          source: 'transaction',
          entryDate: now,
          transactionId,
        },
      ]);
      reversalIds.push(reversal!.id);
    }

    const idsToVoid = [...oldEntries.map((e) => e.id), ...reversalIds];
    if (idsToVoid.length > 0) {
      await tx.update(ledgerEntries).set({ voidedAt: now }).where(inArray(ledgerEntries.id, idsToVoid));
    }

    await postEntries(tx, [
      {
        userId,
        walletId: input.walletId,
        amount: signedAmount(input.type, input.amount),
        source: 'transaction',
        entryDate: input.transactionDate,
        transactionId,
      },
    ]);

    const [updated] = await tx
      .update(transactions)
      .set({
        type: input.type,
        categoryId: input.categoryId,
        amount: input.amount,
        transactionDate: input.transactionDate,
        note: input.note,
        updatedAt: now,
        // Tri-state — see UpdateTransactionInput.householdId's doc comment.
        ...(input.householdId !== undefined ? { householdId: input.householdId } : {}),
      })
      .where(and(eq(transactions.id, transactionId), ownedBy(transactions, userId)))
      .returning();

    return updated!;
  });
}

/** Exported so src/features/sharing/schema.ts's Zod cap can't silently drift from the authoritative service-layer cap. */
export const BULK_TAG_MAX = 200;

/**
 * Toggles just the household tag on an existing, non-voided income/expense
 * transaction — the lightweight counterpart to passing `householdId` through
 * the full `updateTransaction` edit flow, used by a quick toggle and by
 * `bulkTagTransactions` below. Same re-verification discipline: membership
 * is checked INSIDE this transaction, right before the write it gates.
 */
export async function setTransactionHousehold(
  userId: string,
  transactionId: string,
  householdId: string | null,
): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: transactions.id, type: transactions.type })
      .from(transactions)
      .where(
        and(eq(transactions.id, transactionId), ownedBy(transactions, userId), isNull(transactions.voidedAt)),
      )
      .limit(1);
    if (!existing) {
      throw new NotFoundError('Transaksi tidak ditemukan');
    }

    if (householdId !== null) {
      await requireHouseholdMember(tx, userId, householdId);
    }

    await tx
      .update(transactions)
      .set({ householdId, updatedAt: new Date() })
      .where(and(eq(transactions.id, transactionId), ownedBy(transactions, userId)));
  });
}

export interface BulkTagResult {
  /** How many of `transactionIds` were actually tagged — excludes ids that
   * didn't belong to the caller, were already voided, or didn't exist.
   * Surfaced by the UI as the "confirmed count" spec.md's acceptance
   * criteria asks for ("Penandaan massal ... berfungsi dengan konfirmasi
   * jumlah"). */
  taggedCount: number;
}

/**
 * Tags many of the caller's own transactions to one household in a single
 * `dbWrite.transaction()` — todo.md "Penandaan Massal": most people create a
 * household weeks into using the app, and shouldn't have to wait for NEW
 * transactions to see a family report fill in.
 *
 * Membership is verified ONCE, inside this same transaction, before any row
 * is touched (same "verify inside the transaction" discipline as every
 * other household-tagging path here — the check and the writes it gates
 * stay atomic). Every id is additionally re-scoped with `ownedBy` on the
 * UPDATE itself, so an id belonging to someone else silently matches zero
 * rows rather than erroring — the same "affects 0 rows" isolation shape as
 * every other cross-user-id-rejection in this codebase (see
 * src/lib/db/__tests__/scoped.isolation.integration.test.ts).
 *
 * `BULK_TAG_MAX` bounds a single call (todo.md "dengan batas jumlah per
 * panggilan") — a request for more than that is rejected outright rather
 * than silently truncated, so the caller's confirmation count always
 * matches what actually got tagged.
 */
export async function bulkTagTransactions(
  userId: string,
  transactionIds: string[],
  householdId: string,
): Promise<BulkTagResult> {
  if (transactionIds.length === 0) {
    return { taggedCount: 0 };
  }
  if (transactionIds.length > BULK_TAG_MAX) {
    throw new ValidationError({
      transactionIds: [`Maksimal ${BULK_TAG_MAX} transaksi per penandaan massal`],
    });
  }

  return dbWrite.transaction(async (tx) => {
    await requireHouseholdMember(tx, userId, householdId);

    const result = await tx
      .update(transactions)
      .set({ householdId, updatedAt: new Date() })
      .where(
        and(
          inArray(transactions.id, transactionIds),
          ownedBy(transactions, userId),
          isNull(transactions.voidedAt),
        ),
      );

    return { taggedCount: result.rowCount ?? 0 };
  });
}

/**
 * Void ("Hapus" in the UI) — one `dbWrite.transaction()`: `transactions.voided_at`
 * SET · entry pembalik INSERT · saldo UPDATE (docs/05 §4). The original
 * ledger entry is deliberately left non-voided — see this module's doc
 * comment.
 */
export async function voidTransaction(userId: string, transactionId: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: transactions.id, type: transactions.type })
      .from(transactions)
      .where(
        and(eq(transactions.id, transactionId), ownedBy(transactions, userId), isNull(transactions.voidedAt)),
      )
      .limit(1);
    if (!existing || existing.type === 'transfer') {
      throw new NotFoundError('Transaksi tidak ditemukan');
    }

    const liveEntries = await tx
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.transactionId, transactionId), isNull(ledgerEntries.voidedAt)));

    if (liveEntries.length > 0) {
      await postEntries(
        tx,
        liveEntries.map((entry) => ({
          userId: entry.userId,
          walletId: entry.walletId,
          amount: -entry.amount,
          source: 'transaction' as const,
          entryDate: new Date(),
          transactionId,
        })),
      );
    }

    await tx
      .update(transactions)
      .set({ voidedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(transactions.id, transactionId), ownedBy(transactions, userId)));
  });
}

/**
 * Undo — backs the 5-second "Urungkan" toast action (tasks/07 spec.md).
 * Re-derives the wallet contribution from `transactions.type`/`.amount`
 * (untouched by `voidTransaction`) rather than trying to infer it from the
 * now net-zero {original, void-reversal} pair already sitting in the
 * ledger, so it works regardless of how many live entries that pair left
 * behind.
 */
export async function unvoidTransaction(userId: string, transactionId: string): Promise<TransactionRow> {
  return dbWrite.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), ownedBy(transactions, userId)))
      .limit(1);
    if (!existing || existing.voidedAt === null || existing.type === 'transfer') {
      throw new NotFoundError('Transaksi tidak ditemukan');
    }

    const liveEntries = await tx
      .select({ walletId: ledgerEntries.walletId, userId: ledgerEntries.userId })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.transactionId, transactionId), isNull(ledgerEntries.voidedAt)));

    const seen = new Set<string>();
    const targets = liveEntries.filter((entry) => {
      const key = `${entry.walletId}:${entry.userId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (targets.length > 0) {
      await postEntries(
        tx,
        targets.map((target) => ({
          userId: target.userId,
          walletId: target.walletId,
          amount: signedAmount(existing.type as RecordableTransactionType, existing.amount),
          source: 'transaction' as const,
          entryDate: new Date(),
          transactionId,
        })),
      );
    }

    const [updated] = await tx
      .update(transactions)
      .set({ voidedAt: null, updatedAt: new Date() })
      .where(and(eq(transactions.id, transactionId), ownedBy(transactions, userId)))
      .returning();

    return updated!;
  });
}
