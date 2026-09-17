import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { currentValue } from '../gold';
import { calculateNetWorth, creditCardLiabilities, splitCashBalances, type NetWorthInputs } from '../net-worth';

const BASE: NetWorthInputs = {
  totalCashAssets: 0n,
  totalCashLiabilities: 0n,
  totalCreditCardLiabilities: 0n,
  totalSavings: 0n,
  totalGoldValue: 0n,
  totalDepositValue: 0n,
  totalOtherAssets: 0n,
  totalDebts: 0n,
  totalReceivables: 0n,
  countReceivablesAsAsset: false,
};

const MONEY = fc.bigInt({ min: 0n, max: 1_000_000_000_00n });
const SIGNED_MONEY = fc.bigInt({ min: -1_000_000_000_00n, max: 1_000_000_000_00n });

describe('calculateNetWorth', () => {
  it('sums every asset line and subtracts every liability line', () => {
    const result = calculateNetWorth({
      ...BASE,
      totalCashAssets: 5_000_000_00n,
      totalSavings: 2_000_000_00n,
      totalGoldValue: 3_000_000_00n,
      totalDepositValue: 1_000_000_00n,
      totalOtherAssets: 500_000_00n,
      totalCashLiabilities: 200_000_00n,
      totalCreditCardLiabilities: 300_000_00n,
      totalDebts: 1_000_000_00n,
    });
    expect(result.totalAssets).toBe(11_500_000_00n);
    expect(result.totalLiabilities).toBe(1_500_000_00n);
    expect(result.netWorth).toBe(10_000_000_00n);
  });

  it('handles zero on both sides', () => {
    const result = calculateNetWorth(BASE);
    expect(result.netWorth).toBe(0n);
    expect(result.totalAssets).toBe(0n);
    expect(result.totalLiabilities).toBe(0n);
  });

  it('property: netWorth = totalAssets - totalLiabilities, always', () => {
    fc.assert(
      fc.property(
        MONEY,
        MONEY,
        MONEY,
        MONEY,
        MONEY,
        MONEY,
        MONEY,
        MONEY,
        fc.boolean(),
        (
          cash,
          savings,
          gold,
          deposits,
          other,
          cashLiab,
          ccLiab,
          debts,
          countReceivables,
        ) => {
          const result = calculateNetWorth({
            ...BASE,
            totalCashAssets: cash,
            totalSavings: savings,
            totalGoldValue: gold,
            totalDepositValue: deposits,
            totalOtherAssets: other,
            totalCashLiabilities: cashLiab,
            totalCreditCardLiabilities: ccLiab,
            totalDebts: debts,
            countReceivablesAsAsset: countReceivables,
          });
          expect(result.netWorth).toBe(result.totalAssets - result.totalLiabilities);
        },
      ),
    );
  });

  it('the breakdown sums EXACTLY to totalAssets/totalLiabilities — the "rincian menjumlah tepat ke total" acceptance criterion', () => {
    fc.assert(
      fc.property(MONEY, MONEY, MONEY, MONEY, MONEY, MONEY, MONEY, MONEY, (cash, savings, gold, deposits, other, cashLiab, ccLiab, debts) => {
        const result = calculateNetWorth({
          ...BASE,
          totalCashAssets: cash,
          totalSavings: savings,
          totalGoldValue: gold,
          totalDepositValue: deposits,
          totalOtherAssets: other,
          totalCashLiabilities: cashLiab,
          totalCreditCardLiabilities: ccLiab,
          totalDebts: debts,
        });
        const { assets, liabilities } = result.breakdown;
        const assetSum = assets.cash + assets.savings + assets.gold + assets.deposits + assets.otherAssets + assets.receivables;
        const liabilitySum = liabilities.cashOverdraft + liabilities.creditCards + liabilities.debts;
        expect(assetSum).toBe(result.totalAssets);
        expect(liabilitySum).toBe(result.totalLiabilities);
      }),
    );
  });

  describe('cash/bank/ewallet wallets (spec.md Komponen: "Hanya balance > 0; yang negatif masuk liabilitas")', () => {
    it('splitCashBalances: positive balances become assets, negative become liabilities at their absolute value', () => {
      const result = splitCashBalances([5_000_00n, -2_000_00n, 0n, -1_00n]);
      expect(result.assets).toBe(5_000_00n);
      expect(result.liabilities).toBe(2_001_00n);
    });

    it('property (I8): redistributing balances across wallets via a self-transfer never changes (assets - liabilities) — the sum of raw balances is transfer-invariant', () => {
      fc.assert(
        fc.property(SIGNED_MONEY, SIGNED_MONEY, MONEY, (a, b, amount) => {
          const before = splitCashBalances([a, b]);
          const netBefore = before.assets - before.liabilities;

          const after = splitCashBalances([a - amount, b + amount]);
          const netAfter = after.assets - after.liabilities;

          expect(netAfter).toBe(netBefore);
          // Also true independent of the split: assets - liabilities always
          // equals the raw sum of balances.
          expect(netBefore).toBe(a + b);
        }),
      );
    });

    it('a negative-balance wallet contributes to totalLiabilities, NOT to totalAssets', () => {
      const result = calculateNetWorth({ ...BASE, totalCashAssets: 0n, totalCashLiabilities: 500_000_00n });
      expect(result.breakdown.assets.cash).toBe(0n);
      expect(result.breakdown.liabilities.cashOverdraft).toBe(500_000_00n);
      expect(result.netWorth).toBe(-500_000_00n);
    });
  });

  describe('credit cards (spec.md Komponen: "Selalu liabilitas sebesar ABS(balance), tidak pernah aset")', () => {
    it('creditCardLiabilities: always the absolute value, regardless of stored sign', () => {
      fc.assert(
        fc.property(SIGNED_MONEY, (balance) => {
          expect(creditCardLiabilities([balance])).toBe(balance < 0n ? -balance : balance);
        }),
      );
    });

    it('property: a credit card liability NEVER adds to totalAssets, only ever subtracts via totalLiabilities', () => {
      fc.assert(
        fc.property(MONEY, MONEY, (cash, ccLiability) => {
          const result = calculateNetWorth({ ...BASE, totalCashAssets: cash, totalCreditCardLiabilities: ccLiability });
          expect(result.totalAssets).toBe(cash); // credit card never inflates assets
          expect(result.breakdown.liabilities.creditCards).toBe(ccLiability);
          expect(result.netWorth).toBe(cash - ccLiability);
        }),
      );
    });
  });

  describe('savings (Σ kontribusi non-void)', () => {
    it('property: moving an amount from cash to savings (a contribution) leaves the total unchanged — I8', () => {
      fc.assert(
        fc.property(MONEY, MONEY, MONEY, (cash, savings, contributionRaw) => {
          const contribution = contributionRaw > cash ? cash : contributionRaw; // never overdraws
          const before = calculateNetWorth({ ...BASE, totalCashAssets: cash, totalSavings: savings });
          const after = calculateNetWorth({
            ...BASE,
            totalCashAssets: cash - contribution,
            totalSavings: savings + contribution,
          });
          expect(after.netWorth).toBe(before.netWorth);
        }),
      );
    });
  });

  describe('gold (ADR-007: buyback price, never sell price)', () => {
    it('totalGoldValue depends ONLY on the buyback price — reusing gold.ts currentValue, never sellPricePerGram', () => {
      const grams = 100_0000n; // 100.0000g scaled
      const buyback = 1_190_000_00n;
      const sell = 1_250_000_00n; // deliberately higher — must NOT affect the total
      const valuedAtBuyback = currentValue(grams, buyback);
      const valuedAtSell = currentValue(grams, sell);
      expect(valuedAtBuyback).not.toBe(valuedAtSell);

      const result = calculateNetWorth({ ...BASE, totalGoldValue: valuedAtBuyback });
      expect(result.breakdown.assets.gold).toBe(valuedAtBuyback);
      expect(result.totalAssets).toBe(valuedAtBuyback);
      expect(result.totalAssets).not.toBe(valuedAtSell);
    });
  });

  describe('deposits (I10: principal only, at_maturity accrued interest excluded)', () => {
    it('totalDepositValue is used AS-IS — there is no accrued-interest field for calculateNetWorth to add', () => {
      // NetWorthInputs has no "accruedInterest" field at all (see this
      // file's import of the type) — this pins the exact figure passed in
      // as the ENTIRE deposits contribution, proving nothing is added on
      // top of the principal task 17's getTotalDepositValue already
      // resolved (see src/features/assets/deposits/queries.ts).
      const principalOnly = 50_000_000_00n;
      const result = calculateNetWorth({ ...BASE, totalDepositValue: principalOnly });
      expect(result.breakdown.assets.deposits).toBe(principalOnly);
      expect(result.totalAssets).toBe(principalOnly);
    });
  });

  describe('other assets (docs/03 §14.1: Σ aset_lain.current_value)', () => {
    it('totalOtherAssets adds directly to totalAssets', () => {
      const result = calculateNetWorth({ ...BASE, totalOtherAssets: 25_000_000_00n });
      expect(result.breakdown.assets.otherAssets).toBe(25_000_000_00n);
      expect(result.totalAssets).toBe(25_000_000_00n);
    });
  });

  describe('debts (docs/03 §14.1: always a liability, task 18)', () => {
    it('subtracts totalDebts from the total', () => {
      expect(calculateNetWorth({ ...BASE, totalCashAssets: 10_000_000_00n, totalDebts: 3_000_000_00n }).netWorth).toBe(
        7_000_000_00n,
      );
    });

    it('a debt larger than cash produces a negative net worth (correctly, not clamped to zero)', () => {
      expect(calculateNetWorth({ ...BASE, totalCashAssets: 1_000_000_00n, totalDebts: 5_000_000_00n }).netWorth).toBe(
        -4_000_000_00n,
      );
    });

    it('property: paying off part of a debt (wallet DOWN, remaining DOWN by the same amount) leaves net worth unchanged — I8', () => {
      fc.assert(
        fc.property(MONEY, MONEY, MONEY, (cash, debtRemaining, payment) => {
          const clampedPayment = payment > debtRemaining ? debtRemaining : payment;
          const clampedByCash = clampedPayment > cash ? cash : clampedPayment;
          const before = calculateNetWorth({ ...BASE, totalCashAssets: cash, totalDebts: debtRemaining });
          const after = calculateNetWorth({
            ...BASE,
            totalCashAssets: cash - clampedByCash,
            totalDebts: debtRemaining - clampedByCash,
          });
          expect(after.netWorth).toBe(before.netWorth);
        }),
      );
    });
  });

  describe('receivables (ADR-010: excluded from assets by default, task 18)', () => {
    it('does NOT add totalReceivables when countReceivablesAsAsset is false (the default)', () => {
      const result = calculateNetWorth({
        ...BASE,
        totalCashAssets: 10_000_000_00n,
        totalReceivables: 3_000_000_00n,
        countReceivablesAsAsset: false,
      });
      expect(result.netWorth).toBe(10_000_000_00n);
      expect(result.breakdown.assets.receivables).toBe(0n);
      // Still exposed separately, per ADR-010 ("tetap ditampilkan terpisah").
      expect(result.totalReceivables).toBe(3_000_000_00n);
    });

    it('adds totalReceivables when countReceivablesAsAsset is true (the opt-in setting)', () => {
      const result = calculateNetWorth({
        ...BASE,
        totalCashAssets: 10_000_000_00n,
        totalReceivables: 3_000_000_00n,
        countReceivablesAsAsset: true,
      });
      expect(result.netWorth).toBe(13_000_000_00n);
      expect(result.breakdown.assets.receivables).toBe(3_000_000_00n);
    });

    it('property: receiving part of a receivable (wallet UP, remaining DOWN by the same amount) leaves net worth unchanged when counted as an asset', () => {
      fc.assert(
        fc.property(MONEY, MONEY, MONEY, (cash, receivableRemaining, payment) => {
          const clampedPayment = payment > receivableRemaining ? receivableRemaining : payment;
          const before = calculateNetWorth({
            ...BASE,
            totalCashAssets: cash,
            totalReceivables: receivableRemaining,
            countReceivablesAsAsset: true,
          });
          const after = calculateNetWorth({
            ...BASE,
            totalCashAssets: cash + clampedPayment,
            totalReceivables: receivableRemaining - clampedPayment,
            countReceivablesAsAsset: true,
          });
          expect(after.netWorth).toBe(before.netWorth);
        }),
      );
    });

    it('property: when NOT counted as an asset, a receivable payment INCREASES net worth by the payment amount — ADR-010\'s conscious asymmetry, not an invariant', () => {
      fc.assert(
        fc.property(MONEY, MONEY, MONEY, (cash, receivableRemaining, payment) => {
          const clampedPayment = payment > receivableRemaining ? receivableRemaining : payment;
          const before = calculateNetWorth({
            ...BASE,
            totalCashAssets: cash,
            totalReceivables: receivableRemaining,
            countReceivablesAsAsset: false,
          });
          const after = calculateNetWorth({
            ...BASE,
            totalCashAssets: cash + clampedPayment,
            totalReceivables: receivableRemaining - clampedPayment,
            countReceivablesAsAsset: false,
          });
          expect(after.netWorth - before.netWorth).toBe(clampedPayment);
        }),
      );
    });
  });
});
