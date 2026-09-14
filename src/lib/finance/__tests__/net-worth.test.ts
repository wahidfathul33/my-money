import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calculateNetWorth } from '../net-worth';

const BASE = { totalCash: 0n, totalSavings: 0n, totalDebts: 0n, totalReceivables: 0n, countReceivablesAsAsset: false };

describe('calculateNetWorth', () => {
  it('sums cash and savings', () => {
    expect(calculateNetWorth({ ...BASE, totalCash: 5_000_000_00n, totalSavings: 2_000_000_00n })).toBe(
      7_000_000_00n,
    );
  });

  it('handles zero on both sides', () => {
    expect(calculateNetWorth(BASE)).toBe(0n);
  });

  it('property: moving an amount from cash to savings (a contribution) leaves the total unchanged', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
        fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
        fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
        (cash, savings, contribution) => {
          const before = calculateNetWorth({ ...BASE, totalCash: cash, totalSavings: savings });
          const after = calculateNetWorth({
            ...BASE,
            totalCash: cash - contribution,
            totalSavings: savings + contribution,
          });
          expect(after).toBe(before);
        },
      ),
    );
  });

  describe('debts (docs/03 §14.1: always a liability, task 18)', () => {
    it('subtracts totalDebts from the total', () => {
      expect(
        calculateNetWorth({ ...BASE, totalCash: 10_000_000_00n, totalDebts: 3_000_000_00n }),
      ).toBe(7_000_000_00n);
    });

    it('a debt larger than cash produces a negative net worth (correctly, not clamped to zero)', () => {
      expect(calculateNetWorth({ ...BASE, totalCash: 1_000_000_00n, totalDebts: 5_000_000_00n })).toBe(
        -4_000_000_00n,
      );
    });

    it('property: paying off part of a debt (wallet DOWN, remaining DOWN by the same amount) leaves net worth unchanged — I8/docs/03 §14.3.4', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
          fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
          fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
          (cash, debtRemaining, payment) => {
            const before = calculateNetWorth({ ...BASE, totalCash: cash, totalDebts: debtRemaining });
            // A real payment can never exceed what's left (OverpaymentError
            // guards this in the service) — clamp so this property only
            // ever explores reachable states.
            const clampedPayment = payment > debtRemaining ? debtRemaining : payment;
            const after = calculateNetWorth({
              ...BASE,
              totalCash: cash - clampedPayment, // wallet DOWN
              totalDebts: debtRemaining - clampedPayment, // remaining DOWN, same amount
            });
            expect(after).toBe(before);
          },
        ),
      );
    });
  });

  describe('receivables (ADR-010: excluded from assets by default, task 18)', () => {
    it('does NOT add totalReceivables when countReceivablesAsAsset is false (the default)', () => {
      expect(
        calculateNetWorth({
          ...BASE,
          totalCash: 10_000_000_00n,
          totalReceivables: 3_000_000_00n,
          countReceivablesAsAsset: false,
        }),
      ).toBe(10_000_000_00n);
    });

    it('adds totalReceivables when countReceivablesAsAsset is true (the opt-in setting)', () => {
      expect(
        calculateNetWorth({
          ...BASE,
          totalCash: 10_000_000_00n,
          totalReceivables: 3_000_000_00n,
          countReceivablesAsAsset: true,
        }),
      ).toBe(13_000_000_00n);
    });

    it('property: receiving part of a receivable (wallet UP, remaining DOWN by the same amount) leaves net worth unchanged when counted as an asset', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
          fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
          fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
          (cash, receivableRemaining, payment) => {
            const clampedPayment = payment > receivableRemaining ? receivableRemaining : payment;
            const before = calculateNetWorth({
              ...BASE,
              totalCash: cash,
              totalReceivables: receivableRemaining,
              countReceivablesAsAsset: true,
            });
            const after = calculateNetWorth({
              ...BASE,
              totalCash: cash + clampedPayment, // wallet UP
              totalReceivables: receivableRemaining - clampedPayment, // remaining DOWN, same amount
              countReceivablesAsAsset: true,
            });
            expect(after).toBe(before);
          },
        ),
      );
    });

    it('property: when NOT counted as an asset, a receivable payment INCREASES net worth by the payment amount — ADR-010\'s conscious asymmetry, not an invariant', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
          fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
          fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
          (cash, receivableRemaining, payment) => {
            const clampedPayment = payment > receivableRemaining ? receivableRemaining : payment;
            const before = calculateNetWorth({
              ...BASE,
              totalCash: cash,
              totalReceivables: receivableRemaining,
              countReceivablesAsAsset: false,
            });
            const after = calculateNetWorth({
              ...BASE,
              totalCash: cash + clampedPayment,
              totalReceivables: receivableRemaining - clampedPayment,
              countReceivablesAsAsset: false,
            });
            // Cash rose by `clampedPayment` but the receivable was never in
            // the sum to begin with — net worth moves BY the payment here,
            // which is the correct (if slightly odd-looking) consequence of
            // ADR-010's conservatism: money that arrives from a receivable
            // you never counted as an asset shows up as a genuine INCREASE
            // once it lands as cash. This test exists to make that
            // consequence explicit and pinned down, not to assert
            // invariance.
            expect(after - before).toBe(clampedPayment);
          },
        ),
      );
    });
  });
});
