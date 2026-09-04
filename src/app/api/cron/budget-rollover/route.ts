import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { materializeRecurringBudgets } from '@/lib/services/budgets';

/**
 * `GET /api/cron/budget-rollover` — docs/06-api-contracts.md §7, scheduled
 * DAILY via `vercel.json` (NOT monthly-on-the-1st: tasks/14-budgets/spec.md
 * "Catatan" is explicit that a monthly cron in UTC fires on the wrong
 * calendar date for WIB users). Bearer `CRON_SECRET` is the only auth, same
 * shape as `/api/cron/expire-invitations` (src/app/api/cron/expire-invitations/route.ts).
 *
 * `materializeRecurringBudgets` (src/lib/services/budgets.ts) itself decides
 * — per user/household, in THEIR OWN timezone — whether today is actually
 * the 1st; most invocations of this route do nothing at all, which is
 * expected, not an error. Idempotent via the same unique index that backs
 * `upsertPersonalBudget`/`upsertHouseholdBudget` (`ON CONFLICT DO NOTHING`):
 * calling this route twice for the same day creates zero rows the second
 * time.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const env = getEnv();
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await materializeRecurringBudgets();
  return NextResponse.json(result);
}
