import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { writeNetWorthSnapshots } from '@/lib/services/net-worth-snapshot';

/**
 * `GET /api/cron/net-worth-snapshot` — docs/06-api-contracts.md §7,
 * scheduled 23:55 WIB daily via `vercel.json`. Bearer `CRON_SECRET` is the
 * only auth, same pattern as every other `/api/cron/*` route
 * (src/app/api/cron/expire-invitations/route.ts) — this path sits outside
 * `src/proxy.ts`'s matcher since Vercel Cron carries no user session.
 *
 * `writeNetWorthSnapshots` (src/lib/services/net-worth-snapshot.ts) writes
 * one row per active user AND one row per active household, both via
 * `ON CONFLICT (entity_id, snapshot_date) DO UPDATE` — calling this route
 * twice for the same day produces exactly one row per entity per date, not
 * two.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const env = getEnv();
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await writeNetWorthSnapshots();
  return NextResponse.json(result);
}
