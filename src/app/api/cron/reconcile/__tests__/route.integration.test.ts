// @vitest-environment node
/**
 * Integration test for the reconcile cron route — docs/06-api-contracts.md
 * §7, docs/12-security-and-auth.md §8 (bearer `CRON_SECRET`). Same shape as
 * src/app/api/cron/expire-invitations/__tests__/route.integration.test.ts.
 *
 * Doesn't assert `hasFindings === false` globally — `runReconciliation`
 * scans whole tables (src/lib/db/reconcile.ts's own doc comment), so a
 * global assertion here would be sensitive to any other data present in
 * this shared dev database. Instead, mirrors
 * src/lib/db/__tests__/reconcile.integration.test.ts's own pattern: build a
 * healthy fixture and assert THAT entity has no drift in the response.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { dbWrite } from '@/lib/db/write';
import { postEntries } from '@/lib/finance/ledger';
import { getEnv } from '@/lib/env';
import { createTestUser, createTestWallet, deleteTestUser } from '@/lib/db/__tests__/test-helpers';
import { GET } from '../route';

describe('GET /api/cron/reconcile', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  it('rejects a request without the correct bearer CRON_SECRET', async () => {
    const request = new Request('http://localhost/api/cron/reconcile');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('rejects a request with the wrong secret', async () => {
    const request = new Request('http://localhost/api/cron/reconcile', {
      headers: { authorization: 'Bearer wrong-secret-value-not-configured' },
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('reports no drift for a healthy wallet, given the correct secret', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    const walletId = await createTestWallet(userId);

    await dbWrite.transaction(async (tx) => {
      await postEntries(tx, [
        { userId, walletId, amount: 300_000n, source: 'adjustment', entryDate: new Date() },
      ]);
    });

    const request = new Request('http://localhost/api/cron/reconcile', {
      headers: { authorization: `Bearer ${getEnv().CRON_SECRET}` },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.walletBalanceDrift.filter((d: { walletId: string }) => d.walletId === walletId)).toHaveLength(0);
    expect(body.ledgerOwnerMismatches).toBeDefined();
    expect(typeof body.hasFindings).toBe('boolean');
  });
});
