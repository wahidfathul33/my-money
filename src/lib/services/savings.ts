/**
 * Savings goals service — dbWrite transactions live here, per
 * docs/11-tech-architecture.md §3 (only src/lib/services/** may import
 * `@/lib/db/write`). ADR-026 / docs/03-domain-model.md §10: there is
 * exactly ONE contribution mode, and it always moves real money —
 * `savings_contributions.ledger_entry_id NOT NULL` makes double counting
 * structurally impossible, not just discouraged by convention.
 *
 * A contribution is a real transfer OUT of the contributor's own wallet
 * (docs/03 §1.3 rule: only ONE narrow, named exception lets anyone write a
 * ledger entry into a wallet they don't own — member transfers — and this
 * isn't it). Structurally, `contribute`/`withdraw` are closest in shape to
 * src/lib/services/transfers.ts's `createSelfTransfer`: one
 * `dbWrite.transaction()`, a real signed `ledger_entries` row via
 * `postEntries`, and the wallet's owner is always the caller. The
 * "destination" here just isn't another wallet — it's a `savings_goals.
 * current_amount` cache, updated with the same "SQL-side `col = col + delta`,
 * never read-modify-write in application code" discipline `postEntries`
 * itself uses for `wallets.balance` (see this module's `applyAmountDelta`).
 *
 * No `transactions` row is written for a contribution/withdrawal at all —
 * unlike income/expense/transfer, savings entries are linked back to their
 * goal via `ledger_entries.source` (`savings_contribution` /
 * `savings_withdrawal`) + `source_id = savings_goals.id`, the same
 * polymorphic-id shape already reserved for debt payments, gold lots, etc.
 * (src/lib/db/schema/transactions.ts's `sourceId` comment).
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { savingsContributions, savingsGoals, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import { postEntries } from '@/lib/finance/ledger';
import type { Money } from '@/lib/finance/money';
import { requireHouseholdMember } from '@/lib/auth/require-household';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import type { TransactionClient } from '@/lib/db';

export type SavingsGoalRow = typeof savingsGoals.$inferSelect;
export type SavingsContributionRow = typeof savingsContributions.$inferSelect;

const CONTRIBUTION_IDEMPOTENCY_CONSTRAINT = 'sc_idempotency_uniq';

// Same generous window as src/lib/services/transactions.ts /
// src/lib/services/transfers.ts — absorbs client/server clock skew without
// resolving the caller's local "tomorrow" here.
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
    throw new ValidationError({ date: ['Tanggal tidak valid'] });
  }
}

function assertGoalName(name: string): void {
  if (name.trim().length === 0) {
    throw new ValidationError({ name: ['Nama goal wajib diisi'] });
  }
}

/** Verifies the wallet belongs to `userId` AND is active — same guard shape
 * as src/lib/services/transfers.ts's `assertWalletOwnedAndActive`. Every
 * caller here passes the CONTRIBUTOR's/WITHDRAWER's own id, never a
 * household-mate's — a contribution always draws from, and a withdrawal
 * always pays into, the acting user's OWN wallet (docs/03 §10.2: "selalu
 * berasal dari dompet pribadi kontributor"; spec.md: "ke dompet sendiri"). */
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
 * Resolves access to a goal: a PERSONAL goal (`household_id IS NULL`) is
 * visible only to its creator; a SHARED goal is visible to any ACTIVE member
 * of its household — docs/03 §10.2. `NotFoundError` either way (never
 * `ForbiddenError`) so a guessed goal id can't be used to confirm it belongs
 * to someone else — same H2 reasoning as every other ownership check in this
 * codebase (docs/12-security-and-auth.md §3).
 */
async function assertGoalAccess(tx: TransactionClient, userId: string, goal: SavingsGoalRow): Promise<void> {
  if (goal.householdId === null) {
    if (goal.userId !== userId) {
      throw new NotFoundError('Goal tidak ditemukan');
    }
    return;
  }
  await requireHouseholdMember(tx, userId, goal.householdId);
}

async function fetchGoalOrThrow(tx: TransactionClient, goalId: string): Promise<SavingsGoalRow> {
  const [goal] = await tx.select().from(savingsGoals).where(eq(savingsGoals.id, goalId)).limit(1);
  if (!goal) {
    throw new NotFoundError('Goal tidak ditemukan');
  }
  return goal;
}

async function findContributionByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): Promise<SavingsContributionRow | undefined> {
  const [row] = await dbWrite
    .select()
    .from(savingsContributions)
    .where(and(eq(savingsContributions.userId, userId), eq(savingsContributions.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row;
}

/**
 * The `current_amount`/`status` UPDATE shared by `contribute` and
 * `withdraw` — one atomic SQL statement, no read-modify-write round trip
 * (same discipline `postEntries` uses for `wallets.balance`; see this
 * module's file header). `delta` is SIGNED: positive for a contribution,
 * negative for a withdrawal.
 *
 * `status` only ever auto-toggles between `active`/`completed` — an
 * `archived` goal is a deliberate, manually-set state (docs/03 §10.4) that
 * a contribution or withdrawal must never silently resurrect out of. A
 * withdrawal from an archived goal is still valid (spec.md's "Catatan":
 * archiving doesn't delete anyone's contributions, "dana itu tetap aset
 * pemiliknya sampai ditarik" — the money stays the owner's asset UNTIL
 * WITHDRAWN), so this CASE has to run for archived goals too; it just must
 * leave `archived` exactly as it found it.
 */
async function applyAmountDelta(tx: TransactionClient, goalId: string, delta: Money): Promise<void> {
  await tx
    .update(savingsGoals)
    .set({
      currentAmount: sql`${savingsGoals.currentAmount} + ${delta}`,
      status: sql`CASE
        WHEN ${savingsGoals.status} = 'archived' THEN ${savingsGoals.status}
        WHEN ${savingsGoals.currentAmount} + ${delta} >= ${savingsGoals.targetAmount} THEN 'completed'::savings_status
        ELSE 'active'::savings_status
      END`,
      updatedAt: new Date(),
    })
    .where(eq(savingsGoals.id, goalId));
}

export interface CreateGoalInput {
  name: string;
  /** Must be > 0 — matches `sg_target_positive`. */
  targetAmount: Money;
  /** `YYYY-MM-DD`, or `null` for no target date. */
  targetDate: string | null;
  /** `null` => personal goal. Set => shared goal, `household_id NOT NULL`. */
  householdId: string | null;
}

/**
 * Creates a personal or shared goal. A shared goal can be created by ANY
 * active member, not just the owner — docs/03 §10.2, spec.md acceptance
 * criteria. `requireHouseholdMember` is called INSIDE this transaction, not
 * before it opens — membership can be revoked at any moment (same pattern
 * every household-scoped write in this codebase follows,
 * src/lib/services/households.ts's file header).
 */
export async function createGoal(userId: string, input: CreateGoalInput): Promise<SavingsGoalRow> {
  assertGoalName(input.name);
  assertPositiveAmount(input.targetAmount);

  return dbWrite.transaction(async (tx) => {
    if (input.householdId !== null) {
      await requireHouseholdMember(tx, userId, input.householdId);
    }

    const [goal] = await tx
      .insert(savingsGoals)
      .values({
        id: uuidv7(),
        userId,
        householdId: input.householdId,
        name: input.name,
        targetAmount: input.targetAmount,
        targetDate: input.targetDate,
      })
      .returning();

    return goal!;
  });
}

export interface UpdateGoalInput {
  name: string;
  targetAmount: Money;
  targetDate: string | null;
}

/**
 * Renames/re-targets a goal. Access follows `assertGoalAccess` — for a
 * shared goal that means ANY active member, not just the owner: renaming or
 * re-targeting a shared goal is not one of ADR-025's four owner-gated
 * actions (invite, remove, rename/archive the HOUSEHOLD, transfer
 * ownership) — "Hanya empat aksi yang dibatasi peran ... Semuanya
 * menyangkut keanggotaan, bukan uang" — so by that same ADR it defaults to
 * both roles equally, the same way household budgets are editable by any
 * member (docs/03 §4.2's table).
 */
export async function updateGoal(userId: string, goalId: string, input: UpdateGoalInput): Promise<SavingsGoalRow> {
  assertGoalName(input.name);
  assertPositiveAmount(input.targetAmount);

  return dbWrite.transaction(async (tx) => {
    const goal = await fetchGoalOrThrow(tx, goalId);
    await assertGoalAccess(tx, userId, goal);

    const [updated] = await tx
      .update(savingsGoals)
      .set({
        name: input.name,
        targetAmount: input.targetAmount,
        targetDate: input.targetDate,
        updatedAt: new Date(),
      })
      .where(eq(savingsGoals.id, goalId))
      .returning();

    return updated!;
  });
}

/** Archives a goal — docs/03 §10.4: "Mengarsipkan goal bersama tidak
 * menghapus kontribusi siapa pun." Same access rule as `updateGoal`. Returns
 * the updated row (rather than `void`) so callers — namely the
 * `archiveGoalAction` Server Action — can revalidate a shared goal's
 * `/household/[id]/savings` path without a second read. */
export async function archiveGoal(userId: string, goalId: string): Promise<SavingsGoalRow> {
  return dbWrite.transaction(async (tx) => {
    const goal = await fetchGoalOrThrow(tx, goalId);
    await assertGoalAccess(tx, userId, goal);

    const [updated] = await tx
      .update(savingsGoals)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(savingsGoals.id, goalId))
      .returning();

    return updated!;
  });
}

export interface ContributeInput {
  /** MUST belong to the contributing user — never a household-mate's. */
  walletId: string;
  amount: Money;
  contributionDate: Date;
  note: string | null;
  idempotencyKey: string;
}

/**
 * Contributes to a goal — ADR-026's one and only mode. One
 * `dbWrite.transaction()`: a real `ledger_entries` row (via `postEntries`)
 * DECREASING the contributor's chosen wallet, a `savings_contributions` row
 * (that entry's id as `ledger_entry_id`, which the DB enforces `NOT NULL`)
 * INCREASING `current_amount`, and the goal's `status` re-derived from the
 * new total. `current_amount` never moves except alongside a real, signed
 * ledger entry — see this module's file header.
 *
 * Contributing to an `archived` goal is rejected (same "archived wallet
 * can't be used" defensive shape as transfers.ts) — an archived goal is
 * filed away, and accepting a fresh deposit into it doesn't make sense. A
 * `completed` goal still accepts more (over-funding isn't an error; nothing
 * in spec.md forbids saving past the target).
 */
export async function contribute(
  userId: string,
  goalId: string,
  input: ContributeInput,
): Promise<SavingsContributionRow> {
  assertPositiveAmount(input.amount);
  assertNotTooFarInFuture(input.contributionDate);

  try {
    return await dbWrite.transaction(async (tx) => {
      const goal = await fetchGoalOrThrow(tx, goalId);
      await assertGoalAccess(tx, userId, goal);
      if (goal.status === 'archived') {
        throw new ValidationError({ goalId: ['Goal ini sudah diarsipkan'] });
      }

      await assertWalletOwnedAndActive(tx, userId, input.walletId);

      const [entry] = await postEntries(tx, [
        {
          userId,
          walletId: input.walletId,
          amount: -input.amount, // money OUT of the contributor's wallet
          source: 'savings_contribution',
          entryDate: input.contributionDate,
          sourceId: goalId,
        },
      ]);

      const [contribution] = await tx
        .insert(savingsContributions)
        .values({
          id: uuidv7(),
          savingsGoalId: goalId,
          userId,
          walletId: input.walletId,
          ledgerEntryId: entry!.id,
          amount: input.amount, // positive = contribution
          contributionDate: input.contributionDate,
          note: input.note,
          idempotencyKey: input.idempotencyKey,
        })
        .returning();

      await applyAmountDelta(tx, goalId, input.amount);

      return contribution!;
    });
  } catch (err) {
    if (isUniqueViolation(err, CONTRIBUTION_IDEMPOTENCY_CONSTRAINT)) {
      const existing = await findContributionByIdempotencyKey(userId, input.idempotencyKey);
      if (existing) return existing;
    }
    throw err;
  }
}

export interface WithdrawInput {
  /** MUST belong to the withdrawing user — money always lands in THEIR OWN wallet. */
  walletId: string;
  amount: Money;
  withdrawalDate: Date;
  note: string | null;
  idempotencyKey: string;
}

/**
 * Withdraws from a goal — the reverse of `contribute`, with one extra rule
 * spec.md is explicit about: "Penarikan hanya atas kontribusi sendiri, ke
 * dompet sendiri" — a direct consequence of docs/03 rule 1.3 ("setiap orang
 * hanya menulis buku besarnya sendiri"). On a SHARED goal, a member can only
 * ever withdraw up to what THEY THEMSELVES have net-contributed
 * (`SUM(savings_contributions.amount)` for THIS user, THIS goal — contributions
 * positive, prior withdrawals already negative in the same column, so the
 * SUM is already net) — never a cent of anyone else's share, no matter their
 * household role.
 *
 * `SELECT ... FOR UPDATE` on the goal row (todo.md) is what makes that limit
 * airtight under concurrency: without it, two withdrawals racing on the same
 * goal could both read the same "available" figure and both succeed,
 * jointly over-drawing it. Locking the goal row serializes any two
 * operations that touch IT specifically, so the second call's read of
 * "available" only happens after the first has fully committed. (A
 * concurrent `contribute` racing in only ever RAISES what's available, so
 * `contribute` itself doesn't need this lock — see that function's own doc
 * comment.)
 */
export async function withdraw(
  userId: string,
  goalId: string,
  input: WithdrawInput,
): Promise<SavingsContributionRow> {
  assertPositiveAmount(input.amount);
  assertNotTooFarInFuture(input.withdrawalDate);

  try {
    return await dbWrite.transaction(async (tx) => {
      const [goal] = await tx.select().from(savingsGoals).where(eq(savingsGoals.id, goalId)).for('update');
      if (!goal) {
        throw new NotFoundError('Goal tidak ditemukan');
      }
      await assertGoalAccess(tx, userId, goal);

      const [row] = await tx
        .select({ netFunded: sql<string>`COALESCE(SUM(${savingsContributions.amount}), 0)` })
        .from(savingsContributions)
        .where(
          and(
            eq(savingsContributions.savingsGoalId, goalId),
            eq(savingsContributions.userId, userId),
            isNull(savingsContributions.voidedAt),
          ),
        );
      const available = BigInt(row?.netFunded ?? '0');
      if (input.amount > available) {
        throw new ValidationError({
          amount: ['Jumlah penarikan melebihi kontribusi Anda pada goal ini'],
        });
      }

      await assertWalletOwnedAndActive(tx, userId, input.walletId);

      const [entry] = await postEntries(tx, [
        {
          userId,
          walletId: input.walletId,
          amount: input.amount, // money IN to the withdrawer's wallet
          source: 'savings_withdrawal',
          entryDate: input.withdrawalDate,
          sourceId: goalId,
        },
      ]);

      const [withdrawal] = await tx
        .insert(savingsContributions)
        .values({
          id: uuidv7(),
          savingsGoalId: goalId,
          userId,
          walletId: input.walletId,
          ledgerEntryId: entry!.id,
          amount: -input.amount, // negative = withdrawal
          contributionDate: input.withdrawalDate,
          note: input.note,
          idempotencyKey: input.idempotencyKey,
        })
        .returning();

      await applyAmountDelta(tx, goalId, -input.amount);

      return withdrawal!;
    });
  } catch (err) {
    if (isUniqueViolation(err, CONTRIBUTION_IDEMPOTENCY_CONSTRAINT)) {
      const existing = await findContributionByIdempotencyKey(userId, input.idempotencyKey);
      if (existing) return existing;
    }
    throw err;
  }
}
