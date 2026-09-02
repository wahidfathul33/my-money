'use server';

import { signOut } from '@/lib/auth';
import { requireUser } from '@/lib/auth/require-user';

/**
 * Logout — docs/12-security-and-auth.md acceptance: "Logout mencabut sesi
 * di database, bukan sekadar menghapus cookie." Auth.js's database-strategy
 * `signOut()` deletes the `sessions` row for this cookie's token (via the
 * adapter's `deleteSession`) before clearing the cookie, so this is real
 * server-side revocation, not just a client-side sign-out.
 */
export async function signOutAction(): Promise<void> {
  await requireUser();
  await signOut({ redirectTo: '/signin' });
}
