import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calculateNetWorth } from '../net-worth';

describe('calculateNetWorth', () => {
  it('sums cash and savings', () => {
    expect(calculateNetWorth({ totalCash: 5_000_000_00n, totalSavings: 2_000_000_00n })).toBe(
      7_000_000_00n,
    );
  });

  it('handles zero on both sides', () => {
    expect(calculateNetWorth({ totalCash: 0n, totalSavings: 0n })).toBe(0n);
  });

  it('property: moving an amount from cash to savings (a contribution) leaves the total unchanged', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
        fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
        fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
        (cash, savings, contribution) => {
          const before = calculateNetWorth({ totalCash: cash, totalSavings: savings });
          const after = calculateNetWorth({
            totalCash: cash - contribution,
            totalSavings: savings + contribution,
          });
          expect(after).toBe(before);
        },
      ),
    );
  });
});
