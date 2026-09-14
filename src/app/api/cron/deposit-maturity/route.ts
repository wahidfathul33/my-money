import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { payMonthlyInterest, processMaturities } from '@/lib/services/deposits';

/**
 * `GET /api/cron/deposit-maturity` — docs/06-api-contracts.md §7: scheduled
 * 01:00 WIB daily ("`active` → `matured`; proses ARO; bunga bulanan").
 * Bearer `CRON_SECRET` is the only auth, same pattern as
 * src/app/api/cron/expire-invitations/route.ts (`/api/cron` sits outside
 * `src/proxy.ts`'s matcher — Vercel Cron carries no user session).
 *
 * Both `processMaturities` and `payMonthlyInterest`
 * (src/lib/services/deposits.ts) are idempotent on their own — guarded by
 * CURRENT ROW STATE (`status`, `last_interest_payment_date`), not by
 * anything this route does — so calling this endpoint twice in a row (a
 * retried Vercel Cron invocation after a timeout, for instance) has
 * exactly the same total effect as calling it once. Both run to completion
 * unconditionally: a rare failure in one must not silently skip the other.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const env = getEnv();
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const maturities = await processMaturities();
  const interest = await payMonthlyInterest();

  return NextResponse.json({
    maturedCount: maturities.maturedCount,
    aroCount: maturities.aroCount,
    monthlyInterestPaidCount: interest.paidCount,
  });
}
