// @vitest-environment node
/**
 * Unit tests for `fetchGoldMarketPrices` — mocked `fetch`, matching the REAL
 * bogortech response shape confirmed against the live `SLK-DEV-…` sandbox
 * key: `{data: [{vendor: {...}, product: {...}, ...}]}`, not a hand-written
 * flat `{status, message, data: [{vendor_name, product_name, id, ...}]}`
 * shape — see ./market.ts's file header for the full story (nested
 * vendor/product objects, nullable `price_date`, and a feed that mixes in
 * international/spot/non-gold rows the `vendor.type === 'physical' &&
 * currency === 'IDR'` filter excludes).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGoldMarketPrices } from '../market';

function physicalRow(overrides: Record<string, unknown> = {}) {
  return {
    buy_price: 2634000,
    buyback_price: 2348000,
    currency: 'IDR',
    price_date: '2026-09-30T00:00:00Z',
    as_of: '2026-09-30T23:00:02Z',
    vendor: { id: 2, name: 'Galeri 24', slug: 'galeri-24', type: 'physical' },
    product: { id: 17, brand_id: 2, name: 'Emas Antam 1 Gram', weight: 1, unit: 'gram' },
    ...overrides,
  };
}

function spotRow() {
  return {
    buy_price: 4159.5,
    buyback_price: 4159.5,
    currency: 'USD',
    price_date: '2026-09-30T00:00:00Z',
    as_of: '2026-09-30T23:22:00Z',
    vendor: { id: 1, name: 'Pasar Spot Dunia (Kitco)', slug: 'global-market', type: 'spot' },
    product: { id: 1, brand_id: 1, name: 'Emas Spot (USD/oz)', weight: 1, unit: 'troy_oz' },
  };
}

describe('fetchGoldMarketPrices', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('parses a physical IDR row into minor-unit money, keyed on product.id', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [physicalRow()] }),
    }) as unknown as typeof fetch;

    const items = await fetchGoldMarketPrices();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: 17n,
      vendorName: 'Galeri 24',
      productName: 'Emas Antam 1 Gram',
      priceDate: '2026-09-30',
      buyPrice: 263_400_000n,
      buybackPrice: 234_800_000n,
      currency: 'IDR',
    });
    expect(items[0]!.asOf.toISOString()).toBe('2026-09-30T23:00:02.000Z');
  });

  it('excludes spot/international/non-IDR rows even though they share the same feed', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [physicalRow(), spotRow()] }),
    }) as unknown as typeof fetch;

    const items = await fetchGoldMarketPrices();
    expect(items).toHaveLength(1);
    expect(items[0]!.vendorName).toBe('Galeri 24');
  });

  it('falls back to the as_of date when price_date is null', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [physicalRow({ price_date: null, as_of: '2026-01-28T22:00:10Z' })] }),
    }) as unknown as typeof fetch;

    const items = await fetchGoldMarketPrices();
    expect(items[0]!.priceDate).toBe('2026-01-28');
  });

  it('sends the X-API-KEY header, not a Bearer Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
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
