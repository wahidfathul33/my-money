'use server';

/**
 * Server Actions for household invitations — send, revoke, resend, accept.
 * `requireUser()` first in every one except `acceptInvitationAction`, which
 * still requires a session but reports "sign in first" rather than a bare
 * 401 (this action is reachable from `/invite/[token]`, a page unauthenticated
 * visitors land on directly — proxy.ts's matcher excludes `/invite`, per
 * docs/12-security-and-auth.md §3, so THIS is one of the few Server Actions
 * where "no session" is an expected, common case, not a bug to crash on).
 *
 * Every action delegates the actual authorization to
 * src/lib/services/{invitations,memberships}.ts, which re-verifies
 * membership/ownership inside its own `dbWrite.transaction(...)` — this
 * layer only fails fast and shapes errors into `ActionState`, per
 * src/features/household/actions.ts's identical framing.
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { getClientIp } from '@/lib/auth/rate-limit';
import { assertInviteTokenRateLimit } from '@/lib/auth/invitation-rate-limit';
import { UnauthenticatedError } from '@/lib/api/errors';
import {
  acceptInvitation,
  createInvitation,
  resendInvitation,
  revokeInvitation,
} from '@/lib/services/invitations';
import { acceptInvitationSchema, inviteMemberSchema, invitationIdSchema } from './schema';
import { OK, toActionError, type ActionState } from './action-state';

export async function inviteMemberAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = inviteMemberSchema.safeParse({
    householdId: formData.get('householdId'),
    email: formData.get('email'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    await createInvitation(user.id, { householdId: parsed.data.householdId, email: parsed.data.email });
  } catch (err) {
    return toActionError(err);
  }

  revalidatePath(`/household/${parsed.data.householdId}/members`);
  revalidatePath('/', 'layout'); // setup-steps' "Undang anggota" can flip to done
  return OK;
}

export async function revokeInvitationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = invitationIdSchema.safeParse({
    householdId: formData.get('householdId'),
    invitationId: formData.get('invitationId'),
  });
  if (!parsed.success) {
    return { error: 'Data tidak valid' };
  }

  try {
    await revokeInvitation(user.id, parsed.data.householdId, parsed.data.invitationId);
  } catch (err) {
    return toActionError(err);
  }

  revalidatePath(`/household/${parsed.data.householdId}/members`);
  return OK;
}

export async function resendInvitationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = invitationIdSchema.safeParse({
    householdId: formData.get('householdId'),
    invitationId: formData.get('invitationId'),
  });
  if (!parsed.success) {
    return { error: 'Data tidak valid' };
  }

  try {
    await resendInvitation(user.id, parsed.data.householdId, parsed.data.invitationId);
  } catch (err) {
    return toActionError(err);
  }

  revalidatePath(`/household/${parsed.data.householdId}/members`);
  return OK;
}

/**
 * `/invite/[token]`'s "Terima undangan" button. Rate-limited per IP
 * (docs/12 §7: "10 percobaan token / jam per IP") BEFORE the session check
 * — an anonymous script hammering token guesses against this action
 * shouldn't get a free pass just because it's also not logged in; the IP
 * limit has to apply regardless of auth state.
 *
 * On success, redirects straight into the Members page of the household
 * just joined — mirrors `createHouseholdAction`'s "land inside what you
 * just did" pattern (src/features/household/actions.ts).
 */
export async function acceptInvitationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const requestHeaders = await headers();
  const ip = getClientIp(requestHeaders);
  try {
    assertInviteTokenRateLimit(ip);
  } catch (err) {
    return toActionError(err);
  }

  let user;
  try {
    user = await requireUser();
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return { error: 'Masuk terlebih dahulu untuk menerima undangan' };
    }
    throw err;
  }

  const parsed = acceptInvitationSchema.safeParse({ token: formData.get('token') });
  if (!parsed.success) {
    return { error: 'Undangan ini tidak valid atau sudah tidak berlaku' };
  }

  let result;
  try {
    result = await acceptInvitation(parsed.data.token, user.id);
  } catch (err) {
    return toActionError(err);
  }

  revalidatePath('/', 'layout'); // switcher now includes the joined household
  redirect(`/household/${result.householdId}/members`);
}
