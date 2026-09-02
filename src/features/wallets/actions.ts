'use server';

/**
 * Server Actions for the wallets feature. `requireUser()` first in every
 * one, per docs/12-security-and-auth.md §3 — `proxy.ts` doesn't protect
 * Server Actions, only pages. Each action then delegates to
 * src/lib/services/wallets.ts, which re-verifies ownership again inside its
 * own `dbWrite.transaction(...)` — belt and suspenders, not redundant: the
 * transaction-level check is what actually stops a forged wallet id, this
 * one just fails fast and cheaply before opening a connection.
 */
import { revalidatePath } from 'next/cache';
import {
  adjustWalletBalance,
  archiveWallet,
  createWallet,
  deleteWallet,
  reorderWallets,
  restoreWallet,
  setDefaultWallet,
  updateWallet,
} from '@/lib/services/wallets';
import { requireUser } from '@/lib/auth/require-user';
import { fromRupiah } from '@/lib/finance/money';
import { AppError, ValidationError } from '@/lib/api/errors';
import {
  adjustWalletBalanceSchema,
  createWalletSchema,
  reorderWalletsSchema,
  updateWalletSchema,
  walletIdSchema,
} from './schema';

export interface ActionState {
  error: string | null;
}

const OK: ActionState = { error: null };

/**
 * Turns a thrown domain error into a message safe to show the user, per
 * docs/08-copywriting.md §5.7 ("jangan pernah menampilkan pesan teknis").
 * `ValidationError`'s field messages are already user-facing copy written
 * at the throw site (src/lib/services/wallets.ts); anything else that isn't
 * an `AppError` at all is a genuine bug and re-thrown to the error boundary.
 */
function toActionError(err: unknown): ActionState {
  if (err instanceof ValidationError) {
    return { error: Object.values(err.fields)[0]?.[0] ?? 'Validasi gagal' };
  }
  if (err instanceof AppError) {
    return { error: err.message };
  }
  throw err;
}

function revalidateWallets(walletId?: string) {
  revalidatePath('/wallets');
  revalidatePath('/'); // Dashboard shows wallet balances (task 04 placeholder).
  if (walletId) revalidatePath(`/wallets/${walletId}`);
}

export async function createWalletAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = createWalletSchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type'),
    openingBalance: (formData.get('openingBalance') as string | null) || '0',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  let openingBalance: bigint;
  try {
    openingBalance = fromRupiah(parsed.data.openingBalance);
  } catch {
    return { error: 'Saldo awal tidak valid' };
  }

  try {
    await createWallet(user.id, {
      name: parsed.data.name,
      type: parsed.data.type,
      openingBalance,
    });
  } catch (err) {
    return toActionError(err);
  }

  revalidateWallets();
  return OK;
}

export async function updateWalletAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = updateWalletSchema.safeParse({
    walletId: formData.get('walletId'),
    name: formData.get('name'),
    icon: formData.get('icon'),
    color: formData.get('color'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    await updateWallet(user.id, parsed.data.walletId, {
      name: parsed.data.name,
      icon: parsed.data.icon,
      color: parsed.data.color,
    });
  } catch (err) {
    return toActionError(err);
  }
  revalidateWallets(parsed.data.walletId);
  return OK;
}

export async function adjustWalletBalanceAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = adjustWalletBalanceSchema.safeParse({
    walletId: formData.get('walletId'),
    actualBalance: formData.get('actualBalance'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  let actualBalance: bigint;
  try {
    actualBalance = fromRupiah(parsed.data.actualBalance);
  } catch {
    return { error: 'Saldo tidak valid' };
  }

  try {
    await adjustWalletBalance(user.id, parsed.data.walletId, actualBalance);
  } catch (err) {
    return toActionError(err);
  }

  revalidateWallets(parsed.data.walletId);
  return OK;
}

/** Plain (non-form) actions — triggered by buttons, not forms. */

export async function archiveWalletAction(walletId: string): Promise<ActionState> {
  const user = await requireUser();
  const parsed = walletIdSchema.safeParse({ walletId });
  if (!parsed.success) return { error: 'ID dompet tidak valid' };

  try {
    await archiveWallet(user.id, parsed.data.walletId);
  } catch (err) {
    return toActionError(err);
  }
  revalidateWallets(parsed.data.walletId);
  return OK;
}

export async function restoreWalletAction(walletId: string): Promise<ActionState> {
  const user = await requireUser();
  const parsed = walletIdSchema.safeParse({ walletId });
  if (!parsed.success) return { error: 'ID dompet tidak valid' };

  try {
    await restoreWallet(user.id, parsed.data.walletId);
  } catch (err) {
    return toActionError(err);
  }
  revalidateWallets(parsed.data.walletId);
  return OK;
}

export async function deleteWalletAction(walletId: string): Promise<ActionState> {
  const user = await requireUser();
  const parsed = walletIdSchema.safeParse({ walletId });
  if (!parsed.success) return { error: 'ID dompet tidak valid' };

  try {
    await deleteWallet(user.id, parsed.data.walletId);
  } catch (err) {
    return toActionError(err);
  }

  revalidateWallets();
  return OK;
}

export async function setDefaultWalletAction(walletId: string): Promise<ActionState> {
  const user = await requireUser();
  const parsed = walletIdSchema.safeParse({ walletId });
  if (!parsed.success) return { error: 'ID dompet tidak valid' };

  try {
    await setDefaultWallet(user.id, parsed.data.walletId);
  } catch (err) {
    return toActionError(err);
  }

  revalidateWallets(parsed.data.walletId);
  return OK;
}

export async function reorderWalletsAction(orderedIds: string[]): Promise<ActionState> {
  const user = await requireUser();
  const parsed = reorderWalletsSchema.safeParse({ orderedIds });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Urutan tidak valid' };
  }

  try {
    await reorderWallets(user.id, parsed.data.orderedIds);
  } catch (err) {
    return toActionError(err);
  }
  revalidateWallets();
  return OK;
}
