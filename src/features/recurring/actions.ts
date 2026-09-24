'use server';

/**
 * Recurring Server Actions — thin adapters only (docs/11-tech-architecture.md
 * §2/§3): `requireUser()` first, parse with Zod, delegate to
 * src/lib/services/recurring-transactions.ts / recurring-savings.ts,
 * revalidate. tasks/24-recurring-transactions/spec.md.
 */
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import {
  createRecurringTransaction,
  deleteRecurringTransaction,
  pauseRecurringTransaction,
  resumeRecurringTransaction,
} from '@/lib/services/recurring-transactions';
import {
  createRecurringContribution,
  deleteRecurringContribution,
  pauseRecurringContribution,
  resumeRecurringContribution,
} from '@/lib/services/recurring-savings';
import { deserializeMoney } from '@/lib/finance/money';
import { AppError, ValidationError } from '@/lib/api/errors';
import {
  createRecurringContributionSchema,
  createRecurringTransactionSchema,
  recurringContributionIdSchema,
  recurringTransactionIdSchema,
} from './schema';

export interface RecurringActionResult {
  error: string | null;
  id?: string;
}

/** Domain errors become a message the UI can show inline; anything else is a bug and propagates. */
function toActionError(err: unknown): RecurringActionResult {
  if (err instanceof ValidationError) {
    return { error: Object.values(err.fields)[0]?.[0] ?? 'Validasi gagal' };
  }
  if (err instanceof AppError) {
    return { error: err.message };
  }
  throw err;
}

/** Every route whose numbers a recurring rule's creation/pause/resume/delete
 * can change — a materialized occurrence touches a wallet balance (and,
 * for a contribution, a goal's current_amount) exactly like its manual
 * counterpart, so the same revalidation surface as
 * src/features/transactions/actions.ts / src/features/savings/actions.ts. */
function revalidateRecurring(): void {
  revalidatePath('/settings/recurring');
  revalidatePath('/');
  revalidatePath('/transactions');
  revalidatePath('/wallets');
  revalidatePath('/wealth/savings');
}

export async function createRecurringTransactionAction(input: unknown): Promise<RecurringActionResult> {
  const user = await requireUser();

  const parsed = createRecurringTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    const row = await createRecurringTransaction(user.id, {
      type: parsed.data.type,
      amount: deserializeMoney(parsed.data.amount),
      categoryId: parsed.data.categoryId,
      walletId: parsed.data.walletId,
      note: parsed.data.note,
      frequency: parsed.data.frequency,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      householdId: parsed.data.householdId,
    });
    revalidateRecurring();
    return { error: null, id: row.id };
  } catch (err) {
    return toActionError(err);
  }
}

export async function pauseRecurringTransactionAction(id: string): Promise<RecurringActionResult> {
  const user = await requireUser();
  const parsed = recurringTransactionIdSchema.safeParse({ id });
  if (!parsed.success) return { error: 'Transaksi rutin tidak valid' };

  try {
    await pauseRecurringTransaction(user.id, parsed.data.id);
  } catch (err) {
    return toActionError(err);
  }
  revalidateRecurring();
  return { error: null, id: parsed.data.id };
}

export async function resumeRecurringTransactionAction(id: string): Promise<RecurringActionResult> {
  const user = await requireUser();
  const parsed = recurringTransactionIdSchema.safeParse({ id });
  if (!parsed.success) return { error: 'Transaksi rutin tidak valid' };

  try {
    await resumeRecurringTransaction(user.id, parsed.data.id);
  } catch (err) {
    return toActionError(err);
  }
  revalidateRecurring();
  return { error: null, id: parsed.data.id };
}

export async function deleteRecurringTransactionAction(id: string): Promise<RecurringActionResult> {
  const user = await requireUser();
  const parsed = recurringTransactionIdSchema.safeParse({ id });
  if (!parsed.success) return { error: 'Transaksi rutin tidak valid' };

  try {
    await deleteRecurringTransaction(user.id, parsed.data.id);
  } catch (err) {
    return toActionError(err);
  }
  revalidateRecurring();
  return { error: null, id: parsed.data.id };
}

export async function createRecurringContributionAction(input: unknown): Promise<RecurringActionResult> {
  const user = await requireUser();

  const parsed = createRecurringContributionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    const row = await createRecurringContribution(user.id, {
      goalId: parsed.data.goalId,
      walletId: parsed.data.walletId,
      amount: deserializeMoney(parsed.data.amount),
      frequency: parsed.data.frequency,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    });
    revalidateRecurring();
    return { error: null, id: row.id };
  } catch (err) {
    return toActionError(err);
  }
}

export async function pauseRecurringContributionAction(id: string): Promise<RecurringActionResult> {
  const user = await requireUser();
  const parsed = recurringContributionIdSchema.safeParse({ id });
  if (!parsed.success) return { error: 'Kontribusi rutin tidak valid' };

  try {
    await pauseRecurringContribution(user.id, parsed.data.id);
  } catch (err) {
    return toActionError(err);
  }
  revalidateRecurring();
  return { error: null, id: parsed.data.id };
}

export async function resumeRecurringContributionAction(id: string): Promise<RecurringActionResult> {
  const user = await requireUser();
  const parsed = recurringContributionIdSchema.safeParse({ id });
  if (!parsed.success) return { error: 'Kontribusi rutin tidak valid' };

  try {
    await resumeRecurringContribution(user.id, parsed.data.id);
  } catch (err) {
    return toActionError(err);
  }
  revalidateRecurring();
  return { error: null, id: parsed.data.id };
}

export async function deleteRecurringContributionAction(id: string): Promise<RecurringActionResult> {
  const user = await requireUser();
  const parsed = recurringContributionIdSchema.safeParse({ id });
  if (!parsed.success) return { error: 'Kontribusi rutin tidak valid' };

  try {
    await deleteRecurringContribution(user.id, parsed.data.id);
  } catch (err) {
    return toActionError(err);
  }
  revalidateRecurring();
  return { error: null, id: parsed.data.id };
}
