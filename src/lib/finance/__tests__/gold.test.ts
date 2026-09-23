import { describe, expect, it } from 'vitest';
import {
  GRAM_SCALE,
  averageCostPerGram,
  computeSale,
  currentValue,
  formatGramsDisplay,
  formatGramsForDb,
  gramsToMoney,
  isPriceStale,
  lotCostBasis,
  parseGrams,
  priceAgeDays,
  totalCostBasis,
  totalRemainingGrams,
  unrealizedGain,
  type GoldLotForSale,
} from '../gold';

describe('parseGrams / formatGramsForDb / formatGramsDisplay', () => {
  it('round-trips a whole number', () => {
    expect(parseGrams('10')).toBe(100_000n);
    expect(formatGramsForDb(100_000n)).toBe('10.0000');
    expect(formatGramsDisplay(100_000n)).toBe('10');
  });

  it('round-trips a fractional weight to 4 decimals', () => {
    expect(parseGrams('2.1234')).toBe(21_234n);
    expect(formatGramsForDb(21_234n)).toBe('2.1234');
    expect(formatGramsDisplay(21_234n)).toBe('2,1234');
  });

  it('pads a short fraction', () => {
    expect(parseGrams('10.5')).toBe(105_000n);
    expect(formatGramsForDb(105_000n)).toBe('10.5000');
    expect(formatGramsDisplay(105_000n)).toBe('10,5');
  });

  it('rejects a float-unsafe or malformed string', () => {
    expect(() => parseGrams('abc')).toThrow(RangeError);
    expect(() => parseGrams('-1')).toThrow(RangeError);
    expect(() => parseGrams('1.23456')).toThrow(RangeError);
  });

  it('formats a large gram-scaled value with Indonesian grouping', () => {
    expect(formatGramsDisplay(parseGrams('1000'))).toBe('1.000');
  });

  it('rejects negative grams — a defensive guard against corrupted caller data', () => {
    // These two functions read already-parsed `Grams`, not user input
    // (parseGrams itself already rejects a negative STRING) — the guard
    // here is for a caller passing a corrupted/negative value directly,
    // e.g. a stale `remaining_grams` read before its own validation.
    expect(() => formatGramsForDb(-1n)).toThrow(RangeError);
    expect(() => formatGramsDisplay(-1n)).toThrow(RangeError);
  });
});

describe('gramsToMoney — explicit half-up rounding, never float', () => {
  it('multiplies weight by price per gram exactly', () => {
    // 10 grams x Rp1.190.000/gram = Rp11.900.000 -> 1_190_000_00n minor units
    expect(gramsToMoney(parseGrams('10'), 1_190_000_00n)).toBe(11_900_000_00n);
  });

  it('rounds half-up on a fractional result', () => {
    // 0.0001g x Rp3/unit-price is a contrived case to exercise rounding —
    // 1 scaled unit x 3 / 10000 = 0.0003 -> rounds to 0.
    expect(gramsToMoney(1n, 3n)).toBe(0n);
    // 1 scaled unit x 5000 / 10000 = 0.5 -> half-up rounds to 1.
    expect(gramsToMoney(1n, 5_000n)).toBe(1n);
  });
});

describe('averageCostPerGram — weighted average over remaining grams', () => {
  it('returns the single price for one lot', () => {
    const lots = [{ remainingGrams: parseGrams('10'), purchasePricePerGram: 1_000_000_00n }];
    expect(averageCostPerGram(lots)).toBe(1_000_000_00n);
  });

  it('weights multiple lots at different prices by remaining grams', () => {
    // 10g @ Rp1.000.000 + 5g @ Rp1.300.000 -> (10_000_000 + 6_500_000) / 15
    // = 16_500_000 / 15 = 1_100_000 exactly.
    const lots = [
      { remainingGrams: parseGrams('10'), purchasePricePerGram: 1_000_000_00n },
      { remainingGrams: parseGrams('5'), purchasePricePerGram: 1_300_000_00n },
    ];
    expect(averageCostPerGram(lots)).toBe(1_100_000_00n);
  });

  it('ignores lots with zero remaining grams by contributing nothing to the sum', () => {
    const lots = [
      { remainingGrams: parseGrams('10'), purchasePricePerGram: 1_000_000_00n },
      { remainingGrams: 0n, purchasePricePerGram: 5_000_000_00n },
    ];
    expect(averageCostPerGram(lots)).toBe(1_000_000_00n);
  });

  it('returns 0 for an empty holding rather than dividing by zero', () => {
    expect(averageCostPerGram([])).toBe(0n);
    expect(averageCostPerGram([{ remainingGrams: 0n, purchasePricePerGram: 1_000_000_00n }])).toBe(0n);
  });

  it('handles a fractional weight lot', () => {
    const lots = [{ remainingGrams: parseGrams('0.5'), purchasePricePerGram: 1_200_000_00n }];
    expect(averageCostPerGram(lots)).toBe(1_200_000_00n);
  });

  it('throws when total remaining grams is negative — corrupted lot data, never a valid state reachable via parseGrams', () => {
    // parseGrams itself rejects a negative STRING, so this can only happen
    // if a caller constructs a GoldLotInput directly with a corrupted
    // value (e.g. a stale DB read bypassing the sg_current_nonneg-style
    // CHECK constraint's equivalent for gold_lots.remaining_grams) — the
    // internal roundHalfUp helper's "denominator must be positive" guard
    // is the last line of defense in the pure-function layer.
    const lots = [{ remainingGrams: -5000n, purchasePricePerGram: 1_000_000_00n }];
    expect(() => averageCostPerGram(lots)).toThrow(RangeError);
  });

  it('rounds a negative numerator half-up, away from zero — mirrors money.ts multiplyRatio\'s symmetric rounding', () => {
    // A negative purchasePricePerGram is nonsensical business data, but the
    // pure rounding function doesn't know that — it just needs to round
    // correctly regardless of sign, same discipline as money.ts's own
    // multiplyRatio (src/lib/finance/__tests__/money.test.ts "rounds a
    // negative exact-half result away from zero").
    // numerator = 10*(-100) + 5*0 = -1000; total = 15; half = 15/2 = 7 (bigint floor)
    // negative path: (numerator - half) / denominator = (-1000 - 7) / 15 = -67
    const lots = [
      { remainingGrams: 10n, purchasePricePerGram: -100n },
      { remainingGrams: 5n, purchasePricePerGram: 0n },
    ];
    expect(averageCostPerGram(lots)).toBe(-67n);
  });
});

describe('currentValue — ALWAYS the buyback price (ADR-007)', () => {
  it('values total grams at the buyback price per gram', () => {
    expect(currentValue(parseGrams('55'), 1_190_000_00n)).toBe(65_450_000_00n);
  });

  it('is lower than valuing at the sell price — the buy/sell spread', () => {
    const grams = parseGrams('10');
    const sellPrice = 1_250_000_00n;
    const buybackPrice = 1_190_000_00n;
    expect(currentValue(grams, buybackPrice)).toBeLessThan(currentValue(grams, sellPrice));
  });
});

describe('unrealizedGain', () => {
  it('is positive when buyback price rose above purchase price', () => {
    const lots = [{ remainingGrams: parseGrams('10'), purchasePricePerGram: 1_050_000_00n }];
    // current value 10 x 1_190_000 = 11_900_000; cost basis 10 x 1_050_000 = 10_500_000
    expect(unrealizedGain(lots, 1_190_000_00n)).toBe(1_400_000_00n);
  });

  it('is negative when buyback price fell below purchase price', () => {
    const lots = [{ remainingGrams: parseGrams('10'), purchasePricePerGram: 1_300_000_00n }];
    expect(unrealizedGain(lots, 1_190_000_00n)).toBe(-1_100_000_00n);
  });

  it('is zero for an empty holding', () => {
    expect(unrealizedGain([], 1_190_000_00n)).toBe(0n);
  });

  it('matches totalCostBasis/lotCostBasis building blocks', () => {
    const lots = [
      { remainingGrams: parseGrams('10'), purchasePricePerGram: 1_050_000_00n },
      { remainingGrams: parseGrams('5'), purchasePricePerGram: 1_300_000_00n },
    ];
    const total = totalRemainingGrams(lots);
    const expectedGain = currentValue(total, 1_190_000_00n) - totalCostBasis(lots);
    expect(unrealizedGain(lots, 1_190_000_00n)).toBe(expectedGain);
    expect(totalCostBasis(lots)).toBe(lots.reduce((s, l) => s + lotCostBasis(l), 0n));
  });
});

describe('computeSale', () => {
  const lot = (id: string, grams: string, price: bigint): GoldLotForSale => ({
    id,
    remainingGrams: parseGrams(grams),
    purchasePricePerGram: price,
  });

  it('sells a fraction of a single lot', () => {
    const lots = [lot('a', '10', 1_050_000_00n)];
    const sale = computeSale(lots, parseGrams('4'), 1_190_000_00n);

    expect(sale.proceeds).toBe(gramsToMoney(parseGrams('4'), 1_190_000_00n));
    expect(sale.costBasis).toBe(gramsToMoney(parseGrams('4'), 1_050_000_00n));
    expect(sale.realizedGain).toBe(sale.proceeds - sale.costBasis);
    expect(sale.reductions).toEqual([{ lotId: 'a', reduceBy: parseGrams('4') }]);
  });

  it('sells the entirety of a single lot', () => {
    const lots = [lot('a', '10', 1_050_000_00n)];
    const sale = computeSale(lots, parseGrams('10'), 1_190_000_00n);
    expect(sale.reductions).toEqual([{ lotId: 'a', reduceBy: parseGrams('10') }]);
  });

  it('distributes a partial sale proportionally across multiple lots at different prices', () => {
    // 10g @ 1_000_000 and 5g @ 1_300_000 -> total 15g, avg cost 1_100_000 (see above test)
    const lots = [lot('a', '10', 1_000_000_00n), lot('b', '5', 1_300_000_00n)];
    const gramsSold = parseGrams('6'); // 40% of the 15g total
    const sale = computeSale(lots, gramsSold, 1_190_000_00n);

    // Proportional: lot a loses 4g (10 * 6/15), lot b loses 2g (5 * 6/15) — exact, no remainder.
    expect(sale.reductions).toEqual(
      expect.arrayContaining([
        { lotId: 'a', reduceBy: parseGrams('4') },
        { lotId: 'b', reduceBy: parseGrams('2') },
      ]),
    );
    const totalReduced = sale.reductions.reduce((s, r) => s + r.reduceBy, 0n);
    expect(totalReduced).toBe(gramsSold);

    expect(sale.costBasis).toBe(gramsToMoney(gramsSold, 1_100_000_00n));
    expect(sale.realizedGain).toBe(sale.proceeds - sale.costBasis);
  });

  it('sells everything across multiple uneven lots without any lot going negative', () => {
    const lots = [lot('a', '0.0001', 1_000_000_00n), lot('b', '99.9999', 1_300_000_00n), lot('c', '3.3333', 900_000_00n)];
    const total = totalRemainingGrams(lots);
    const sale = computeSale(lots, total, 1_190_000_00n);

    const totalReduced = sale.reductions.reduce((s, r) => s + r.reduceBy, 0n);
    expect(totalReduced).toBe(total);
    for (const lotDef of lots) {
      const reduction = sale.reductions.find((r) => r.lotId === lotDef.id)!;
      expect(reduction.reduceBy).toBe(lotDef.remainingGrams); // fully liquidated, exactly
      expect(reduction.reduceBy).toBeLessThanOrEqual(lotDef.remainingGrams);
    }
  });

  it('handles fractional weights whose proportional split needs the largest-remainder tiebreak', () => {
    // Three equal 1g lots, sell 1g total -> each "wants" exactly 1/3 (0.3333...),
    // floors to 0.3333g each (33333333 raw before scale -> exact scaled value),
    // with 1 leftover scaled unit going to whichever lot has the largest remainder.
    const lots = [lot('a', '1', 1_000_000_00n), lot('b', '1', 1_000_000_00n), lot('c', '1', 1_000_000_00n)];
    const sale = computeSale(lots, parseGrams('1'), 1_190_000_00n);

    const totalReduced = sale.reductions.reduce((s, r) => s + r.reduceBy, 0n);
    expect(totalReduced).toBe(parseGrams('1'));
    for (const r of sale.reductions) {
      expect(r.reduceBy).toBeGreaterThanOrEqual(0n);
      expect(r.reduceBy).toBeLessThanOrEqual(parseGrams('1'));
    }
  });

  it('throws on a non-positive sale amount', () => {
    const lots = [lot('a', '10', 1_050_000_00n)];
    expect(() => computeSale(lots, 0n, 1_190_000_00n)).toThrow(RangeError);
    expect(() => computeSale(lots, -1n, 1_190_000_00n)).toThrow(RangeError);
  });

  it('throws when selling more than total remaining grams', () => {
    const lots = [lot('a', '10', 1_050_000_00n)];
    expect(() => computeSale(lots, parseGrams('10.0001'), 1_190_000_00n)).toThrow(RangeError);
  });

  it('awards leftover scaled-gram units to the largest remainder first, among THREE distinct remainders', () => {
    // The existing "three equal 1g lots" test above always ties (every
    // remainder identical), which only ever exercises the comparator's
    // "equal" branch — never proves the actual largest-remainder ORDERING
    // logic. Raw (unscaled) inputs here, not parseGrams, purely to keep the
    // arithmetic exact and easy to hand-verify:
    //   a: remainingGrams=5 -> product=7*5=35 -> floor=3, remainder=5
    //   b: remainingGrams=3 -> product=7*3=21 -> floor=2, remainder=1
    //   c: remainingGrams=2 -> product=7*2=14 -> floor=1, remainder=4
    // sum(floors)=6, leftover=7-6=1 scaled unit, awarded to the largest
    // remainder (a=5) — descending order a(5) > c(4) > b(1) exercises BOTH
    // the "<" and ">" branches of the sort comparator across the three
    // pairwise comparisons a real 3-element sort makes.
    const lots: GoldLotForSale[] = [
      { id: 'a', remainingGrams: 5n, purchasePricePerGram: 1_000_000_00n },
      { id: 'b', remainingGrams: 3n, purchasePricePerGram: 1_000_000_00n },
      { id: 'c', remainingGrams: 2n, purchasePricePerGram: 1_000_000_00n },
    ];
    const sale = computeSale(lots, 7n, 1_190_000_00n);

    const byId = new Map(sale.reductions.map((r) => [r.lotId, r.reduceBy]));
    expect(byId.get('a')).toBe(4n); // floor 3 + the 1 leftover unit
    expect(byId.get('b')).toBe(2n); // floor 2, no leftover (smallest remainder)
    expect(byId.get('c')).toBe(1n); // floor 1, no leftover
    expect([...byId.values()].reduce((s, v) => s + v, 0n)).toBe(7n);
  });
});

describe('priceAgeDays / isPriceStale', () => {
  it('is 0 for a price dated today', () => {
    expect(priceAgeDays('2026-03-12', '2026-03-12')).toBe(0);
  });

  it('counts whole days elapsed', () => {
    expect(priceAgeDays('2026-03-12', '2026-03-14')).toBe(2);
  });

  it('is not stale at exactly 30 days', () => {
    expect(isPriceStale(30)).toBe(false);
  });

  it('is stale at 31 days', () => {
    expect(isPriceStale(31)).toBe(true);
  });

  it('defaults `today` to the real current UTC date when omitted', () => {
    // Every other test in this describe block passes `today` explicitly
    // for determinism (this function's own doc comment recommends exactly
    // that) — which means the `today = todayIso()` default parameter
    // itself is never otherwise exercised. A price dated today (computed
    // the same way, via `new Date().toISOString().slice(0, 10)`) must
    // still read as age 0 through the real default, not just the
    // explicit-today path already covered above.
    const today = new Date().toISOString().slice(0, 10);
    expect(priceAgeDays(today)).toBe(0);
  });
});

describe('GRAM_SCALE sanity', () => {
  it('matches NUMERIC(18,4) — 4 decimal places', () => {
    expect(GRAM_SCALE).toBe(10_000n);
  });
});
