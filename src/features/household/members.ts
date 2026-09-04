'use server';

/**
 * Server Actions for household membership lifecycle — remove, leave,
 * transfer ownership. Same layering as src/features/household/invitations.ts:
 * `requireUser()` first, then delegate to src/lib/services/memberships.ts,
 * which re-verifies role/ownership inside its own `dbWrite.transaction(...)`.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { leaveHousehold, removeMember, transferOwnership } from '@/lib/services/memberships';
import { leaveHouseholdSchema, removeMemberSchema, transferOwnershipSchema } from './schema';
import { OK, toActionError, type ActionState } from './action-state';

export async function removeMemberAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = removeMemberSchema.safeParse({
    householdId: formData.get('householdId'),
    userId: formData.get('userId'),
    tagChoice: formData.get('tagChoice'),
  });
  if (!parsed.success) {
    return { error: 'Data tidak valid' };
  }

  try {
    await removeMember(user.id, parsed.data.householdId, parsed.data.userId, parsed.data.tagChoice);
  } catch (err) {
    return toActionError(err);
  }

  revalidatePath(`/household/${parsed.data.householdId}/members`);
  return OK;
}

/**
 * On success, redirects to `/` — the leaving user no longer has an active
 * membership, so `/household/[id]` (guarded by `requireHouseholdAccess`,
 * src/lib/services/households.ts) would 404 them immediately if we left
 * them there. Same "land somewhere that still makes sense" reasoning as
 * `archiveHouseholdAction` redirecting to `/household`
 * (src/features/household/actions.ts).
 */
export async function leaveHouseholdAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = leaveHouseholdSchema.safeParse({
    householdId: formData.get('householdId'),
    tagChoice: formData.get('tagChoice'),
  });
  if (!parsed.success) {
    return { error: 'Data tidak valid' };
  }

  try {
    await leaveHousehold(user.id, parsed.data.householdId, parsed.data.tagChoice);
  } catch (err) {
    return toActionError(err);
  }

  revalidatePath('/', 'layout'); // drop it from the switcher immediately
  redirect('/');
}

export async function transferOwnershipAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = transferOwnershipSchema.safeParse({
    householdId: formData.get('householdId'),
    newOwnerUserId: formData.get('newOwnerUserId'),
  });
  if (!parsed.success) {
    return { error: 'Data tidak valid' };
  }

  try {
    await transferOwnership(user.id, parsed.data.householdId, parsed.data.newOwnerUserId);
  } catch (err) {
    return toActionError(err);
  }

  revalidatePath(`/household/${parsed.data.householdId}/members`);
  revalidatePath(`/household/${parsed.data.householdId}/settings`); // owner-only controls flip
  return OK;
}
