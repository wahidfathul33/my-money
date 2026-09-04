// @vitest-environment node
/**
 * Integration test for the budget-rollover cron route — bearer
 * `CRON_SECRET`, 401 without it (same shape as
 * src/app/api/cron/expire-invitations/__tests__/route.integration.test.ts),
 * plus tasks/14-budgets/todo.md's own cron test: "panggil dua kali → satu
 * instance" (idempotent).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { budgets } from '@/lib/db/schema/budgets';
import { getEnv } from '@/lib/env';
import { currentLocalPeriod } from '@/lib/date/timezone';
import { upsertPersonalBudget } from '@/lib/services/budgets';
import { createTestCategory, createTestUser, deleteTestUser } from '@/lib/db/__tests__/test-helpers';
import { GET } from '../route';

describe('GET /api/cron/budget-rollover', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  it('rejects a request without the correct bearer CRON_SECRET', async () => {
    const request = new Request('http://localhost/api/cron/budget-rollover');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('rejects a request with the wrong secret', async () => {
    const request = new Request('http://localhost/api/cron/budget-rollover', {
      headers: { authorization: 'Bearer wrong-secret-value-not-configured' },
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  // `GET` calls `materializeRecurringBudgets()` with no explicit `now`,
  // i.e. the REAL current instant — whether "today" happens to be the 1st
  // in Asia/Jakarta right now is out of this test's control (and it scans
  // every user/household in the database, not just this test's fixture, so
  // asserting an exact `personalCreated` count from the FIRST call would
  // be both date-dependent and cross-test-data-dependent). What's testable
  // unconditionally, any day this suite runs, is: the route responds with
  // the right shape, and a SECOND call is always a no-op — idempotency
  // doesn't depend on what day it is (src/lib/services/budgets.ts's own
  // `now`-parameterized tests already cover the "actually materializes on
  // the 1st" behavior precisely, with a controlled `now`).
  it('returns personalCreated/householdCreated counts, and a second call is always a no-op', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    const categoryId = await createTestCategory(userId, { name: 'Makan', type: 'expense' });
    await upsertPersonalBudget(userId, {
      categoryId,
      amount: 500_000_00n,
      period: currentLocalPeriod(),
      isRecurring: true,
    });

    const authHeaders = { authorization: `Bearer ${getEnv().CRON_SECRET}` };
    const first = await GET(new Request('http://localhost/api/cron/budget-rollover', { headers: authHeaders }));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(typeof firstBody.personalCreated).toBe('number');
    expect(typeof firstBody.householdCreated).toBe('number');

    const second = await GET(new Request('http://localhost/api/cron/budget-rollover', { headers: authHeaders }));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.personalCreated).toBe(0);
    expect(secondBody.householdCreated).toBe(0);
  });

  it('does not touch a NON-recurring budget', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    const categoryId = await createTestCategory(userId, { name: 'Makan', type: 'expense' });
    await upsertPersonalBudget(userId, {
      categoryId,
      amount: 500_000_00n,
      period: '2026-01', // far enough in the past that "today" is never this period's start
      isRecurring: false,
    });

    const request = new Request('http://localhost/api/cron/budget-rollover', {
      headers: { authorization: `Bearer ${getEnv().CRON_SECRET}` },
    });
    await GET(request);

    const rows = await dbWrite
      .select()
      .from(budgets)
      .where(and(eq(budgets.userId, userId), eq(budgets.periodStart, '2026-02-01')));
    expect(rows).toHaveLength(0);
  });
});
