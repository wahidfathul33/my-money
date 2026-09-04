'use server';

/**
 * Activity Server Actions — thin adapters only (docs/11-tech-architecture.md
 * §2/§3): `requireUser()` first, parse with Zod, delegate to
 * src/lib/services/transfers.ts, revalidate. Mirrors
 * src/features/transfers/actions.ts's shape exactly.
 *
 * "Hapus" on an Activity card is deliberately NOT a new action here — it's
 * `voidTransferAction` (src/features/transfers/actions.ts), unchanged.
 * docs/03-domain-model.md §9.3's action table calls it explicitly: "Hapus →
 * Void sisi miliknya; tautan dilepas" — an ORDINARY void of a transaction
 * the caller owns, same function whether reached from `/transactions` or
 * `/activity`. Components here import it directly from that module instead
 * of a redundant wrapper.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/require-user';
import { acknowledgeTransaction, moveMemberTransferWallet } from '@/lib/services/transfers';
import { AppError, ValidationError } from '@/lib/api/errors';

export interface ActivityActionResult {
  error: string | null;
}

const OK: ActivityActionResult = { error: null };

function toActionError(err: unknown): ActivityActionResult {
  if (err instanceof ValidationError) {
    return { error: Object.values(err.fields)[0]?.[0] ?? 'Validasi gagal' };
  }
  if (err instanceof AppError) {
    return { error: err.message };
  }
  throw err;
}

const transactionIdSchema = z.uuid('Transaksi tidak valid');

/** Every route the Activity badge count or list can appear on. */
function revalidateActivity(): void {
  revalidatePath('/activity');
  revalidatePath('/', 'layout'); // the badge itself lives in the nav shell (context switcher + "Lainnya")
}

/** "Oke" — spec.md: "acknowledged_at terisi; lencana berkurang." */
export async function acknowledgeTransactionAction(transactionId: string): Promise<ActivityActionResult> {
  const user = await requireUser();
  const parsed = transactionIdSchema.safeParse(transactionId);
  if (!parsed.success) return { error: 'Transaksi tidak valid' };

  try {
    await acknowledgeTransaction(user.id, parsed.data);
  } catch (err) {
    return toActionError(err);
  }

  revalidateActivity();
  return OK;
}

const moveSchema = z.object({
  transactionId: z.uuid('Transaksi tidak valid'),
  walletId: z.uuid('Dompet tidak valid'),
});

/** "Pindahkan" — spec.md: "memindahkan entry ke dompet lain milik penerima — edit biasa." */
export async function moveMemberTransferWalletAction(input: unknown): Promise<ActivityActionResult> {
  const user = await requireUser();
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    await moveMemberTransferWallet(user.id, parsed.data.transactionId, parsed.data.walletId);
  } catch (err) {
    return toActionError(err);
  }

  revalidateActivity();
  revalidatePath('/wallets');
  return OK;
}
