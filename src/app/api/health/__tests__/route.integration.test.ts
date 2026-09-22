// @vitest-environment node
/**
 * Integration test for `/api/health` — docs/13-deployment-vercel.md §9.
 * Real DB round trip (`SELECT 1` via `dbRead`), no auth: an external uptime
 * checker can't hold a session or `CRON_SECRET`, so this is the one route
 * under `/api` that must answer without either.
 */
import { describe, expect, it } from 'vitest';
import { GET } from '../route';

describe('GET /api/health', () => {
  it('reports ok with db reachable, unauthenticated', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: 'ok', db: true });
  });
});
