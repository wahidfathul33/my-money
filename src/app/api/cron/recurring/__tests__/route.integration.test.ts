// @vitest-environment node
/**
 * Integration test for the recurring cron route — bearer `CRON_SECRET`, 401
 * without it (same shape as
 * src/app/api/cron/budget-rollover/__tests__/route.integration.test.ts),
 * plus the actual materialization/idempotency behavior end to end through
 * the real route handler (not just the underlying service functions, which
 * already have their own dedicated coverage in
 * src/lib/services/__tests__/recurring-transactions.integration.test.ts and
 * recurring-savings.integration.test.ts).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { wallets } from '@/lib/db/schema/wallets';
import { getEnv } from '@/lib/env';
import { createTestCategory, createTestRecurringTransaction, createTestUser, createTestWallet, deleteTestUser } from '@/lib/db/__tests__/test-helpers';
import { toLocalDate } from '@/lib/date/timezone';
import { GET } from '../route';

async function walletBalance(walletId: string): Promise<bigint> {
  const [row] = await dbWrite.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.id, walletId));
  return row!.balance;
}

describe('GET /api/cron/recurring', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  it('rejects a request without the correct bearer CRON_SECRET', async () => {
    const request = new Request('http://localhost/api/cron/recurring');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('rejects a request with the wrong secret', async () => {
    const request = new Request('http://localhost/api/cron/recurring', {
      headers: { authorization: 'Bearer wrong-secret-value-not-configured' },
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('returns transactions/contributions materialization counts, and materializes a due row end to end', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    const walletId = await createTestWallet(userId);
    const categoryId = await createTestCategory(userId, { type: 'expense' });
    // Due "today" for the real current instant, whatever it is — the route
    // calls the services with no explicit `now`, same reasoning as
    // budget-rollover's own test (real current instant, out of this test's
    // control, but "due today or earlier" is always satisfiable with a
    // safely past nextRunDate).
    await createTestRecurringTransaction(userId, {
      walletId,
      categoryId,
      type: 'expense',
      amount: 50_000_00n,
      frequency: 'monthly',
      startDate: '2020-01-01',
      nextRunDate: '2020-01-01',
    });

    const authHeaders = { authorization: `Bearer ${getEnv().CRON_SECRET}` };
    const response = await GET(new Request('http://localhost/api/cron/recurring', { headers: authHeaders }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.transactions.succeeded).toBe('number');
    expect(typeof body.transactions.failed).toBe('number');
    expect(typeof body.contributions.succeeded).toBe('number');
    expect(typeof body.contributions.failed).toBe('number');

    expect(await walletBalance(walletId)).toBe(-50_000_00n);
  });

  it('a second call the same day is a no-op for a rule already materialized (idempotent end to end)', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    const walletId = await createTestWallet(userId);
    const categoryId = await createTestCategory(userId, { type: 'income' });
    // `next_run_date` = TODAY (not an arbitrary past date): after the FIRST
    // call materializes it, the stored `next_run_date` advances to the NEXT
    // monthly cycle (a future date) — genuinely no longer due today, so the
    // second call is a true same-day no-op. A far-past `next_run_date`
    // would instead legitimately catch up ANOTHER distinct cycle on the
    // second call (correct catch-up behavior, not a bug) — not what this
    // test is checking.
    const today = toLocalDate(new Date());
    await createTestRecurringTransaction(userId, {
      walletId,
      categoryId,
      type: 'income',
      amount: 25_000_00n,
      frequency: 'monthly',
      startDate: today,
      nextRunDate: today,
    });

    const authHeaders = { authorization: `Bearer ${getEnv().CRON_SECRET}` };
    await GET(new Request('http://localhost/api/cron/recurring', { headers: authHeaders }));
    await GET(new Request('http://localhost/api/cron/recurring', { headers: authHeaders }));

    expect(await walletBalance(walletId)).toBe(25_000_00n); // moved exactly ONCE
  });
});
