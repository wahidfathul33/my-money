'use server';

/**
 * Server Actions for the household feature. `requireUser()` first in every
 * one, per docs/12-security-and-auth.md §3 — `proxy.ts` doesn't protect
 * Server Actions, only pages. Each action then delegates to
 * src/lib/services/households.ts, which re-verifies membership/ownership
 * again inside its own `dbWrite.transaction(...)` via `requireHouseholdMember`
 * — that's what actually stops a forged householdId; this layer just fails
 * fast and cheaply before opening a connection.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { archiveHousehold, createHousehold, updateHousehold } from '@/lib/services/households';
import { requireUser } from '@/lib/auth/require-user';
import { createHouseholdSchema, householdIdSchema, updateHouseholdSchema } from './schema';
import { OK, toActionError, type ActionState } from './action-state';

export type { ActionState };

/**
 * Creates the household and redirects straight into it — tasks/10 spec.md
 * verification flow: "buat household → switcher muncul → berpindah
 * konteks". `redirect()` throws its own control-flow error; it must stay
 * outside the try/catch below or it would be swallowed as a generic bug.
 */
export async function createHouseholdAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = createHouseholdSchema.safeParse({
    name: formData.get('name'),
    timezone: formData.get('timezone'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  let household;
  try {
    household = await createHousehold(user.id, parsed.data);
  } catch (err) {
    return toActionError(err);
  }

  // `('/', 'layout')` — not just `('/household')` — because the household
  // list drives the nav shell itself (context switcher, the "Keluarga"/"Buat
  // keluarga" entry — src/app/(app)/layout.tsx fetches it once per render),
  // which is shared across every route in the app, not only `/household/**`.
  revalidatePath('/', 'layout');
  redirect(`/household/${household.id}`);
}

export async function updateHouseholdAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = updateHouseholdSchema.safeParse({
    householdId: formData.get('householdId'),
    name: formData.get('name'),
    timezone: formData.get('timezone'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    await updateHousehold(user.id, parsed.data.householdId, {
      name: parsed.data.name,
      timezone: parsed.data.timezone,
    });
  } catch (err) {
    return toActionError(err);
  }

  // The switcher shows the household's name too — see createHouseholdAction's
  // comment on why this isn't scoped to just the household's own paths.
  revalidatePath('/', 'layout');
  return OK;
}

/** Direct-argument action (no form fields beyond the id) — same shape as
 * src/features/wallets/actions.ts's `archiveWalletAction`, called straight
 * from the confirmation dialog's button handler. */
export async function archiveHouseholdAction(householdId: string): Promise<ActionState> {
  const user = await requireUser();

  const parsed = householdIdSchema.safeParse({ householdId });
  if (!parsed.success) {
    return { error: 'ID keluarga tidak valid' };
  }

  try {
    await archiveHousehold(user.id, parsed.data.householdId);
  } catch (err) {
    return toActionError(err);
  }

  // Archiving removes it from the switcher/nav entirely — same
  // whole-app-shell reasoning as createHouseholdAction.
  revalidatePath('/', 'layout');
  return OK;
}
