/**
 * Debts & receivables service — dbWrite transactions live here, per
 * docs/11-tech-architecture.md §3. tasks/18-debts-receivables.
 *
 * Debts and receivables are STRUCTURAL MIRRORS with the ledger sign flipped
 * (docs/03-domain-model.md §12's table):
 *
 *   creating a debt        -> wallet UP   if affectsWallet (money came IN)
 *   creating a receivable  -> wallet DOWN if affectsWallet (money went OUT)
 *   paying a debt          -> wallet DOWN + remaining DOWN
 *   paying a receivable    -> wallet UP   + remaining DOWN   (remaining
 *                              always shrinks toward zero either way — only
 *                              the WALLET side's sign flips between kinds)
 *
 * Every exported function below (`createDebt`/`createReceivable`,
 * `updateDebt`/`updateReceivable`, `recordDebtPayment`/
 * `recordReceivablePayment`, `voidDebtPayment`/`voidReceivablePayment`,
 * `writeOffDebt`/`writeOffReceivable`) is a thin, fully-concrete wrapper
 * around a SHARED `*Core` function that owns the transaction, the row lock,
 * and every validation/ledger-posting decision. The two tables genuinely
 * cannot share a single Drizzle query builder call across their full column
 * sets (creditor_name vs debtor_name, plus TypeScript's generic inference
 * over `pgTable` doesn't unify two distinct table objects), so the split is:
 * the *Core* functions operate through a narrow STRUCTURAL type
 * (`ObligationTable`, below — same technique src/lib/services/sharing.ts's
 * `ExcludableTable` already uses for `setExcludeFromHousehold`) covering
 * every column both tables share, while each kind's own thin wrapper
 * supplies a small callback that does the one concrete INSERT/UPDATE
 * statement (with its kind-specific name column) inside the SAME
 * transaction the core opened. This keeps the actual business logic —
 * locking, the overpayment guard, the written-off guard, sign selection,
 * ledger posting — written exactly ONCE instead of twice-and-drifting.
 *
 * `affects_wallet` (docs/03 §12, spec.md): not every debt involves cash
 * changing hands — a friend buying something for you creates a debt you
 * never touched cash for. Every write path below checks `affectsWallet`
 * before ever calling `postEntries`; when false, creation/update touch only
 * the debts/receivables row, never the ledger.
 *
 * `recordDebtPayment`/`recordReceivablePayment` are this task's
 * highest-stakes functions — docs/05-financial-integrity.md §7's exact
 * "SELECT ... FOR UPDATE, then validate against the locked read, then
 * write, all in one transaction" shape, mirroring
 * src/lib/services/savings.ts's `withdraw` (its own doc comment explains
 * WHY the lock is what makes the ceiling airtight under concurrency — two
 * racing payments must never both read the same "remaining" and both
 * succeed).
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { debtPayments, debts, receivablePayments, receivables } from '@/lib/db/schema/obligations';
import { households, householdMembers } from '@/lib/db/schema/households';
import { wallets } from '@/lib/db/schema/wallets';
import { entrySourceEnum } from '@/lib/db/schema/enums';
import { ownedBy } from '@/lib/db/scoped';
import { postEntries } from '@/lib/finance/ledger';
import type { Money } from '@/lib/finance/money';
import type { ObligationStatus } from '@/lib/finance/obligation';
import { NotFoundError, OverpaymentError, ValidationError } from '@/lib/api/errors';
import type { TransactionClient } from '@/lib/db';

/** Not exported from src/lib/db/schema/enums.ts or src/lib/finance/ledger.ts
 * (the latter keeps its own local alias, unexported) — derived the same way here. */
type EntrySource = (typeof entrySourceEnum.enumValues)[number];

export type DebtRow = typeof debts.$inferSelect;
export type ReceivableRow = typeof receivables.$inferSelect;
export type DebtPaymentRow = typeof debtPayments.$inferSelect;
export type ReceivablePaymentRow = typeof receivablePayments.$inferSelect;

const DP_IDEMPOTENCY_CONSTRAINT = 'dp_idempotency_uniq';
const RP_IDEMPOTENCY_CONSTRAINT = 'rp_idempotency_uniq';

/** True when `err` is a Postgres unique-violation (23505) on `constraintName`
 * — docs/05 §6. Duplicated locally rather than imported: every service file
 * with an idempotent write defines its own copy (src/lib/services/savings.ts,
 * transactions.ts, transfers.ts, invitations.ts) — established convention
 * in this codebase, not an oversight. */
function isUniqueViolation(err: unknown, constraintName: string): boolean {
  const pgErr = err as { code?: string; constraint?: string; cause?: unknown } | null;
  if (!pgErr || typeof pgErr !== 'object') return false;
  if (pgErr.code === '23505' && pgErr.constraint === constraintName) return true;
  return pgErr.cause !== undefined && isUniqueViolation(pgErr.cause, constraintName);
}

function assertPositiveAmount(amount: Money): void {
  if (amount <= 0n) {
    throw new ValidationError({ initialAmount: ['Nominal harus lebih dari Rp0'] });
  }
}

/** Pure shape check duplicated defensively at the service layer — the
 * primary enforcement is Zod's `dueDateSchema` at the Server Action boundary
 * (docs/06-api-contracts.md §8's split), but this function is also called
 * directly by integration tests exercising the service without going
 * through a Server Action, so the rule holds either way. */
function assertDueDateNotBeforeStart(startDate: string, dueDate: string | null): void {
  if (dueDate !== null && dueDate < startDate) {
    throw new ValidationError({ dueDate: ['Jatuh tempo tidak boleh sebelum tanggal mulai'] });
  }
}

/** `YYYY-MM-DD` -> UTC-midnight `Date`, for feeding `postEntries`'
 * `entryDate` from a DATE-typed column value. Same technique as
 * src/lib/finance/savings.ts's private `toUtcMidnight` — sidesteps
 * local-timezone drift entirely since there's no partial-day component to
 * round either direction. */
function dateStrToInstant(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** Same guard shape as src/lib/services/savings.ts's/transfers.ts's
 * `assertWalletOwnedAndActive` (duplicated locally per that same
 * established convention). */
async function assertWalletOwnedAndActive(tx: TransactionClient, userId: string, walletId: string): Promise<void> {
  const [wallet] = await tx
    .select({ id: wallets.id, isArchived: wallets.isArchived })
    .from(wallets)
    .where(and(eq(wallets.id, walletId), ownedBy(wallets, userId)))
    .limit(1);

  if (!wallet) {
    throw new ValidationError({ walletId: ['Dompet tidak ditemukan'] });
  }
  if (wallet.isArchived) {
    throw new ValidationError({ walletId: ['Dompet yang diarsipkan tidak bisa dipakai'] });
  }
}

/**
 * `counterparty_user_id` may only be set to someone who is a fellow ACTIVE
 * member of at least one of the caller's own non-archived households —
 * spec.md: "`counterparty_user_id` dapat diisi bila lawannya sesama anggota
 * household." Checked INSIDE the write transaction, not before it opens —
 * membership can be revoked at any moment (same reasoning
 * `requireHouseholdMember` documents for every other household-scoped
 * write in this codebase).
 */
async function assertEligibleCounterparty(
  tx: TransactionClient,
  userId: string,
  counterpartyUserId: string,
): Promise<void> {
  if (counterpartyUserId === userId) {
    throw new ValidationError({ counterpartyUserId: ['Tidak dapat memilih diri sendiri'] });
  }

  const [row] = await tx
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(
      and(
        eq(householdMembers.userId, counterpartyUserId),
        eq(householdMembers.status, 'active'),
        eq(households.isArchived, false),
        sql`${households.id} IN (
          SELECT household_id FROM household_members
          WHERE user_id = ${userId} AND status = 'active'
        )`,
      ),
    )
    .limit(1);

  if (!row) {
    throw new ValidationError({
      counterpartyUserId: ['Pengguna ini bukan sesama anggota keluarga Anda'],
    });
  }
}

// ---------------------------------------------------------------------------
// Shared structural types — the seam that lets create/update/pay/void/
// write-off be written ONCE against either `debts` or `receivables`. See
// this module's file header and src/lib/services/sharing.ts's
// `ExcludableTable` for the precedent this mirrors.
// ---------------------------------------------------------------------------

type ObligationTable = PgTable & {
  id: PgColumn;
  userId: PgColumn;
  initialAmount: PgColumn;
  remainingAmount: PgColumn;
  status: PgColumn;
  affectsWallet: PgColumn;
  walletId: PgColumn;
};

type ObligationPaymentsTable = PgTable & {
  voidedAt: PgColumn;
};

interface LockedObligation {
  id: string;
  initialAmount: Money;
  remainingAmount: Money;
  status: ObligationStatus;
  affectsWallet: boolean;
  walletId: string | null;
}

/**
 * `SELECT ... FOR UPDATE` on one debt/receivable row, scoped to its owner —
 * docs/05-financial-integrity.md §7. `NotFoundError` (never `ForbiddenError`)
 * whether the row doesn't exist or belongs to someone else — docs/12
 * §3's H2.
 */
async function lockObligation(
  tx: TransactionClient,
  table: ObligationTable,
  userId: string,
  obligationId: string,
  notFoundMessage: string,
): Promise<LockedObligation> {
  const [row] = await tx
    .select({
      id: table.id,
      initialAmount: table.initialAmount,
      remainingAmount: table.remainingAmount,
      status: table.status,
      affectsWallet: table.affectsWallet,
      walletId: table.walletId,
    })
    .from(table)
    .where(and(eq(table.id, obligationId), ownedBy(table, userId)))
    .for('update');

  if (!row) {
    throw new NotFoundError(notFoundMessage);
  }
  // The explicit projection above ties each field's runtime value to the
  // REAL column (bigint/enum/boolean/uuid) even though `table`'s STATIC
  // type only exposes bare `PgColumn`s — see `ObligationTable`'s doc
  // comment. This cast reflects that projection, not a runtime guess.
  return row as unknown as LockedObligation;
}

/**
 * `remaining_amount += delta` (SQL-side relative update, never
 * read-modify-write — same discipline `postEntries` uses for
 * `wallets.balance` and src/lib/services/savings.ts's `applyAmountDelta`
 * uses for `current_amount`) with `status` re-derived from the NEW
 * remaining value in the SAME statement. `delta` is NEGATIVE for a payment
 * (remaining shrinks) and POSITIVE for voiding one (remaining is restored) —
 * identical for debts and receivables, since only the WALLET side's sign
 * differs between the two kinds (this module's file header).
 *
 * `written_off` is preserved regardless of the arithmetic — same
 * "terminal manual state survives an amount delta" shape
 * `applyAmountDelta`'s CASE uses to protect `archived`. A written-off
 * obligation's `remaining_amount` is deliberately left as whatever it was
 * at the moment of write-off (see `writeOffCore`'s doc comment) rather than
 * zeroed, so this guard is what keeps a later void-of-an-old-payment from
 * silently resurrecting it to `active`/`partially_paid`.
 */
async function applyRemainingDelta(
  tx: TransactionClient,
  table: ObligationTable,
  obligationId: string,
  delta: Money,
): Promise<void> {
  await tx
    .update(table)
    .set({
      remainingAmount: sql`${table.remainingAmount} + ${delta}`,
      status: sql`CASE
        WHEN ${table.status} = 'written_off' THEN ${table.status}
        WHEN ${table.remainingAmount} + ${delta} <= 0 THEN 'paid'::obligation_status
        WHEN ${table.remainingAmount} + ${delta} >= ${table.initialAmount} THEN 'active'::obligation_status
        ELSE 'partially_paid'::obligation_status
      END`,
      updatedAt: new Date(),
    })
    .where(eq(table.id, obligationId));
}

async function countLivePayments(
  tx: TransactionClient,
  paymentsTable: ObligationPaymentsTable,
  parentIdColumn: PgColumn,
  obligationId: string,
): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(paymentsTable)
    .where(and(eq(parentIdColumn, obligationId), isNull(paymentsTable.voidedAt)));
  return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

interface CreateObligationCoreInput {
  counterpartyUserId: string | null;
  initialAmount: Money;
  startDate: string;
  dueDate: string | null;
  affectsWallet: boolean;
  walletId: string | null;
}

async function createObligationCore<T extends { id: string }>(
  userId: string,
  input: CreateObligationCoreInput,
  cfg: {
    disbursementSign: bigint;
    disbursementSource: EntrySource;
    insertRow: (tx: TransactionClient, id: string) => Promise<T>;
  },
): Promise<T> {
  assertPositiveAmount(input.initialAmount);
  assertDueDateNotBeforeStart(input.startDate, input.dueDate);
  if (input.affectsWallet && !input.walletId) {
    throw new ValidationError({ walletId: ['Dompet wajib dipilih bila memengaruhi saldo'] });
  }

  return dbWrite.transaction(async (tx) => {
    if (input.affectsWallet) {
      await assertWalletOwnedAndActive(tx, userId, input.walletId!);
    }
    if (input.counterpartyUserId !== null) {
      await assertEligibleCounterparty(tx, userId, input.counterpartyUserId);
    }

    const id = uuidv7();
    const row = await cfg.insertRow(tx, id);

    // Not every debt/receivable involves cash changing hands (spec.md's
    // `affects_wallet`) — forcing a ledger entry regardless would fabricate
    // a wallet balance that never actually moved.
    if (input.affectsWallet) {
      await postEntries(tx, [
        {
          userId,
          walletId: input.walletId!,
          amount: cfg.disbursementSign * input.initialAmount,
          source: cfg.disbursementSource,
          entryDate: dateStrToInstant(input.startDate),
          sourceId: id,
        },
      ]);
    }

    return row;
  });
}

export interface CreateDebtInput {
  creditorName: string;
  counterpartyUserId: string | null;
  initialAmount: Money;
  startDate: string;
  dueDate: string | null;
  affectsWallet: boolean;
  walletId: string | null;
  note: string | null;
}

/** Creating a debt moves the wallet UP when `affectsWallet` — "saya
 * meminjam", cash comes in (docs/03 §12's table). */
export async function createDebt(userId: string, input: CreateDebtInput): Promise<DebtRow> {
  return createObligationCore(userId, input, {
    disbursementSign: 1n,
    disbursementSource: 'debt_disbursement',
    insertRow: async (tx, id) => {
      const [row] = await tx
        .insert(debts)
        .values({
          id,
          userId,
          creditorName: input.creditorName,
          counterpartyUserId: input.counterpartyUserId,
          initialAmount: input.initialAmount,
          remainingAmount: input.initialAmount,
          startDate: input.startDate,
          dueDate: input.dueDate,
          affectsWallet: input.affectsWallet,
          walletId: input.affectsWallet ? input.walletId : null,
          note: input.note,
        })
        .returning();
      return row!;
    },
  });
}

export interface CreateReceivableInput {
  debtorName: string;
  counterpartyUserId: string | null;
  initialAmount: Money;
  startDate: string;
  dueDate: string | null;
  affectsWallet: boolean;
  walletId: string | null;
  note: string | null;
}

/** Creating a receivable moves the wallet DOWN when `affectsWallet` —
 * "orang lain meminjam dari saya", cash goes out (docs/03 §12's table). */
export async function createReceivable(userId: string, input: CreateReceivableInput): Promise<ReceivableRow> {
  return createObligationCore(userId, input, {
    disbursementSign: -1n,
    disbursementSource: 'receivable_disbursement',
    insertRow: async (tx, id) => {
      const [row] = await tx
        .insert(receivables)
        .values({
          id,
          userId,
          debtorName: input.debtorName,
          counterpartyUserId: input.counterpartyUserId,
          initialAmount: input.initialAmount,
          remainingAmount: input.initialAmount,
          startDate: input.startDate,
          dueDate: input.dueDate,
          affectsWallet: input.affectsWallet,
          walletId: input.affectsWallet ? input.walletId : null,
          note: input.note,
        })
        .returning();
      return row!;
    },
  });
}

// ---------------------------------------------------------------------------
// Update — "hanya bila belum ada pembayaran" (todo.md). Once a single
// payment has landed, the whole edit action is unavailable; before that,
// every field (including `initialAmount`, which is the one that needs care —
// see below) may be corrected.
// ---------------------------------------------------------------------------

interface UpdateObligationCoreCfg<T> {
  table: ObligationTable;
  paymentsTable: ObligationPaymentsTable;
  parentIdColumn: PgColumn;
  notFoundMessage: string;
  newInitialAmount: Money;
  dueDate: string | null;
  disbursementSign: bigint;
  disbursementSource: EntrySource;
  updateRow: (tx: TransactionClient, newRemainingAmount: Money) => Promise<T>;
}

/**
 * Locks the row, refuses the edit if any live payment already exists, then
 * — ONLY if `initialAmount` actually changed AND `affectsWallet` is true —
 * posts a CORRECTING ledger entry for the delta (same disbursement source,
 * same sign convention as creation) so the wallet balance stays truthful
 * instead of silently drifting from the row's new figure. With zero
 * payments, `remaining_amount` was exactly equal to the OLD
 * `initial_amount`, so shifting it by the same delta always lands it on the
 * NEW `initial_amount` exactly — never a separate calculation to keep in
 * sync with `applyRemainingDelta`'s.
 *
 * `affectsWallet`/`walletId` themselves are deliberately NOT editable here —
 * flipping `affectsWallet` after a disbursement entry may already have been
 * posted (or not) is a materially different, riskier operation (it would
 * mean VOIDING or FABRICATING an entry, not just adjusting one) that neither
 * spec.md nor todo.md asks for; same "locked after creation" precedent as
 * `wallets.type` (src/lib/services/wallets.ts).
 */
async function updateObligationCore<T>(userId: string, obligationId: string, cfg: UpdateObligationCoreCfg<T>): Promise<T> {
  assertPositiveAmount(cfg.newInitialAmount);

  return dbWrite.transaction(async (tx) => {
    const obligation = await lockObligation(tx, cfg.table, userId, obligationId, cfg.notFoundMessage);

    // No `assertDueDateNotBeforeStart` re-check here, unlike create: update
    // never changes `startDate` (see `UpdateDebtInput`'s absence of the
    // field, and src/features/obligations/schema.ts's doc comment on why
    // the update Zod schemas omit it too), so there is nothing to compare a
    // new `dueDate` against — `LockedObligation`'s projection deliberately
    // doesn't fetch `startDate` just to re-run a check whose outcome can no
    // longer change what's stored. A `dueDate` edited to predate the
    // original (unrelated, immutable) `startDate` is a display nit, never a
    // financial-correctness one.

    const liveCount = await countLivePayments(tx, cfg.paymentsTable, cfg.parentIdColumn, obligationId);
    if (liveCount > 0) {
      throw new ValidationError({
        initialAmount: ['Tidak dapat diubah setelah ada pembayaran tercatat'],
      });
    }

    const delta = cfg.newInitialAmount - obligation.initialAmount;
    const newRemainingAmount = obligation.remainingAmount + delta;

    if (delta !== 0n && obligation.affectsWallet) {
      await postEntries(tx, [
        {
          userId,
          walletId: obligation.walletId!,
          amount: cfg.disbursementSign * delta,
          source: cfg.disbursementSource,
          entryDate: new Date(),
          sourceId: obligationId,
        },
      ]);
    }

    return cfg.updateRow(tx, newRemainingAmount);
  });
}

export interface UpdateDebtInput {
  creditorName: string;
  counterpartyUserId: string | null;
  initialAmount: Money;
  dueDate: string | null;
  note: string | null;
}

export async function updateDebt(userId: string, debtId: string, input: UpdateDebtInput): Promise<DebtRow> {
  return updateObligationCore(userId, debtId, {
    table: debts,
    paymentsTable: debtPayments,
    parentIdColumn: debtPayments.debtId,
    notFoundMessage: 'Hutang tidak ditemukan',
    newInitialAmount: input.initialAmount,
    dueDate: input.dueDate,
    disbursementSign: 1n,
    disbursementSource: 'debt_disbursement',
    updateRow: async (tx, newRemainingAmount) => {
      const [row] = await tx
        .update(debts)
        .set({
          creditorName: input.creditorName,
          counterpartyUserId: input.counterpartyUserId,
          initialAmount: input.initialAmount,
          remainingAmount: newRemainingAmount,
          dueDate: input.dueDate,
          note: input.note,
          updatedAt: new Date(),
        })
        .where(eq(debts.id, debtId))
        .returning();
      return row!;
    },
  });
}

export interface UpdateReceivableInput {
  debtorName: string;
  counterpartyUserId: string | null;
  initialAmount: Money;
  dueDate: string | null;
  note: string | null;
}

export async function updateReceivable(
  userId: string,
  receivableId: string,
  input: UpdateReceivableInput,
): Promise<ReceivableRow> {
  return updateObligationCore(userId, receivableId, {
    table: receivables,
    paymentsTable: receivablePayments,
    parentIdColumn: receivablePayments.receivableId,
    notFoundMessage: 'Piutang tidak ditemukan',
    newInitialAmount: input.initialAmount,
    dueDate: input.dueDate,
    disbursementSign: -1n,
    disbursementSource: 'receivable_disbursement',
    updateRow: async (tx, newRemainingAmount) => {
      const [row] = await tx
        .update(receivables)
        .set({
          debtorName: input.debtorName,
          counterpartyUserId: input.counterpartyUserId,
          initialAmount: input.initialAmount,
          remainingAmount: newRemainingAmount,
          dueDate: input.dueDate,
          note: input.note,
          updatedAt: new Date(),
        })
        .where(eq(receivables.id, receivableId))
        .returning();
      return row!;
    },
  });
}

// ---------------------------------------------------------------------------
// Record payment — the crux of this task's correctness.
// ---------------------------------------------------------------------------

export interface RecordPaymentInput {
  amount: Money;
  walletId: string;
  paymentDate: string;
  note: string | null;
  idempotencyKey: string;
}

interface RecordPaymentCoreCfg<T> {
  table: ObligationTable;
  notFoundMessage: string;
  writtenOffMessage: string;
  overpaymentKind: 'hutang' | 'piutang';
  paymentSign: bigint;
  paymentSource: EntrySource;
  idempotencyConstraint: string;
  findByIdempotencyKey: () => Promise<T | undefined>;
  insertPayment: (tx: TransactionClient, id: string, ledgerEntryId: string) => Promise<T>;
}

/**
 * `SELECT ... FOR UPDATE` -> validate against the LOCKED read -> write,
 * entirely inside one transaction — docs/05-financial-integrity.md §7,
 * docs/06-api-contracts.md §8. Two payments racing on the same obligation
 * serialize on this lock: the second one's read of `remainingAmount` only
 * happens after the first has fully committed its own delta, so the
 * overpayment ceiling holds even under concurrency (never two reads of the
 * same stale "remaining" both succeeding).
 *
 * A `written_off` obligation rejects ANY further payment explicitly — its
 * `remaining_amount` is deliberately left non-zero at write-off time (see
 * `writeOffCore`), so the overpayment check alone would NOT catch this case
 * the way it naturally catches an already-`paid` one (remaining = 0, so any
 * positive amount already exceeds it).
 */
async function recordPaymentCore<T extends { id: string }>(
  userId: string,
  obligationId: string,
  input: RecordPaymentInput,
  cfg: RecordPaymentCoreCfg<T>,
): Promise<T> {
  assertPositiveAmount(input.amount);

  try {
    return await dbWrite.transaction(async (tx) => {
      const obligation = await lockObligation(tx, cfg.table, userId, obligationId, cfg.notFoundMessage);

      if (obligation.status === 'written_off') {
        throw new ValidationError({ amount: [cfg.writtenOffMessage] });
      }
      if (input.amount > obligation.remainingAmount) {
        throw new OverpaymentError(obligation.remainingAmount, cfg.overpaymentKind);
      }

      await assertWalletOwnedAndActive(tx, userId, input.walletId);

      const [entry] = await postEntries(tx, [
        {
          userId,
          walletId: input.walletId,
          amount: cfg.paymentSign * input.amount,
          source: cfg.paymentSource,
          entryDate: dateStrToInstant(input.paymentDate),
          sourceId: obligationId,
        },
      ]);

      const payment = await cfg.insertPayment(tx, uuidv7(), entry!.id);

      await applyRemainingDelta(tx, cfg.table, obligationId, -input.amount);

      return payment;
    });
  } catch (err) {
    if (isUniqueViolation(err, cfg.idempotencyConstraint)) {
      const existing = await cfg.findByIdempotencyKey();
      if (existing) return existing;
    }
    throw err;
  }
}

async function findDebtPaymentByIdempotencyKey(userId: string, idempotencyKey: string): Promise<DebtPaymentRow | undefined> {
  const [row] = await dbWrite
    .select()
    .from(debtPayments)
    .where(and(eq(debtPayments.userId, userId), eq(debtPayments.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row;
}

/** Paying a debt moves the wallet DOWN — cash leaves to settle it. */
export async function recordDebtPayment(userId: string, debtId: string, input: RecordPaymentInput): Promise<DebtPaymentRow> {
  return recordPaymentCore(userId, debtId, input, {
    table: debts,
    notFoundMessage: 'Hutang tidak ditemukan',
    writtenOffMessage: 'Hutang ini sudah dihapuskan, tidak dapat menerima pembayaran lagi',
    overpaymentKind: 'hutang',
    paymentSign: -1n,
    paymentSource: 'debt_payment',
    idempotencyConstraint: DP_IDEMPOTENCY_CONSTRAINT,
    findByIdempotencyKey: () => findDebtPaymentByIdempotencyKey(userId, input.idempotencyKey),
    insertPayment: async (tx, id, ledgerEntryId) => {
      const [row] = await tx
        .insert(debtPayments)
        .values({
          id,
          debtId,
          userId,
          walletId: input.walletId,
          ledgerEntryId,
          amount: input.amount,
          paymentDate: input.paymentDate,
          note: input.note,
          idempotencyKey: input.idempotencyKey,
        })
        .returning();
      return row!;
    },
  });
}

async function findReceivablePaymentByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): Promise<ReceivablePaymentRow | undefined> {
  const [row] = await dbWrite
    .select()
    .from(receivablePayments)
    .where(and(eq(receivablePayments.userId, userId), eq(receivablePayments.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row;
}

/** Paying a receivable moves the wallet UP — cash comes back in. */
export async function recordReceivablePayment(
  userId: string,
  receivableId: string,
  input: RecordPaymentInput,
): Promise<ReceivablePaymentRow> {
  return recordPaymentCore(userId, receivableId, input, {
    table: receivables,
    notFoundMessage: 'Piutang tidak ditemukan',
    writtenOffMessage: 'Piutang ini sudah dihapuskan, tidak dapat menerima pembayaran lagi',
    overpaymentKind: 'piutang',
    paymentSign: 1n,
    paymentSource: 'receivable_payment',
    idempotencyConstraint: RP_IDEMPOTENCY_CONSTRAINT,
    findByIdempotencyKey: () => findReceivablePaymentByIdempotencyKey(userId, input.idempotencyKey),
    insertPayment: async (tx, id, ledgerEntryId) => {
      const [row] = await tx
        .insert(receivablePayments)
        .values({
          id,
          receivableId,
          userId,
          walletId: input.walletId,
          ledgerEntryId,
          amount: input.amount,
          paymentDate: input.paymentDate,
          note: input.note,
          idempotencyKey: input.idempotencyKey,
        })
        .returning();
      return row!;
    },
  });
}

// ---------------------------------------------------------------------------
// Void payment — reversing entry + voided_at, never a hard delete (docs/05
// §8: "Ledger entry | Tidak | voided_at, tidak pernah DELETE"). Same shape
// as src/lib/services/transactions.ts's `voidTransaction`: the ORIGINAL
// ledger entry is left exactly as it was; a fresh, opposite-signed entry is
// posted instead, so the ledger keeps a complete, honest history of both
// the payment AND its reversal rather than pretending the payment never
// happened.
// ---------------------------------------------------------------------------

interface VoidablePayment {
  id: string;
  amount: Money;
  walletId: string;
}

interface VoidPaymentCoreCfg {
  table: ObligationTable;
  notFoundMessage: string;
  paymentNotFoundMessage: string;
  paymentSign: bigint;
  paymentSource: EntrySource;
  fetchPayment: (tx: TransactionClient) => Promise<VoidablePayment | undefined>;
  markVoided: (tx: TransactionClient) => Promise<void>;
}

async function voidPaymentCore(userId: string, obligationId: string, cfg: VoidPaymentCoreCfg): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    // Locking the PARENT row (rather than the payment row) is what
    // serializes a void against a concurrent new payment on the SAME
    // obligation — both mutate `remaining_amount` via `applyRemainingDelta`,
    // so both must take this same lock first.
    await lockObligation(tx, cfg.table, userId, obligationId, cfg.notFoundMessage);

    const payment = await cfg.fetchPayment(tx);
    if (!payment) {
      throw new NotFoundError(cfg.paymentNotFoundMessage);
    }

    await postEntries(tx, [
      {
        userId,
        walletId: payment.walletId,
        amount: -(cfg.paymentSign * payment.amount), // exact opposite of the original entry
        source: cfg.paymentSource,
        entryDate: new Date(),
        sourceId: obligationId,
      },
    ]);

    await cfg.markVoided(tx);
    await applyRemainingDelta(tx, cfg.table, obligationId, payment.amount); // restore what this payment had reduced
  });
}

export async function voidDebtPayment(userId: string, debtId: string, paymentId: string): Promise<void> {
  return voidPaymentCore(userId, debtId, {
    table: debts,
    notFoundMessage: 'Hutang tidak ditemukan',
    paymentNotFoundMessage: 'Pembayaran tidak ditemukan',
    paymentSign: -1n,
    paymentSource: 'debt_payment',
    fetchPayment: async (tx) => {
      const [row] = await tx
        .select({ id: debtPayments.id, amount: debtPayments.amount, walletId: debtPayments.walletId })
        .from(debtPayments)
        .where(
          and(
            eq(debtPayments.id, paymentId),
            eq(debtPayments.debtId, debtId),
            ownedBy(debtPayments, userId),
            isNull(debtPayments.voidedAt),
          ),
        )
        .limit(1);
      return row;
    },
    markVoided: async (tx) => {
      await tx.update(debtPayments).set({ voidedAt: new Date() }).where(eq(debtPayments.id, paymentId));
    },
  });
}

export async function voidReceivablePayment(userId: string, receivableId: string, paymentId: string): Promise<void> {
  return voidPaymentCore(userId, receivableId, {
    table: receivables,
    notFoundMessage: 'Piutang tidak ditemukan',
    paymentNotFoundMessage: 'Pembayaran tidak ditemukan',
    paymentSign: 1n,
    paymentSource: 'receivable_payment',
    fetchPayment: async (tx) => {
      const [row] = await tx
        .select({ id: receivablePayments.id, amount: receivablePayments.amount, walletId: receivablePayments.walletId })
        .from(receivablePayments)
        .where(
          and(
            eq(receivablePayments.id, paymentId),
            eq(receivablePayments.receivableId, receivableId),
            ownedBy(receivablePayments, userId),
            isNull(receivablePayments.voidedAt),
          ),
        )
        .limit(1);
      return row;
    },
    markVoided: async (tx) => {
      await tx.update(receivablePayments).set({ voidedAt: new Date() }).where(eq(receivablePayments.id, paymentId));
    },
  });
}

// ---------------------------------------------------------------------------
// Write off — status only, no ledger entry, no wallet movement. Writing off
// means giving up on collecting/paying, not a real cash movement (contrast
// with a payment, which always is) — spec.md's "Batasan": the ONLY things a
// payment path is allowed to touch are the ledger + remaining_amount, and
// write-off is deliberately NOT a payment path.
//
// `remaining_amount` is left EXACTLY as it was at the moment of write-off,
// never zeroed. Net worth impact (spec.md: "written_off tersedia ...
// (mengubah net worth)") comes entirely from the STATUS filter every net
// worth / total query applies (`status NOT IN ('paid','written_off')` —
// todo.md's `getTotalDebt`/`getTotalReceivable`), not from mutating the
// amount. This keeps write-off a pure status flip — auditable, reversible
// in spirit (the original figure is still visible on the row), and free of
// the "what if a payment is voided after write-off" edge case a zeroed
// `remaining_amount` would otherwise raise (see `applyRemainingDelta`'s
// `written_off`-preserving CASE branch).
// ---------------------------------------------------------------------------

interface WriteOffCoreCfg<T> {
  table: ObligationTable;
  notFoundMessage: string;
  alreadyPaidMessage: string;
  alreadyWrittenOffMessage: string;
  updateRow: (tx: TransactionClient) => Promise<T>;
}

async function writeOffCore<T>(userId: string, obligationId: string, cfg: WriteOffCoreCfg<T>): Promise<T> {
  return dbWrite.transaction(async (tx) => {
    const obligation = await lockObligation(tx, cfg.table, userId, obligationId, cfg.notFoundMessage);

    if (obligation.status === 'paid') {
      throw new ValidationError({ status: [cfg.alreadyPaidMessage] });
    }
    if (obligation.status === 'written_off') {
      throw new ValidationError({ status: [cfg.alreadyWrittenOffMessage] });
    }

    return cfg.updateRow(tx);
  });
}

export async function writeOffDebt(userId: string, debtId: string): Promise<DebtRow> {
  return writeOffCore(userId, debtId, {
    table: debts,
    notFoundMessage: 'Hutang tidak ditemukan',
    alreadyPaidMessage: 'Hutang yang sudah lunas tidak perlu dihapuskan',
    alreadyWrittenOffMessage: 'Hutang ini sudah dihapuskan sebelumnya',
    updateRow: async (tx) => {
      const [row] = await tx
        .update(debts)
        .set({ status: 'written_off', updatedAt: new Date() })
        .where(eq(debts.id, debtId))
        .returning();
      return row!;
    },
  });
}

export async function writeOffReceivable(userId: string, receivableId: string): Promise<ReceivableRow> {
  return writeOffCore(userId, receivableId, {
    table: receivables,
    notFoundMessage: 'Piutang tidak ditemukan',
    alreadyPaidMessage: 'Piutang yang sudah lunas tidak perlu dihapuskan',
    alreadyWrittenOffMessage: 'Piutang ini sudah dihapuskan sebelumnya',
    updateRow: async (tx) => {
      const [row] = await tx
        .update(receivables)
        .set({ status: 'written_off', updatedAt: new Date() })
        .where(eq(receivables.id, receivableId))
        .returning();
      return row!;
    },
  });
}
