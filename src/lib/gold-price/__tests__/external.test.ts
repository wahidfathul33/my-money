// @vitest-environment node
/**
 * Unit tests for `ExternalPriceProvider` itself (the real class, `fetch`
 * mocked globally) — see provider.test.ts for the fallback ORCHESTRATION
 * tests, which mock this class instead of exercising it directly.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExternalPriceProvider } from '../external';

describe('ExternalPriceProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('parses a well-formed response into a quote', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sellPerGram: '1250000', buybackPerGram: '1190000', asOf: '2026-01-02T00:00:00.000Z' }),
    }) as unknown as typeof fetch;

    const provider = new ExternalPriceProvider({ apiUrl: 'https://gold-price.example.test/quote' });
    const quote = await provider.fetch();

    expect(quote.sellPerGram).toBe(1_250_000n);
    expect(quote.buybackPerGram).toBe(1_190_000n);
    expect(quote.asOf.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('accepts numeric price fields, not just strings', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sellPerGram: 1250000, buybackPerGram: 1190000 }),
    }) as unknown as typeof fetch;

    const provider = new ExternalPriceProvider({ apiUrl: 'https://gold-price.example.test/quote' });
    const quote = await provider.fetch();
    expect(quote.buybackPerGram).toBe(1_190_000n);
  });

  it('defaults asOf to now when the response omits it', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sellPerGram: '1250000', buybackPerGram: '1190000' }),
    }) as unknown as typeof fetch;

    const before = Date.now();
    const provider = new ExternalPriceProvider({ apiUrl: 'https://gold-price.example.test/quote' });
    const quote = await provider.fetch();
    expect(quote.asOf.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('sends a bearer Authorization header when an API key is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sellPerGram: '1250000', buybackPerGram: '1190000' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new ExternalPriceProvider({ apiUrl: 'https://gold-price.example.test/quote', apiKey: 'secret-key' });
    await provider.fetch();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://gold-price.example.test/quote',
      expect.objectContaining({ headers: { Authorization: 'Bearer secret-key' } }),
    );
  });

  it('throws on a non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;

    const provider = new ExternalPriceProvider({ apiUrl: 'https://gold-price.example.test/quote' });
    await expect(provider.fetch()).rejects.toThrow(/503/);
  });

  it('throws on a malformed response body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unrelated: true }),
    }) as unknown as typeof fetch;

    const provider = new ExternalPriceProvider({ apiUrl: 'https://gold-price.example.test/quote' });
    await expect(provider.fetch()).rejects.toThrow(/missing sellPerGram/);
  });

  it('throws when the network request itself fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const provider = new ExternalPriceProvider({ apiUrl: 'https://gold-price.example.test/quote' });
    await expect(provider.fetch()).rejects.toThrow('network down');
  });
});
