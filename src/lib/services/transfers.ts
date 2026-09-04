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
 *
 * tasks/13-transfers-member adds `createMemberTransfer` alongside
 * `createSelfTransfer` in this SAME file — docs/03-domain-model.md §9.1:
 * "Keduanya adalah fitur setara, bukan yang satu turunan yang lain." A
 * member transfer is **the only operation in the whole app that writes to
 * another person's ledger** (spec.md) — the exception is narrow and named:
 * `tx_created_by_rule` (src/lib/db/schema/transactions.ts) restricts
 * `created_by <> user_id` to exactly the receiving side of a transfer, and
 * `postEntries`'s per-entry `userId` (never `entries[0].userId` — see
 * ADR-030's "yang perlu dijaga") is what keeps invariant I11
 * (`ledger_entries.user_id` always equals the wallet's owner) true even
 * though the SENDER wrote both rows.
 */
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { ledgerEntries, transactions, users, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import { postEntries } from '@/lib/finance/ledger';
import { buildSelfTransferEntries } from '@/lib/finance/transfer';
import type { Money } from '@/lib/finance/money';
import { NotFoundError, ValidationError, WalletNotEligibleError } from '@/lib/api/errors';
import { requireHouseholdMember } from '@/lib/auth/require-household';
import { isWalletTransferEligible } from '@/lib/visibility/transfer-targets';
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

export interface CreateMemberTransferInput {
  /** The household both users must be active members of — checked INSIDE
   * the transaction (below), never before it. Also stamped onto both
   * `transactions` rows as their `household_id` TAG (not a user choice here,
   * unlike task 12's 🏠 toggle for ordinary records — a member transfer only
   * exists BECAUSE of this household relationship, so there's exactly one
   * correct value, not an optional one). */
  householdId: string;
  fromWalletId: string;
  counterpartyUserId: string;
  toWalletId: string;
  amount: Money;
  transactionDate: Date;
  note: string | null;
  idempotencyKey: string;
}

/**
 * Catat transfer ke anggota household — docs/03-domain-model.md §9.3,
 * ADR-030. **The only operation in the whole app that writes to another
 * person's ledger** (spec.md) — everything below exists to keep that
 * exception narrow, attributed, and reversible by its true owner.
 *
 * ONE `dbWrite.transaction()`:
 *   1. `fromWalletId` verified owned by `userId` AND active.
 *   2. `requireHouseholdMember` for BOTH `userId` and `counterpartyUserId`,
 *      against the SAME `householdId` — checked here, inside the write,
 *      never as a pre-check (tasks/13 "Auth pattern").
 *   3. `toWalletId` re-verified against `isWalletTransferEligible`
 *      (src/lib/visibility/transfer-targets.ts, docs/12 §4.3) — belongs to
 *      `counterpartyUserId`, active, not `exclude_from_household`, not a
 *      credit card. `WalletNotEligibleError` (named after their name) if not.
 *   4. TWO `transactions` rows inserted in ONE statement — both UUIDs are
 *      minted upfront so `linked_transaction_id` is correct on BOTH rows
 *      from the moment they exist; there is no window where only one side
 *      is linked. `created_by = userId` on BOTH (the one legal shape
 *      `tx_created_by_rule` permits). `acknowledged_at` stays NULL on the
 *      receiver's row — that's what the Activity badge counts.
 *   5. TWO `ledger_entries` via ONE `postEntries` call — `userId` on each is
 *      the WALLET'S owner (sender on the outgoing entry, receiver on the
 *      incoming one), never the caller. This is what keeps invariant I11
 *      true even though `userId` (the caller) wrote both entries.
 *
 * A failure at ANY step rolls back the WHOLE transaction — Postgres commits
 * all-or-nothing, so there is never a state with only one side recorded.
 *
 * Idempotent the same way `createSelfTransfer` is: a repeat call with the
 * same `idempotencyKey` returns the SENDER'S row from the FIRST call.
 */
export async function createMemberTransfer(
  userId: string,
  input: CreateMemberTransferInput,
): Promise<TransferRow> {
  assertPositiveAmount(input.amount);
  assertNotTooFarInFuture(input.transactionDate);
  if (input.counterpartyUserId === userId) {
    throw new ValidationError({ counterpartyUserId: ['Pilih anggota lain sebagai tujuan transfer'] });
  }

  try {
    return await dbWrite.transaction(async (tx) => {
      await assertWalletOwnedAndActive(tx, userId, input.fromWalletId, 'fromWalletId');

      // Both sides of the relationship, re-verified here — membership can
      // be revoked at any moment, so this can't be a check that ran before
      // the transaction opened.
      await requireHouseholdMember(tx, userId, input.householdId);
      await requireHouseholdMember(tx, input.counterpartyUserId, input.householdId);

      const eligible = await isWalletTransferEligible(tx, {
        walletId: input.toWalletId,
        counterpartyUserId: input.counterpartyUserId,
        householdId: input.householdId,
      });
      if (!eligible) {
        const [counterparty] = await tx
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, input.counterpartyUserId))
          .limit(1);
        throw new WalletNotEligibleError(counterparty?.name ?? counterparty?.email ?? 'anggota ini');
      }

      const senderTxId = uuidv7();
      const receiverTxId = uuidv7();

      const inserted = await tx
        .insert(transactions)
        .values([
          {
            id: senderTxId,
            userId,
            householdId: input.householdId,
            type: 'transfer',
            categoryId: null,
            amount: input.amount,
            transactionDate: input.transactionDate,
            note: input.note,
            counterpartyUserId: input.counterpartyUserId,
            linkedTransactionId: receiverTxId,
            createdBy: userId,
            idempotencyKey: input.idempotencyKey,
          },
          {
            id: receiverTxId,
            userId: input.counterpartyUserId,
            householdId: input.householdId,
            type: 'transfer',
            categoryId: null,
            amount: input.amount,
            transactionDate: input.transactionDate,
            note: input.note,
            counterpartyUserId: userId,
            linkedTransactionId: senderTxId,
            createdBy: userId,
            // NULL, not input.idempotencyKey — the retry-lookup below only
            // ever looks up by the SENDER's (userId, idempotencyKey), so
            // there is no reason to also occupy the receiver's own
            // idempotency namespace with a key they never chose.
            idempotencyKey: null,
          },
        ])
        .returning();

      // Found by id, not positionally (`inserted[0]`) — a multi-row INSERT's
      // RETURNING order isn't part of any contract this code should lean on.
      const senderRow = inserted.find((row) => row.id === senderTxId);

      await postEntries(tx, [
        {
          userId,
          walletId: input.fromWalletId,
          amount: -input.amount,
          source: 'transaction',
          entryDate: input.transactionDate,
          transactionId: senderTxId,
        },
        {
          // The WALLET'S owner — the receiver — never `userId` (the
          // caller). See this file's header and ADR-030.
          userId: input.counterpartyUserId,
          walletId: input.toWalletId,
          amount: input.amount,
          source: 'transaction',
          entryDate: input.transactionDate,
          transactionId: receiverTxId,
        },
      ]);

      return senderRow!;
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
 *
 * Works identically for a SELF-transfer (either wallet) or EITHER side of a
 * MEMBER transfer (docs/03 §9.5: "Hanya pemilik transaksi yang dapat
 * mengedit atau mem-void-nya, ... termasuk sisi yang ditulis orang lain") —
 * `ownedBy` gates on `transactions.user_id`, never `created_by`, so the
 * receiver voiding the row the SENDER wrote for them is just as ordinary an
 * operation as the sender voiding their own.
 *
 * tasks/13-transfers-member: when the voided row is LINKED
 * (`linked_transaction_id IS NOT NULL` — only ever true for a member
 * transfer), the link is severed on BOTH sides as part of the same
 * transaction — spec.md's "Hapus" action: "tautan dilepas". This is NOT
 * cosmetic: voiding posts a reversal entry, which by itself would make
 * `src/lib/db/reconcile.ts`'s I12 (a linked pair's live entries must sum to
 * zero) see THREE live entries instead of two and falsely report an
 * imbalance. Nulling the link on both sides removes the pair from I12/I18's
 * checks entirely — correct, because a pair with one side voided isn't a
 * balanced pair anymore; each side is just its own ordinary transaction from
 * here on. A self-transfer's `linked_transaction_id` is always NULL
 * already, so this is a no-op for that case.
 */
export async function voidTransfer(userId: string, transactionId: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: transactions.id,
        type: transactions.type,
        linkedTransactionId: transactions.linkedTransactionId,
      })
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

    const now = new Date();
    await tx
      .update(transactions)
      .set({ voidedAt: now, updatedAt: now, linkedTransactionId: null })
      .where(and(eq(transactions.id, transactionId), ownedBy(transactions, userId)));

    // The counterpart's own `linked_transaction_id` still points back here —
    // clear it too, or it would be the one-way link I18 exists to catch.
    if (existing.linkedTransactionId) {
      await tx
        .update(transactions)
        .set({ linkedTransactionId: null, updatedAt: now })
        .where(eq(transactions.id, existing.linkedTransactionId));
    }
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
 *
 * Deliberately does NOT restore `linked_transaction_id` for a member
 * transfer's side (`voidTransfer` nulls it on both rows). Reconstructing
 * "which OTHER row this used to point at" isn't derivable from anything
 * this function already reads, and guessing via `counterparty_user_id`
 * alone is ambiguous the moment the same two people have ever transferred
 * more than once. The balance and live/void status this function restores
 * are exactly what "Urungkan" promises; the cross-link staying severed is a
 * deliberate, narrow scope limit, not a bug — I12/I18
 * (src/lib/db/reconcile.ts) stay green either way (an unlinked row is
 * simply excluded from both checks, never flagged).
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

/**
 * "Oke" on an Activity card — docs/09 §14, docs/03 §9.3's action table:
 * "Tandai sudah dilihat → acknowledged_at terisi; lencana hilang." Owner-only
 * (`ownedBy`) — the RECEIVER acknowledging their own incoming row, never the
 * sender. A single UPDATE is already atomic on its own, but every mutation
 * in this module runs inside `dbWrite.transaction(...)` for the same reason
 * `archiveHousehold`/`updateHousehold` do (src/lib/services/households.ts):
 * one consistent shape to read, regardless of statement count.
 */
export async function acknowledgeTransaction(userId: string, transactionId: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const result = await tx
      .update(transactions)
      .set({ acknowledgedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(transactions.id, transactionId), ownedBy(transactions, userId)));

    if (result.rowCount === 0) {
      throw new NotFoundError('Transaksi tidak ditemukan');
    }
  });
}

/**
 * "Pindahkan" on an Activity card — docs/03 §9.3's action table: "Pindahkan
 * ke dompet lain → Edit biasa atas transaksinya sendiri; entry berpindah
 * dompet." Moves ONLY which of the RECEIVER'S OWN wallets this incoming
 * entry posts against — `amount`, `note`, `transactionDate`,
 * `counterparty_user_id`, and the link are all untouched.
 *
 * NOT routed through src/lib/services/transactions.ts's `updateTransaction`
 * — that function refuses `type: 'transfer'` rows outright and requires a
 * `categoryId`, neither of which applies to a transfer's `category_id = NULL`
 * shape (`tx_category_rule`). Same {void old entry, reversal, new entry}
 * dance as `updateTransaction`'s own — see that function's file-level doc
 * comment for why the old+reversal pair gets `voided_at` set together
 * (keeps I1's `wallets.balance = SUM(live entries)` exact throughout).
 *
 * The destination only needs to be the receiver's own active wallet — NOT
 * re-checked against §4.3's eligibility predicate, because that predicate
 * governs where an incoming transfer may be RECORDED FROM SOMEONE ELSE'S
 * side, not what a person may do with their OWN money afterward.
 */
export async function moveMemberTransferWallet(
  userId: string,
  transactionId: string,
  newWalletId: string,
): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: transactions.id,
        type: transactions.type,
        counterpartyUserId: transactions.counterpartyUserId,
      })
      .from(transactions)
      .where(
        and(eq(transactions.id, transactionId), ownedBy(transactions, userId), isNull(transactions.voidedAt)),
      )
      .limit(1);
    // `counterpartyUserId === null` rules out a self-transfer — moving ONE
    // of its two entries independently isn't a well-formed operation (which
    // of the two would it be?); self-transfers aren't editable at all
    // (tasks/08-transfers-self/spec.md).
    if (!existing || existing.type !== 'transfer' || existing.counterpartyUserId === null) {
      throw new NotFoundError('Transfer tidak ditemukan');
    }

    await assertWalletOwnedAndActive(tx, userId, newWalletId, 'toWalletId');

    const oldEntries = await tx
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.transactionId, transactionId), isNull(ledgerEntries.voidedAt)));
    const oldEntry = oldEntries[0];
    // A member transfer's own side always has exactly one live entry — see
    // this file's header. Nothing to move if it's somehow already gone.
    if (!oldEntry) return;

    const now = new Date();
    const [reversal] = await postEntries(tx, [
      {
        userId: oldEntry.userId,
        walletId: oldEntry.walletId,
        amount: -oldEntry.amount,
        source: 'transaction',
        entryDate: now,
        transactionId,
      },
    ]);

    await tx
      .update(ledgerEntries)
      .set({ voidedAt: now })
      .where(inArray(ledgerEntries.id, [oldEntry.id, reversal!.id]));

    await postEntries(tx, [
      {
        userId,
        walletId: newWalletId,
        amount: oldEntry.amount,
        source: 'transaction',
        entryDate: now,
        transactionId,
      },
    ]);

    await tx
      .update(transactions)
      .set({ updatedAt: now })
      .where(and(eq(transactions.id, transactionId), ownedBy(transactions, userId)));
  });
}
