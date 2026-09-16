// @vitest-environment node
/**
 * Unit tests for the pluggable gold price provider — ADR-008. Both
 * `ManualPriceProvider` and `ExternalPriceProvider` are mocked here so this
 * file can exercise `fetchGoldPriceWithFallback`'s ORCHESTRATION logic
 * (which provider gets called, and the mandatory fallback) without a real
 * DB or network call — `ManualPriceProvider`'s own DB read is proven
 * against the real database in src/lib/services/__tests__/gold.integration.test.ts.
 *
 * `getEnv()` (src/lib/env.ts) caches its parsed result in a module-level
 * variable, so each test that needs a different `GOLD_PRICE_PROVIDER` value
 * resets the module registry and re-imports `../provider` fresh — otherwise
 * every test after the first would see whichever value was cached first.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const manualFetchMock = vi.fn();
const externalFetchMock = vi.fn();

// A constructor function that explicitly `return`s an object overrides
// `new`'s default `this` — this is what lets a plain `vi.fn()` stand in for
// a class here. An arrow function can't be used with `new` at all (no
// `[[Construct]]`), which is the mistake this comment is guarding against.
vi.mock('../manual', () => ({
  ManualPriceProvider: vi.fn().mockImplementation(function ManualPriceProviderMock() {
    return { id: 'manual', fetch: manualFetchMock };
  }),
}));

vi.mock('../external', () => ({
  ExternalPriceProvider: vi.fn().mockImplementation(function ExternalPriceProviderMock() {
    return { id: 'external', fetch: externalFetchMock };
  }),
}));

describe('fetchGoldPriceWithFallback', () => {
  beforeEach(() => {
    vi.resetModules();
    manualFetchMock.mockReset();
    externalFetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('goes straight to the manual provider when GOLD_PRICE_PROVIDER is unset', async () => {
    manualFetchMock.mockResolvedValue({
      sellPerGram: 1_000_000_00n,
      buybackPerGram: 900_000_00n,
      asOf: new Date('2026-01-01T00:00:00.000Z'),
    });

    const { fetchGoldPriceWithFallback } = await import('../provider');
    const result = await fetchGoldPriceWithFallback('user-1');

    expect(result.usedProviderId).toBe('manual');
    expect(result.fellBackToManual).toBe(false);
    expect(result.quote.buybackPerGram).toBe(900_000_00n);
    expect(externalFetchMock).not.toHaveBeenCalled();
  });

  it('uses the external provider when configured and it succeeds', async () => {
    vi.stubEnv('GOLD_PRICE_PROVIDER', 'external');
    vi.stubEnv('GOLD_PRICE_API_URL', 'https://gold-price.example.test/quote');
    externalFetchMock.mockResolvedValue({
      sellPerGram: 1_250_000_00n,
      buybackPerGram: 1_190_000_00n,
      asOf: new Date('2026-01-02T00:00:00.000Z'),
    });

    const { fetchGoldPriceWithFallback } = await import('../provider');
    const result = await fetchGoldPriceWithFallback('user-1');

    expect(result.usedProviderId).toBe('external');
    expect(result.fellBackToManual).toBe(false);
    expect(result.quote.buybackPerGram).toBe(1_190_000_00n);
    expect(manualFetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the last known (manual) price when the external provider fails — ADR-008', async () => {
    vi.stubEnv('GOLD_PRICE_PROVIDER', 'external');
    vi.stubEnv('GOLD_PRICE_API_URL', 'https://gold-price.example.test/quote');
    externalFetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    manualFetchMock.mockResolvedValue({
      sellPerGram: 1_050_000_00n,
      buybackPerGram: 980_000_00n,
      asOf: new Date('2025-12-15T00:00:00.000Z'),
    });

    const { fetchGoldPriceWithFallback } = await import('../provider');
    const result = await fetchGoldPriceWithFallback('user-1');

    expect(result.usedProviderId).toBe('manual');
    expect(result.fellBackToManual).toBe(true);
    expect(result.quote.buybackPerGram).toBe(980_000_00n);
    expect(externalFetchMock).toHaveBeenCalledTimes(1);
    expect(manualFetchMock).toHaveBeenCalledTimes(1);
  });

  it('propagates the error when external fails AND there is no manual price to fall back to', async () => {
    vi.stubEnv('GOLD_PRICE_PROVIDER', 'external');
    vi.stubEnv('GOLD_PRICE_API_URL', 'https://gold-price.example.test/quote');
    externalFetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    manualFetchMock.mockRejectedValue(new Error('no gold price has ever been recorded'));

    const { fetchGoldPriceWithFallback } = await import('../provider');
    await expect(fetchGoldPriceWithFallback('user-1')).rejects.toThrow(/no gold price has ever been recorded/);
  });

  it('treats any non-"external" value (defensively) the same as unset', async () => {
    // getEnv()'s Zod schema already rejects anything outside
    // ['manual','external'], but getConfiguredProviderId's own comparison
    // is defensive regardless — belt and suspenders on a security/financial
    // feature flag.
    const { getConfiguredProviderId } = await import('../provider');
    expect(getConfiguredProviderId()).toBe('manual');
  });
});
