import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { expireInvitations } from '@/lib/services/invitations';

/**
 * `GET /api/cron/expire-invitations` — docs/12-security-and-auth.md §8,
 * scheduled daily via `vercel.json` (Vercel's Hobby/free plan only allows
 * daily cron jobs — an hourly schedule is Pro-only. Safe to run daily
 * rather than hourly: this route is pure housekeeping, not the actual
 * expiry check — `acceptInvitation` in src/lib/services/invitations.ts
 * independently verifies `expiresAt > now` in real time on every accept
 * attempt regardless of whether this cron has caught up yet, so the only
 * effect of the coarser cadence is a stale invitation showing "Menunggu"
 * in the UI for up to ~24h after its real 7-day expiry, never a security
 * or correctness gap). Bearer `CRON_SECRET` (min 32 chars, Vercel-only env
 * var — src/lib/env.ts) is the only auth; this route sits outside
 * `src/proxy.ts`'s matcher (`/api/cron` is explicitly excluded) because
 * Vercel Cron doesn't carry a user session.
 *
 * `expireInvitations` (src/lib/services/invitations.ts) touches ONLY
 * `household_invitations.status`, guarded by `WHERE status = 'pending'` —
 * spec.md's explicit acceptance criterion: "Ia tidak menulis apa pun yang
 * bersifat finansial — hanya mengubah status undangan — sehingga
 * menjalankannya berulang tidak dapat merusak saldo siapa pun." Calling
 * this route twice in a row is always safe: the second call simply finds
 * zero still-`pending`-and-expired rows.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const env = getEnv();
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const expiredCount = await expireInvitations();
  return NextResponse.json({ expiredCount });
}
