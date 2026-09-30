// @vitest-environment node
/**
 * Unit tests for `fetchGoldMarketPrices` — mocked `fetch`, matching the
 * REAL bogortech response shape (`{status, data: [...]}`), unlike
 * `external.test.ts`'s flat `{sellPerGram, buybackPerGram}` fixture. See
 * ./market.ts's file header for why these are two separate modules.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGoldMarketPrices } from '../market';

describe('fetchGoldMarketPrices', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const sampleBody = {
    status: 'success',
    message: 'Data harga emas fisik terbaru',
    data: [
      {
        id: 513691,
        vendor_name: 'Antam',
        product_name: 'Emas Antam 1 Gram',
        price_date: '2026-08-29',
        buy_price: 1400000,
        buyback_price: 1250000,
        currency: 'IDR',
        as_of: '2026-08-29T08:15:00Z',
      },
    ],
  };

  it('parses every vendor/product row into minor-unit money', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => sampleBody }) as unknown as typeof fetch;

    const items = await fetchGoldMarketPrices();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: 513691n,
      vendorName: 'Antam',
      productName: 'Emas Antam 1 Gram',
      priceDate: '2026-08-29',
      buyPrice: 140_000_000n,
      buybackPrice: 125_000_000n,
      currency: 'IDR',
    });
    expect(items[0]!.asOf.toISOString()).toBe('2026-08-29T08:15:00.000Z');
  });

  it('sends the X-API-KEY header, not a Bearer Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => sampleBody });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchGoldMarketPrices();

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-API-KEY']).toBeTruthy();
    expect(headers.Authorization).toBeUndefined();
  });

  it('throws on a non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(fetchGoldMarketPrices()).rejects.toThrow(/500/);
  });

  it('throws on a malformed response body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unrelated: true }),
    }) as unknown as typeof fetch;
    await expect(fetchGoldMarketPrices()).rejects.toThrow(/does not match the expected shape/);
  });
});
