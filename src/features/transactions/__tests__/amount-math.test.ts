import { describe, expect, it } from 'vitest';
import {
  appendDecimalPoint,
  appendDigits,
  appendOperator,
  backspace,
  evaluateExpression,
  formatExpression,
  moneyToExpression,
} from '../amount-math';

describe('amount-math', () => {
  describe('appendDigits', () => {
    it('appends single digits', () => {
      expect(appendDigits('', '4')).toBe('4');
      expect(appendDigits('4', '5')).toBe('45');
    });

    it('appends the "000" shortcut', () => {
      expect(appendDigits('45', '000')).toBe('45000');
    });

    it('caps a single term at a defensive digit limit', () => {
      const huge = '1'.repeat(15);
      expect(appendDigits(huge, '9')).toBe(huge); // no further growth
    });
  });

  describe('appendDecimalPoint', () => {
    it('starts a fresh term as "0."', () => {
      expect(appendDecimalPoint('')).toBe('0.');
    });

    it('appends "." to a non-empty term', () => {
      expect(appendDecimalPoint('45')).toBe('45.');
    });

    it('is a no-op if the current term already has a decimal point', () => {
      expect(appendDecimalPoint('45.5')).toBe('45.5');
    });

    it('applies to the term after an operator, not the whole expression', () => {
      expect(appendDecimalPoint('45000+12')).toBe('45000+12.');
    });
  });

  describe('appendOperator', () => {
    it('cannot lead the expression', () => {
      expect(appendOperator('', '+')).toBe('');
    });

    it('appends after a term', () => {
      expect(appendOperator('45000', '+')).toBe('45000+');
    });

    it('replaces a trailing operator instead of stacking', () => {
      expect(appendOperator('45000+', '-')).toBe('45000-');
    });
  });

  describe('backspace', () => {
    it('removes the last character', () => {
      expect(backspace('45000')).toBe('4500');
      expect(backspace('45000+')).toBe('45000');
      expect(backspace('')).toBe('');
    });
  });

  describe('evaluateExpression', () => {
    it('evaluates a bare number to minor units', () => {
      expect(evaluateExpression('45000')).toBe(4_500_000n);
    });

    it('returns 0 for an empty expression', () => {
      expect(evaluateExpression('')).toBe(0n);
    });

    it('evaluates a chained addition sequentially', () => {
      expect(evaluateExpression('45000+12000')).toBe(5_700_000n);
    });

    it('evaluates a chained mix of + and - sequentially', () => {
      // 45000 + 12000 - 5000 = 52000
      expect(evaluateExpression('45000+12000-5000')).toBe(5_200_000n);
    });

    it('ignores a trailing operator with no second term yet', () => {
      expect(evaluateExpression('45000+')).toBe(4_500_000n);
    });

    it('handles decimal terms', () => {
      expect(evaluateExpression('45.5')).toBe(4_550n);
    });

    it('never lets the total go negative from chained subtraction beyond zero (still computes the true signed sum)', () => {
      expect(evaluateExpression('5000-12000')).toBe(-700_000n);
    });
  });

  describe('moneyToExpression', () => {
    it('formats a whole-rupiah amount with no decimal point', () => {
      expect(moneyToExpression(4_500_000n)).toBe('45000');
    });

    it('formats an amount with cents', () => {
      expect(moneyToExpression(4_550n)).toBe('45.50');
    });

    it('drops the sign — the keypad expression never encodes it', () => {
      expect(moneyToExpression(-4_500_000n)).toBe('45000');
    });

    it('round-trips through evaluateExpression', () => {
      const amount = 12_345_600n;
      expect(evaluateExpression(moneyToExpression(amount))).toBe(amount);
    });
  });

  describe('formatExpression', () => {
    it('shows "0" for an empty expression', () => {
      expect(formatExpression('')).toBe('0');
    });

    it('groups thousands per term', () => {
      expect(formatExpression('1500000')).toBe('1.500.000');
    });

    it('spaces operators between formatted terms', () => {
      expect(formatExpression('45000+12000')).toBe('45.000 + 12.000');
    });

    it('renders a trailing operator with nothing after it yet', () => {
      expect(formatExpression('45000+')).toBe('45.000 + ');
    });

    it('uses a comma for the decimal part, minus sign (U+2212) for subtraction', () => {
      expect(formatExpression('45000-12,5'.replace(',', '.'))).toBe('45.000 − 12,5');
    });
  });
});
