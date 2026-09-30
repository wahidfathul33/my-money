// @vitest-environment node
/**
 * Integration test for the gold-market-price cron route — auth only
 * (docs/12-security-and-auth.md §8: bearer `CRON_SECRET`, 401 without it),
 * same shape as src/app/api/cron/gold-price/__tests__/route.integration.test.ts.
 *
 * The success path mocks `refreshGoldMarketPrices` rather than exercising it
 * for real: unlike the gold-price cron (which no-ops unless
 * `GOLD_PRICE_PROVIDER=external`), this route ALWAYS calls out to the real
 * bogortech API — a live network dependency has no place in this test, and
 * `src/lib/gold-price/__tests__/market.test.ts` already covers that fetch
 * with a mocked response.
 */
import { describe, expect, it, vi } from 'vitest';
import { getEnv } from '@/lib/env';

vi.mock('@/lib/services/gold-market', () => ({
  refreshGoldMarketPrices: vi.fn().mockResolvedValue({ count: 3 }),
}));

import { GET } from '../route';

describe('GET /api/cron/gold-market-price', () => {
  it('rejects a request without the correct bearer CRON_SECRET', async () => {
    const request = new Request('http://localhost/api/cron/gold-market-price');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('rejects a request with the wrong secret', async () => {
    const request = new Request('http://localhost/api/cron/gold-market-price', {
      headers: { authorization: 'Bearer wrong-secret-value-not-configured' },
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('refreshes and returns a count, given the correct secret', async () => {
    const request = new Request('http://localhost/api/cron/gold-market-price', {
      headers: { authorization: `Bearer ${getEnv().CRON_SECRET}` },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.count).toBe(3);
  });
});
