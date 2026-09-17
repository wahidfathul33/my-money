'use server';

/**
 * Settings Server Actions. `requireUser()` first, parse with Zod, delegate
 * to src/lib/services/settings.ts, revalidate — same shape as every other
 * feature's actions.ts.
 */
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { signOut } from '@/lib/auth';
import { deleteAccount, updateProfile, updateUserPreferences } from '@/lib/services/settings';
import { AppError, OwnerBlockedDeletionError, ValidationError } from '@/lib/api/errors';
import { deleteAccountSchema, updatePreferencesSchema, updateProfileSchema } from './schema';

export interface ActionState {
  error: string | null;
}

const OK: ActionState = { error: null };

/** Same mapping every other feature's actions.ts uses — docs/08-copywriting.md §5.7. */
function toActionError(err: unknown): ActionState {
  if (err instanceof ValidationError) {
    return { error: Object.values(err.fields)[0]?.[0] ?? 'Validasi gagal' };
  }
  if (err instanceof AppError) {
    return { error: err.message };
  }
  throw err;
}

/**
 * Toggling `count_receivables_as_asset` changes the net worth figure itself
 * (ADR-010); changing `timezone` changes every date-grouped view in the app
 * (transaction history, budgets, obligations, net worth trend) since they
 * all read this same `users.timezone` column — per docs/06-api-contracts.md
 * §10's rule that any net-worth/date-grouping-changing mutation revalidates
 * broadly, this revalidates every page whose numbers or groupings could
 * shift, not just this settings screen.
 */
export async function updatePreferencesAction(input: {
  countReceivablesAsAsset: boolean;
  timezone: string;
  defaultWalletId: string | null;
}): Promise<ActionState> {
  const user = await requireUser();
  const parsed = updatePreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    await updateUserPreferences(user.id, parsed.data);
  } catch (err) {
    return toActionError(err);
  }

  revalidatePath('/', 'layout');
  return OK;
}

export async function updateProfileAction(input: { name: string }): Promise<ActionState> {
  const user = await requireUser();
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    await updateProfile(user.id, parsed.data);
  } catch (err) {
    return toActionError(err);
  }

  revalidatePath('/', 'layout');
  return OK;
}

export interface DeleteAccountResult extends ActionState {
  /** Set when `deleteAccount` refused because the caller is still `owner`
   * of an active household — lets the dialog show the SAME named,
   * link-bearing message the dedicated blocked-state screen shows, in case
   * ownership changed between page load and submit. */
  blockedByHousehold?: { id: string; name: string } | null;
}

/**
 * Immediate, permanent deletion — no confirmation beyond the caller having
 * already typed their own email (checked here, never trusted from a hidden
 * field). On success, revokes the session server-side and redirects to
 * `/signin` exactly like `signOutAction` — there is no account left to stay
 * signed into.
 */
export async function deleteAccountAction(input: { confirmEmail: string }): Promise<DeleteAccountResult> {
  const user = await requireUser();
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  if (parsed.data.confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    return { error: 'Email tidak cocok' };
  }

  try {
    await deleteAccount(user.id);
  } catch (err) {
    if (err instanceof OwnerBlockedDeletionError) {
      return {
        error: err.message,
        blockedByHousehold: { id: err.householdId, name: err.householdName },
      };
    }
    return toActionError(err);
  }

  await signOut({ redirectTo: '/signin' });
  return OK;
}
