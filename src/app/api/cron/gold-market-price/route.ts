import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { refreshGoldMarketPrices } from '@/lib/services/gold-market';

/**
 * `GET /api/cron/gold-market-price` — refreshes the multi-vendor gold price
 * reference table daily at 10:00 WIB (`vercel.json`: `"0 3 * * *"`, UTC).
 * Bearer `CRON_SECRET` auth, same pattern as every other cron route (see
 * src/app/api/cron/gold-price/route.ts). Unlike that route, this one is NOT
 * gated behind `GOLD_PRICE_PROVIDER=external` — it's the standalone vendor
 * price feed, not the per-user valuation fallback.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const env = getEnv();
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await refreshGoldMarketPrices();
  return NextResponse.json(result);
}
