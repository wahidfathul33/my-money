/**
 * Transfers service — dbWrite transactions live here, per
 * docs/11-tech-architecture.md §3 (only src/lib/services/** may import
 * `@/lib/db/write`). Every mutation re-verifies ownership of BOTH wallets
 * INSIDE the transaction — tasks/08-transfers-self/spec.md "Auth pattern":
 * "ownership of BOTH wallets verified inside the write transaction (not just
 * the source)".
 *
 * Kept as its own service rather than folded into
 * src/lib/services/transactions.ts — a self-transfer's shape (one
 * `transactions` row, TWO `ledger_entries`, `category_id` NULL, Σ = 0) is
 * meaningfully different from a record's (one entry, has a category), and
 * src/lib/services/transactions.ts already documents that every function
 * there refuses a `type: 'transfer'` row on sight rather than growing a
 * second, half-built transfer implementation alongside this one.
 *
 * `transactions.amount` is ALWAYS positive; direction lives entirely on the
 * ledger via `buildSelfTransferEntries` (src/lib/finance/transfer.ts) —
 * never derived from which button the user tapped first.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { ledgerEntries, transactions, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import { postEntries } from '@/lib/finance/ledger';
import { buildSelfTransferEntries } from '@/lib/finance/transfer';
import type { Money } from '@/lib/finance/money';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import type { TransactionClient } from '@/lib/db';

export type TransferRow = typeof transactions.$inferSelect;

const IDEMPOTENCY_CONSTRAINT = 'tx_idempotency_uniq';

// Mirrors src/lib/services/transactions.ts's own window — docs/03 §8.4
// "transaction_date ≤ besok", generous enough to absorb client/server clock
// skew without resolving the user's local "tomorrow" here.
const MAX_FUTURE_DAYS = 2;

/** True when `err` is a Postgres unique-violation (23505) on `constraintName` — docs/05 §6. */
function isUniqueViolation(err: unknown, constraintName: string): boolean {
  const pgErr = err as { code?: string; constraint?: string; cause?: unknown } | null;
  if (!pgErr || typeof pgErr !== 'object') return false;
  if (pgErr.code === '23505' && pgErr.constraint === constraintName) return true;
  return pgErr.cause !== undefined && isUniqueViolation(pgErr.cause, constraintName);
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

/** Verifies the wallet belongs to the caller AND is active (not archived) — spec.md "Validasi menolak". */
async function assertWalletOwnedAndActive(
  tx: TransactionClient,
  userId: string,
  walletId: string,
  field: 'fromWalletId' | 'toWalletId',
): Promise<void> {
  const [wallet] = await tx
    .select({ id: wallets.id, isArchived: wallets.isArchived })
    .from(wallets)
    .where(and(eq(wallets.id, walletId), ownedBy(wallets, userId)))
    .limit(1);

  if (!wallet) {
    throw new ValidationError({ [field]: ['Dompet tidak ditemukan'] });
  }
  if (wallet.isArchived) {
    throw new ValidationError({ [field]: ['Dompet yang diarsipkan tidak bisa dipakai untuk transfer'] });
  }
}

async function findByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): Promise<TransferRow | undefined> {
  const [row] = await dbWrite
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row;
}

export interface CreateSelfTransferInput {
  fromWalletId: string;
  toWalletId: string;
  amount: Money;
  transactionDate: Date;
  note: string | null;
  idempotencyKey: string;
}

/**
 * Catat transfer antar dompet sendiri — one `dbWrite.transaction()`: one
 * `transactions` INSERT (`type='transfer'`, `category_id=NULL`,
 * `counterparty_user_id=NULL` — always NULL here, task 13 activates it for
 * member transfers) · TWO `ledger_entries` INSERT via `postEntries` ·
 * `wallets.balance` UPDATE on both wallets (docs/03 §9.2).
 *
 * Idempotent the same way `createTransaction` is: a repeat call with the
 * same `idempotencyKey` returns the transfer created by the FIRST call
 * instead of erroring or creating a duplicate.
 */
export async function createSelfTransfer(
  userId: string,
  input: CreateSelfTransferInput,
): Promise<TransferRow> {
  assertPositiveAmount(input.amount);
  assertNotTooFarInFuture(input.transactionDate);
  if (input.fromWalletId === input.toWalletId) {
    throw new ValidationError({ toWalletId: ['Dompet tujuan harus berbeda dari dompet asal'] });
  }

  try {
    return await dbWrite.transaction(async (tx) => {
      await assertWalletOwnedAndActive(tx, userId, input.fromWalletId, 'fromWalletId');
      await assertWalletOwnedAndActive(tx, userId, input.toWalletId, 'toWalletId');

      const id = uuidv7();
      const [row] = await tx
        .insert(transactions)
        .values({
          id,
          userId,
          type: 'transfer',
          categoryId: null,
          amount: input.amount,
          transactionDate: input.transactionDate,
          note: input.note,
          counterpartyUserId: null,
          createdBy: userId,
          idempotencyKey: input.idempotencyKey,
        })
        .returning();

      await postEntries(
        tx,
        buildSelfTransferEntries({
          userId,
          fromWalletId: input.fromWalletId,
          toWalletId: input.toWalletId,
          amount: input.amount,
          entryDate: input.transactionDate,
          transactionId: id,
        }),
      );

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

/**
 * Void — one `dbWrite.transaction()`: `transactions.voided_at` SET · a
 * reversal `ledger_entries` INSERT for BOTH live entries in the SAME
 * `postEntries` call (so both wallets' balances correct atomically) ·
 * neither original entry is voided — same "leave {original, reversal} both
 * live, their sum is zero" reasoning as
 * src/lib/services/transactions.ts's `voidTransaction` doc comment.
 */
export async function voidTransfer(userId: string, transactionId: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: transactions.id, type: transactions.type })
      .from(transactions)
      .where(
        and(eq(transactions.id, transactionId), ownedBy(transactions, userId), isNull(transactions.voidedAt)),
      )
      .limit(1);
    if (!existing || existing.type !== 'transfer') {
      throw new NotFoundError('Transfer tidak ditemukan');
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
 * Undo — backs the "Urungkan" toast action after a delete, same UI contract
 * as `unvoidTransaction`. Unlike income/expense (whose direction is derived
 * from `transactions.type` alone), a transfer's two wallets don't carry
 * direction in their *current* net contribution — after `voidTransfer` both
 * wallets' live entries for this transaction net to zero. Direction is
 * instead read off the EARLIEST entry per wallet (`ORDER BY created_at ASC`,
 * `.entries` inserted by `createSelfTransfer` before any reversal), which
 * still carries the original signed amount.
 */
export async function unvoidTransfer(userId: string, transactionId: string): Promise<TransferRow> {
  return dbWrite.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), ownedBy(transactions, userId)))
      .limit(1);
    if (!existing || existing.voidedAt === null || existing.type !== 'transfer') {
      throw new NotFoundError('Transfer tidak ditemukan');
    }

    const allEntries = await tx
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, transactionId))
      .orderBy(asc(ledgerEntries.createdAt));

    const originalByWallet = new Map<string, { userId: string; walletId: string; amount: Money }>();
    for (const entry of allEntries) {
      if (!originalByWallet.has(entry.walletId)) {
        originalByWallet.set(entry.walletId, {
          userId: entry.userId,
          walletId: entry.walletId,
          amount: entry.amount,
        });
      }
    }

    const targets = [...originalByWallet.values()];
    if (targets.length > 0) {
      await postEntries(
        tx,
        targets.map((target) => ({
          userId: target.userId,
          walletId: target.walletId,
          amount: target.amount,
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
