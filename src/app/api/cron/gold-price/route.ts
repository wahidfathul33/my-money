import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { refreshGoldPrices } from '@/lib/services/gold';

/**
 * `GET /api/cron/gold-price` — docs/06-api-contracts.md §7 ("02:00 WIB
 * harian ... Ambil dari provider eksternal jika diaktifkan"), scheduled
 * via `vercel.json`. Bearer `CRON_SECRET` (min 32 chars, Vercel-only env
 * var — src/lib/env.ts) is the only auth, same pattern as
 * src/app/api/cron/expire-invitations/route.ts; this route sits outside
 * `src/proxy.ts`'s matcher because Vercel Cron doesn't carry a user
 * session.
 *
 * `refreshGoldPrices` (src/lib/services/gold.ts) itself no-ops when
 * `GOLD_PRICE_PROVIDER` isn't `external` — the manual provider has nothing
 * for a cron to fetch on anyone's behalf (todo.md: "Hanya berjalan bila
 * GOLD_PRICE_PROVIDER=external"). Calling this route twice in a row is
 * always safe: `recordGoldPrice`'s upsert is keyed on (user, date), so a
 * second run the same day just re-writes the same row with (typically) the
 * same values.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const env = getEnv();
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await refreshGoldPrices();
  return NextResponse.json(result);
}
