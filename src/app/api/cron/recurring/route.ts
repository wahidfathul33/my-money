import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { materializeRecurringTransactions } from '@/lib/services/recurring-transactions';
import { materializeRecurringContributions } from '@/lib/services/recurring-savings';

/**
 * `GET /api/cron/recurring` — tasks/24-recurring-transactions/spec.md,
 * docs/06-api-contracts.md §7. ONE route, scheduled DAILY via `vercel.json`
 * (spec.md: Vercel Hobby already runs 6 daily crons for this project;
 * adding a second recurring-specific route was ruled out to avoid pushing
 * closer to any plan limit). Same auth shape as every other `/api/cron/**`
 * route — Bearer `CRON_SECRET`, no `requireUser()` (machine-to-machine
 * call, sits outside `src/proxy.ts`'s matcher).
 *
 * Calls both materializers in sequence, in one request — income/expense
 * rules first, then auto-contributions. Each is independently idempotent
 * (see src/lib/services/recurring-transactions.ts's file header for the
 * exact mechanism), so a partial failure between the two never risks a
 * double-post on retry: Vercel re-invoking this route after a timeout/error
 * just re-runs whichever half didn't finish, safely.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const env = getEnv();
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const transactions = await materializeRecurringTransactions();
  const contributions = await materializeRecurringContributions();
  return NextResponse.json({ transactions, contributions });
}
