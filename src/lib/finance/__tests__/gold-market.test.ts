// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseGrams } from '../gold';
import { buybackPerGram, selectGoldMarketQuote, type GoldMarketQuote } from '../gold-market';

function quote(overrides: Partial<GoldMarketQuote> = {}): GoldMarketQuote {
  return {
    vendorName: 'Galeri 24',
    productName: 'Emas Antam 1 Gram',
    weightGrams: '1',
    buybackPrice: 2_400_000_00n,
    priceDate: '2026-09-30',
    asOf: new Date('2026-09-30T10:00:00Z'),
    ...overrides,
  };
}

describe('gold market valuation', () => {
  it('normalizes product buyback price to whole-rupiah per gram with integer arithmetic', () => {
    expect(buybackPerGram(quote({ weightGrams: '2', buybackPrice: 4_801_000_00n }))).toBe(
      2_400_500_00n,
    );
  });

  it('prefers the lot vendor and exact product weight over newer quotes from other vendors', () => {
    const selected = selectGoldMarketQuote(
      [
        quote({ vendorName: 'Antam', priceDate: '2026-10-01', buybackPrice: 2_500_000_00n }),
        quote({ vendorName: 'Galeri 24', weightGrams: '5', priceDate: '2026-10-01' }),
        quote({ vendorName: 'Galeri 24', priceDate: '2026-09-29' }),
      ],
      'Galeri 24',
      parseGrams('1'),
    );

    expect(selected?.vendorName).toBe('Galeri 24');
    expect(selected?.priceDate).toBe('2026-09-29');
  });

  it('falls back to the latest exact-weight quote and returns its vendor for the UI label', () => {
    const selected = selectGoldMarketQuote(
      [
        quote({ vendorName: 'Zamrud', priceDate: '2026-09-29' }),
        quote({ vendorName: 'Antam', priceDate: '2026-10-01' }),
      ],
      'Galeri 24',
      parseGrams('1'),
    );

    expect(selected?.vendorName).toBe('Antam');
    expect(selected?.priceDate).toBe('2026-10-01');
  });

  it('does not use a quote for a different product weight', () => {
    expect(
      selectGoldMarketQuote([quote({ weightGrams: '5' })], 'Galeri 24', parseGrams('1')),
    ).toBeNull();
  });

  it('does not use a different vendor when the lot has no vendor recorded', () => {
    expect(selectGoldMarketQuote([quote()], null, parseGrams('1'), false)).toBeNull();
  });

  it('chooses the newest exact-weight quote when the lot has no vendor and fallback is allowed', () => {
    const selected = selectGoldMarketQuote(
      [quote({ vendorName: 'Antam', priceDate: '2026-09-29' }), quote({ vendorName: 'Galeri 24' })],
      null,
      parseGrams('1'),
    );

    expect(selected?.vendorName).toBe('Galeri 24');
  });
});
