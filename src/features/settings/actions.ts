'use server';

/**
 * Settings Server Actions. `requireUser()` first, parse with Zod, delegate
 * to src/lib/services/settings.ts, revalidate — same shape as every other
 * feature's actions.ts.
 */
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { updateUserPreferences } from '@/lib/services/settings';
import { AppError, ValidationError } from '@/lib/api/errors';
import { updatePreferencesSchema } from './schema';

export interface ActionState {
  error: string | null;
}

const OK: ActionState = { error: null };

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
 * Toggling `count_receivables_as_asset` changes the net worth figure
 * itself (ADR-010), so — per docs/06-api-contracts.md §10's rule that any
 * net-worth-changing mutation always revalidates `/` and
 * `/wealth/net-worth` — those two paths are included alongside `/wealth`
 * (the hub's own receivables separator line) and this settings page.
 */
export async function updatePreferencesAction(input: { countReceivablesAsAsset: boolean }): Promise<ActionState> {
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

  revalidatePath('/');
  revalidatePath('/wealth');
  revalidatePath('/wealth/net-worth');
  revalidatePath('/settings/preferences');
  return OK;
}
