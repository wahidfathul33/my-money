// @vitest-environment node
/**
 * Integration test for the net-worth-snapshot cron route — docs/06-api-contracts.md
 * §7: bearer `CRON_SECRET`, one row per active user AND one row per active
 * household, idempotent via `ON CONFLICT (entity_id, snapshot_date) DO
 * UPDATE`. Calls the route handler directly, same approach as
 * e2e/../cron/expire-invitations's own integration test.
 *
 * This route processes EVERY active user/household in the database (it has
 * to — it's the whole point of a daily snapshot cron), so these tests don't
 * assert on the returned counts (other tests' leftover rows would make that
 * flaky); they assert on the specific rows THIS test seeded.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { householdNetWorthSnapshots, netWorthSnapshots, wallets } from '@/lib/db/schema';
import { getEnv } from '@/lib/env';
import { toLocalDate } from '@/lib/date/timezone';
import {
  createTestHousehold,
  createTestHouseholdMember,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { GET } from '../route';

describe('GET /api/cron/net-worth-snapshot', () => {
  const userIds: string[] = [];
  const householdIds: string[] = [];

  afterEach(async () => {
    for (const id of householdIds.splice(0)) {
      await deleteTestHousehold(id);
    }
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  it('rejects a request without the correct bearer CRON_SECRET', async () => {
    const request = new Request('http://localhost/api/cron/net-worth-snapshot');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('writes one personal AND one household snapshot row, and calling it twice does not duplicate either — idempotent via ON CONFLICT', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    userIds.push(owner, member);
    const householdId = await createTestHousehold(owner);
    householdIds.push(householdId);
    await createTestHouseholdMember(householdId, member, { status: 'active', shareWealth: true });
    await createTestWallet(member, { type: 'cash', balance: 1_500_000_00n });
    await createTestWallet(owner, { type: 'cash', balance: 500_000_00n });

    const request = () =>
      new Request('http://localhost/api/cron/net-worth-snapshot', {
        headers: { authorization: `Bearer ${getEnv().CRON_SECRET}` },
      });

    const first = await GET(request());
    expect(first.status).toBe(200);

    const today = toLocalDate(new Date());

    const personalRowsAfterFirst = await dbWrite
      .select()
      .from(netWorthSnapshots)
      .where(and(eq(netWorthSnapshots.userId, owner), eq(netWorthSnapshots.snapshotDate, today)));
    expect(personalRowsAfterFirst).toHaveLength(1);
    expect(personalRowsAfterFirst[0]!.totalAssets).toBe(500_000_00n);

    const householdRowsAfterFirst = await dbWrite
      .select()
      .from(householdNetWorthSnapshots)
      .where(and(eq(householdNetWorthSnapshots.householdId, householdId), eq(householdNetWorthSnapshots.snapshotDate, today)));
    expect(householdRowsAfterFirst).toHaveLength(1);
    expect(householdRowsAfterFirst[0]!.totalAssets).toBe(1_500_000_00n); // only the sharing member counts
    expect(householdRowsAfterFirst[0]!.memberCount).toBe(1);
    expect(householdRowsAfterFirst[0]!.contributingCount).toBe(1);

    // Change the underlying data, then run the cron again for the SAME day.
    await dbWrite.update(wallets).set({ balance: 900_000_00n }).where(eq(wallets.userId, owner));

    const second = await GET(request());
    expect(second.status).toBe(200);

    const personalRowsAfterSecond = await dbWrite
      .select()
      .from(netWorthSnapshots)
      .where(and(eq(netWorthSnapshots.userId, owner), eq(netWorthSnapshots.snapshotDate, today)));
    expect(personalRowsAfterSecond).toHaveLength(1); // still exactly one row — UPDATEd, not duplicated
    expect(personalRowsAfterSecond[0]!.totalAssets).toBe(900_000_00n); // reflects the new figure

    const householdRowsAfterSecond = await dbWrite
      .select()
      .from(householdNetWorthSnapshots)
      .where(and(eq(householdNetWorthSnapshots.householdId, householdId), eq(householdNetWorthSnapshots.snapshotDate, today)));
    expect(householdRowsAfterSecond).toHaveLength(1);
  }, 60_000);
});
