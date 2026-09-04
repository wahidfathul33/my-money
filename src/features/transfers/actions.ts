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
import { createMemberTransfer, createSelfTransfer, unvoidTransfer, voidTransfer } from '@/lib/services/transfers';
import { deserializeMoney } from '@/lib/finance/money';
import { AppError, ValidationError } from '@/lib/api/errors';
import { createMemberTransferSchema, createSelfTransferSchema, transferIdSchema } from './schema';

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

/**
 * Records a transfer to a household member — thin adapter only, same shape
 * as `createSelfTransferAction`: `requireUser()`, parse, delegate to
 * `createMemberTransfer` (src/lib/services/transfers.ts, which does every
 * REAL check — both users' membership, the destination wallet's eligibility
 * — INSIDE its own `dbWrite.transaction()`), revalidate.
 *
 * `WalletNotEligibleError`'s message (already names the counterparty — see
 * that error class's own doc comment) flows straight through `toActionError`
 * like every other domain error here.
 */
export async function createMemberTransferAction(input: unknown): Promise<TransferActionResult> {
  const user = await requireUser();

  const parsed = createMemberTransferSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  let transactionId: string;
  try {
    const row = await createMemberTransfer(user.id, {
      householdId: parsed.data.householdId,
      fromWalletId: parsed.data.fromWalletId,
      counterpartyUserId: parsed.data.counterpartyUserId,
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
  // The receiver's Activity badge count changes too — their NEXT request
  // recomputes it regardless (docs/03 §9.3: "penerima melihatnya saat
  // memuat halaman", no real-time push in v1), so nothing receiver-specific
  // needs revalidating from the SENDER's own request here.
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
