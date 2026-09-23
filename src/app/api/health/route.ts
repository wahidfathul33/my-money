import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { dbRead } from '@/lib/db/read';

/**
 * `GET /api/health` — docs/13-deployment-vercel.md §9 ("Uptime | Health
 * check eksternal ke `/api/health`"), task 23. Liveness AND readiness in
 * one: an external uptime checker (UptimeRobot, Better Stack, Vercel's own
 * monitor, …) can't authenticate with a session or `CRON_SECRET`, so this
 * route is intentionally the one unauthenticated endpoint under `/api` —
 * excluded from `src/proxy.ts`'s matcher for exactly that reason.
 *
 * Deliberately public but silent: on failure it reports `db: false` and a
 * 503, never a stack trace, connection string, or any other detail — an
 * uptime checker only needs up/down, and this endpoint is the one part of
 * the app reachable by an unauthenticated party on the open internet by
 * design, so it must leak nothing regardless.
 *
 * `SELECT 1` (not a real table) keeps the check cheap and independent of
 * schema — this endpoint answers "is the app reachable and can it reach the
 * database", not "is any particular table healthy". Wallet/ledger
 * consistency is `/api/cron/reconcile`'s job, not this one's.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await dbRead.execute(sql`SELECT 1`);
    return NextResponse.json({ status: 'ok', db: true });
  } catch {
    return NextResponse.json({ status: 'error', db: false }, { status: 503 });
  }
}
