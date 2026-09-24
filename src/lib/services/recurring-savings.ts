/**
 * Recurring (auto) savings contributions service — dbWrite transactions live
 * here, per docs/11-tech-architecture.md §3. tasks/24-recurring-transactions/spec.md.
 *
 * Same ownership model and idempotency-without-one-giant-transaction
 * reasoning as src/lib/services/recurring-transactions.ts's file header —
 * read that first. The one difference here: materialization calls
 * `contribute()` (src/lib/services/savings.ts) instead of `createTransaction`
 * — ADR-026's one and only contribution mode, net-worth-neutral, no new
 * `transactions` row. A recurring contribution rule can target a SHARED
 * goal (the rule owner just needs to currently be an active member — same
 * `assertGoalAccess` rule `contribute()` itself enforces, re-verified INSIDE
 * that call at materialize time, never trusted from rule-creation time
 * alone).
 */
import { and, eq, lte } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { recurringSavingsContributions, savingsGoals, users, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import { requireHouseholdMember } from '@/lib/auth/require-household';
import { contribute } from './savings';
import { computeNextRunDate, localDateToNoonUtc, type RecurringFrequency } from '@/lib/date/recurring';
import { DEFAULT_TIMEZONE, toLocalDate } from '@/lib/date/timezone';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import type { Money } from '@/lib/finance/money';
import type { TransactionClient } from '@/lib/db';

export type RecurringSavingsContributionRow = typeof recurringSavingsContributions.$inferSelect;
type SavingsGoalRow = typeof savingsGoals.$inferSelect;

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

/** Same access rule src/lib/services/savings.ts's (unexported) `assertGoalAccess`
 * enforces — duplicated locally, same "each service defines its own tiny
 * guard" pattern already used throughout this codebase. */
async function assertGoalAccess(tx: TransactionClient, userId: string, goal: SavingsGoalRow): Promise<void> {
  if (goal.householdId === null) {
    if (goal.userId !== userId) {
      throw new NotFoundError('Target tidak ditemukan');
    }
    return;
  }
  await requireHouseholdMember(tx, userId, goal.householdId);
}

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

async function resolveUserTimezone(userId: string): Promise<string> {
  const [row] = await dbWrite.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.timezone ?? DEFAULT_TIMEZONE;
}

export interface CreateRecurringContributionInput {
  goalId: string;
  walletId: string;
  amount: Money;
  frequency: RecurringFrequency;
  /** `YYYY-MM-DD`. Also becomes the initial `next_run_date`. */
  startDate: string;
  endDate: string | null;
}

/** Shared by the cron's bulk pass and the synchronous "start_date is today"
 * first-occurrence path — see recurring-transactions.ts's `materializeOneDueRow`
 * for the identical idempotency reasoning. Never throws: an archived goal, a
 * deleted wallet, etc. are all caught here and reported `'failed'`. */
async function materializeOneDueRow(
  row: Pick<
    RecurringSavingsContributionRow,
    'id' | 'userId' | 'goalId' | 'walletId' | 'amount' | 'frequency' | 'endDate' | 'nextRunDate' | 'status'
  >,
  tz: string,
): Promise<'succeeded' | 'failed'> {
  try {
    await contribute(row.userId, row.goalId, {
      walletId: row.walletId,
      amount: row.amount,
      contributionDate: localDateToNoonUtc(row.nextRunDate, tz),
      note: null,
      idempotencyKey: `recurring-contrib:${row.id}:${row.nextRunDate}`,
    });
  } catch {
    return 'failed';
  }

  const nextRunDate = computeNextRunDate(row.nextRunDate, row.frequency as RecurringFrequency);
  const status = row.endDate !== null && nextRunDate > row.endDate ? 'ended' : row.status;

  await dbWrite
    .update(recurringSavingsContributions)
    .set({ nextRunDate, status, updatedAt: new Date() })
    .where(
      and(
        eq(recurringSavingsContributions.id, row.id),
        eq(recurringSavingsContributions.nextRunDate, row.nextRunDate),
      ),
    );

  return 'succeeded';
}

/**
 * Creates an auto-contribution rule. Goal access and wallet ownership/active
 * state are verified immediately — same checks `contribute()` itself
 * performs at materialize time — for an immediate, actionable error. If
 * `startDate` is TODAY in the caller's own local timezone, the first
 * contribution is materialized synchronously in this same request, same
 * "gaji hari ini" reasoning as recurring-transactions.ts.
 */
export async function createRecurringContribution(
  userId: string,
  input: CreateRecurringContributionInput,
): Promise<RecurringSavingsContributionRow> {
  assertPositiveAmount(input.amount);
  assertValidDateRange(input.startDate, input.endDate);

  const created = await dbWrite.transaction(async (tx) => {
    const [goal] = await tx.select().from(savingsGoals).where(eq(savingsGoals.id, input.goalId)).limit(1);
    if (!goal) {
      throw new NotFoundError('Target tidak ditemukan');
    }
    await assertGoalAccess(tx, userId, goal);
    if (goal.status === 'archived') {
      throw new ValidationError({ goalId: ['Target ini sudah diarsipkan'] });
    }
    await assertWalletOwnedAndActive(tx, userId, input.walletId);

    const [row] = await tx
      .insert(recurringSavingsContributions)
      .values({
        id: uuidv7(),
        userId,
        goalId: input.goalId,
        walletId: input.walletId,
        amount: input.amount,
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
      .from(recurringSavingsContributions)
      .where(eq(recurringSavingsContributions.id, created.id))
      .limit(1);
    return refreshed ?? created;
  }

  return created;
}

export async function pauseRecurringContribution(
  userId: string,
  id: string,
): Promise<RecurringSavingsContributionRow> {
  return dbWrite.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(recurringSavingsContributions)
      .where(and(eq(recurringSavingsContributions.id, id), ownedBy(recurringSavingsContributions, userId)))
      .limit(1);
    if (!existing) {
      throw new NotFoundError('Kontribusi rutin tidak ditemukan');
    }
    if (existing.status === 'ended') {
      throw new ValidationError({ status: ['Kontribusi rutin ini sudah berakhir'] });
    }

    const [updated] = await tx
      .update(recurringSavingsContributions)
      .set({ status: 'paused', updatedAt: new Date() })
      .where(eq(recurringSavingsContributions.id, id))
      .returning();
    return updated!;
  });
}

export async function resumeRecurringContribution(
  userId: string,
  id: string,
): Promise<RecurringSavingsContributionRow> {
  return dbWrite.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(recurringSavingsContributions)
      .where(and(eq(recurringSavingsContributions.id, id), ownedBy(recurringSavingsContributions, userId)))
      .limit(1);
    if (!existing) {
      throw new NotFoundError('Kontribusi rutin tidak ditemukan');
    }
    if (existing.status !== 'paused') {
      throw new ValidationError({ status: ['Hanya kontribusi rutin yang dijeda dapat dilanjutkan'] });
    }

    const [updated] = await tx
      .update(recurringSavingsContributions)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(recurringSavingsContributions.id, id))
      .returning();
    return updated!;
  });
}

export async function deleteRecurringContribution(userId: string, id: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: recurringSavingsContributions.id })
      .from(recurringSavingsContributions)
      .where(and(eq(recurringSavingsContributions.id, id), ownedBy(recurringSavingsContributions, userId)))
      .limit(1);
    if (!existing) {
      throw new NotFoundError('Kontribusi rutin tidak ditemukan');
    }
    await tx.delete(recurringSavingsContributions).where(eq(recurringSavingsContributions.id, id));
  });
}

export interface MaterializeContributionsResult {
  succeeded: number;
  failed: number;
}

/** The cron's bulk pass for auto-contributions — same per-timezone resolution
 * as `materializeRecurringTransactions`. */
export async function materializeRecurringContributions(
  now: Date = new Date(),
): Promise<MaterializeContributionsResult> {
  const timezones = await dbWrite.selectDistinct({ timezone: users.timezone }).from(users);

  let succeeded = 0;
  let failed = 0;

  for (const { timezone } of timezones) {
    const today = toLocalDate(now, timezone);

    const dueRows = await dbWrite
      .select({
        id: recurringSavingsContributions.id,
        userId: recurringSavingsContributions.userId,
        goalId: recurringSavingsContributions.goalId,
        walletId: recurringSavingsContributions.walletId,
        amount: recurringSavingsContributions.amount,
        frequency: recurringSavingsContributions.frequency,
        endDate: recurringSavingsContributions.endDate,
        nextRunDate: recurringSavingsContributions.nextRunDate,
        status: recurringSavingsContributions.status,
      })
      .from(recurringSavingsContributions)
      .innerJoin(users, eq(users.id, recurringSavingsContributions.userId))
      .where(
        and(
          eq(users.timezone, timezone),
          eq(recurringSavingsContributions.status, 'active'),
          lte(recurringSavingsContributions.nextRunDate, today),
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
