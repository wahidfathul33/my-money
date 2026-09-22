import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { runReconciliation } from '@/lib/db/reconcile';
import { reportReconciliationFinding } from '@/lib/observability/sentry';

/**
 * `GET /api/cron/reconcile` — docs/06-api-contracts.md §7 ("03:00 WIB harian
 * ... cek invarian I1–I19, laporkan selisih"), scheduled via `vercel.json`.
 * Bearer `CRON_SECRET` is the only auth, same pattern as every other
 * `/api/cron/*` route (src/app/api/cron/expire-invitations/route.ts); this
 * route sits outside `src/proxy.ts`'s matcher because Vercel Cron doesn't
 * carry a user session.
 *
 * `runReconciliation` (src/lib/db/reconcile.ts) is read-only by
 * construction — this route NEVER repairs drift, only reports it
 * (docs/13-deployment-vercel.md §10's runbook: "Perbaiki penyebabnya lebih
 * dulu, baru datanya... tidak pernah dengan UPDATE langsung"). Calling this
 * route twice in a row is always safe: it's a pure SELECT, so a second
 * invocation just re-reports the same findings (or none).
 *
 * The JSON response carries the full report, drift amounts included — this
 * is the same authenticated, bearer-secured surface a human runs the
 * invariant queries from manually per the runbook, not a public log. The
 * alert path is different: `reportReconciliationFinding` sends only COUNTS
 * to Sentry (docs/12-security-and-auth.md §10 — no nominal, no wallet name,
 * ever leaves the process via that channel).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const env = getEnv();
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const report = await runReconciliation();
  reportReconciliationFinding(report);
  return NextResponse.json(report);
}
