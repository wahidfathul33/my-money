// @vitest-environment node
/**
 * Integration test for the gold-price cron route — docs/12-security-and-auth.md
 * §8: bearer `CRON_SECRET`, 401 without it. Same approach as
 * src/app/api/cron/expire-invitations/__tests__/route.integration.test.ts:
 * calls the route handler directly with a constructed `Request`.
 *
 * The "external provider actually refreshes a price" path is covered by
 * src/lib/gold-price/__tests__/provider.test.ts (mocked fetch) and
 * src/lib/services/__tests__/gold.integration.test.ts (`recordGoldPrice`
 * against the real DB) — this file only proves the ROUTE's own job: auth,
 * and that it no-ops safely when `GOLD_PRICE_PROVIDER` isn't `external`
 * (this repo's actual `.env`, same as production default — todo.md:
 * "Hanya berjalan bila GOLD_PRICE_PROVIDER=external").
 */
import { describe, expect, it } from 'vitest';
import { getEnv } from '@/lib/env';
import { GET } from '../route';

describe('GET /api/cron/gold-price', () => {
  it('rejects a request without the correct bearer CRON_SECRET', async () => {
    const request = new Request('http://localhost/api/cron/gold-price');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('rejects a request with the wrong secret', async () => {
    const request = new Request('http://localhost/api/cron/gold-price', {
      headers: { authorization: 'Bearer wrong-secret-value-not-configured' },
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('no-ops safely when GOLD_PRICE_PROVIDER is not "external", given the correct secret', async () => {
    expect(getEnv().GOLD_PRICE_PROVIDER).not.toBe('external');

    const request = new Request('http://localhost/api/cron/gold-price', {
      headers: { authorization: `Bearer ${getEnv().CRON_SECRET}` },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.skipped).toBe(true);
    expect(body.refreshedCount).toBe(0);
    expect(body.failedUserIds).toEqual([]);
  });
});
