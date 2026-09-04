'use server';

/**
 * Transaction Server Actions — thin adapters only
 * (docs/11-tech-architecture.md §2/§3): `requireUser()` first, parse with
 * Zod, delegate to src/lib/services/transactions.ts, revalidate.
 *
 * Unlike the wallets/categories actions (bound to `useActionState` + a
 * native `<form action>`), these take a plain object, not `FormData` — the
 * Add Transaction sheet has no native form (a custom keypad replaces the
 * amount `<input>` entirely, per tasks/07 spec.md), so its client component
 * calls these directly inside `useTransition`, the same pattern
 * src/features/wallets/components/wallet-detail-actions.tsx already uses
 * for its single-argument button actions. The parameter is still typed
 * `unknown` and run through `.safeParse` here — a direct call from a client
 * component is not a trusted boundary, it's just a POST body shaped like an
 * object instead of `FormData`.
 */
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import {
  createTransaction,
  unvoidTransaction,
  updateTransaction,
  voidTransaction,
} from '@/lib/services/transactions';
import { deserializeMoney } from '@/lib/finance/money';
import { AppError, ValidationError } from '@/lib/api/errors';
import { createTransactionSchema, transactionIdSchema, updateTransactionSchema } from './schema';

export interface TransactionActionResult {
  error: string | null;
  transactionId?: string;
}

/** Domain errors become a message the sheet can show inline; anything else is a bug and propagates. */
function toActionError(err: unknown): TransactionActionResult {
  if (err instanceof ValidationError) {
    return { error: Object.values(err.fields)[0]?.[0] ?? 'Validasi gagal' };
  }
  if (err instanceof AppError) {
    return { error: err.message };
  }
  throw err;
}

/** Every route whose numbers a recorded/edited/voided transaction can change. */
function revalidateTransactions(): void {
  revalidatePath('/');
  revalidatePath('/transactions');
  revalidatePath('/wallets');
}

export async function createTransactionAction(input: unknown): Promise<TransactionActionResult> {
  const user = await requireUser();

  const parsed = createTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  let transactionId: string;
  try {
    const row = await createTransaction(user.id, {
      type: parsed.data.type,
      amount: deserializeMoney(parsed.data.amount),
      categoryId: parsed.data.categoryId,
      walletId: parsed.data.walletId,
      transactionDate: parsed.data.transactionDate,
      note: parsed.data.note,
      idempotencyKey: parsed.data.idempotencyKey,
      householdId: parsed.data.householdId,
    });
    transactionId = row.id;
  } catch (err) {
    return toActionError(err);
  }

  revalidateTransactions();
  return { error: null, transactionId };
}

export async function updateTransactionAction(input: unknown): Promise<TransactionActionResult> {
  const user = await requireUser();

  const parsed = updateTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    await updateTransaction(user.id, parsed.data.transactionId, {
      type: parsed.data.type,
      amount: deserializeMoney(parsed.data.amount),
      categoryId: parsed.data.categoryId,
      walletId: parsed.data.walletId,
      transactionDate: parsed.data.transactionDate,
      note: parsed.data.note,
      householdId: parsed.data.householdId,
    });
  } catch (err) {
    return toActionError(err);
  }

  revalidateTransactions();
  return { error: null, transactionId: parsed.data.transactionId };
}

export async function voidTransactionAction(transactionId: string): Promise<TransactionActionResult> {
  const user = await requireUser();
  const parsed = transactionIdSchema.safeParse({ transactionId });
  if (!parsed.success) return { error: 'Transaksi tidak valid' };

  try {
    await voidTransaction(user.id, parsed.data.transactionId);
  } catch (err) {
    return toActionError(err);
  }

  revalidateTransactions();
  return { error: null, transactionId: parsed.data.transactionId };
}

export async function unvoidTransactionAction(transactionId: string): Promise<TransactionActionResult> {
  const user = await requireUser();
  const parsed = transactionIdSchema.safeParse({ transactionId });
  if (!parsed.success) return { error: 'Transaksi tidak valid' };

  try {
    await unvoidTransaction(user.id, parsed.data.transactionId);
  } catch (err) {
    return toActionError(err);
  }

  revalidateTransactions();
  return { error: null, transactionId: parsed.data.transactionId };
}
