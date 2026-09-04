'use server';

/**
 * Transfer Server Actions — thin adapters only
 * (docs/11-tech-architecture.md §2/§3): `requireUser()` first, parse with
 * Zod, delegate to src/lib/services/transfers.ts, revalidate. Mirrors
 * src/features/transactions/actions.ts's shape exactly; kept in its own
 * module because transfers are their own service (spec.md's file list).
 */
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { createSelfTransfer, unvoidTransfer, voidTransfer } from '@/lib/services/transfers';
import { deserializeMoney } from '@/lib/finance/money';
import { AppError, ValidationError } from '@/lib/api/errors';
import { createSelfTransferSchema, transferIdSchema } from './schema';

export interface TransferActionResult {
  error: string | null;
  transactionId?: string;
}

/** Domain errors become a message the sheet can show inline; anything else is a bug and propagates. */
function toActionError(err: unknown): TransferActionResult {
  if (err instanceof ValidationError) {
    return { error: Object.values(err.fields)[0]?.[0] ?? 'Validasi gagal' };
  }
  if (err instanceof AppError) {
    return { error: err.message };
  }
  throw err;
}

/** Every route whose numbers a recorded/voided transfer can change — same set as src/features/transactions/actions.ts. */
function revalidateTransfers(): void {
  revalidatePath('/');
  revalidatePath('/transactions');
  revalidatePath('/wallets');
}

export async function createSelfTransferAction(input: unknown): Promise<TransferActionResult> {
  const user = await requireUser();

  const parsed = createSelfTransferSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  let transactionId: string;
  try {
    const row = await createSelfTransfer(user.id, {
      fromWalletId: parsed.data.fromWalletId,
      toWalletId: parsed.data.toWalletId,
      amount: deserializeMoney(parsed.data.amount),
      transactionDate: parsed.data.transactionDate,
      note: parsed.data.note,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    transactionId = row.id;
  } catch (err) {
    return toActionError(err);
  }

  revalidateTransfers();
  return { error: null, transactionId };
}

export async function voidTransferAction(transactionId: string): Promise<TransferActionResult> {
  const user = await requireUser();
  const parsed = transferIdSchema.safeParse({ transactionId });
  if (!parsed.success) return { error: 'Transfer tidak valid' };

  try {
    await voidTransfer(user.id, parsed.data.transactionId);
  } catch (err) {
    return toActionError(err);
  }

  revalidateTransfers();
  return { error: null, transactionId: parsed.data.transactionId };
}

export async function unvoidTransferAction(transactionId: string): Promise<TransferActionResult> {
  const user = await requireUser();
  const parsed = transferIdSchema.safeParse({ transactionId });
  if (!parsed.success) return { error: 'Transfer tidak valid' };

  try {
    await unvoidTransfer(user.id, parsed.data.transactionId);
  } catch (err) {
    return toActionError(err);
  }

  revalidateTransfers();
  return { error: null, transactionId: parsed.data.transactionId };
}
