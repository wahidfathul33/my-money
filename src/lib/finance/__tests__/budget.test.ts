import { describe, expect, it } from 'vitest';
import { BUDGET_STATUS_COLOR, calculateBudgetStatus, needsAttention } from '../budget';
import type { Money } from '../money';

// Rp10.000,00 in minor units — a clean base so every threshold percentage
// below (79.9% / 80% / 99.9% / 100% / 150%) lands on an exact bigint cents
// value, no rounding ambiguity.
const AMOUNT: Money = 1_000_000n;

describe('calculateBudgetStatus — ambang (docs/03 §13: safe < 80% ≤ warning < 100% ≤ over)', () => {
  it('79.9% terpakai → safe, tepat di bawah ambang warning', () => {
    const result = calculateBudgetStatus(AMOUNT, 799_000n);
    expect(result.status).toBe('safe');
    expect(result.percent).toBeCloseTo(79.9, 5);
  });

  it('80% terpakai → warning (inklusif, ambang bawah)', () => {
    const result = calculateBudgetStatus(AMOUNT, 800_000n);
    expect(result.status).toBe('warning');
    expect(result.percent).toBe(80);
  });

  it('99.9% terpakai → warning, tepat di bawah ambang over', () => {
    const result = calculateBudgetStatus(AMOUNT, 999_000n);
    expect(result.status).toBe('warning');
    expect(result.percent).toBeCloseTo(99.9, 5);
  });

  it('100% terpakai → over (inklusif, ambang bawah)', () => {
    const result = calculateBudgetStatus(AMOUNT, 1_000_000n);
    expect(result.status).toBe('over');
    expect(result.percent).toBe(100);
  });

  it('150% terpakai → over, jauh melewati batas', () => {
    const result = calculateBudgetStatus(AMOUNT, 1_500_000n);
    expect(result.status).toBe('over');
    expect(result.percent).toBe(150);
  });

  it('0% terpakai → safe', () => {
    const result = calculateBudgetStatus(AMOUNT, 0n);
    expect(result.status).toBe('safe');
    expect(result.percent).toBe(0);
  });

  it('truncates sub-basis-point fractions without crossing a threshold incorrectly', () => {
    // 7999.999...bp — floors to 7999bp (79.99%), correctly still safe.
    expect(calculateBudgetStatus(3n, 2n).status).toBe('safe'); // 2/3 = 66.67%
    expect(calculateBudgetStatus(1_000_000_000n, 799_999_999n).status).toBe('safe'); // 79.9999999%
    expect(calculateBudgetStatus(1_000_000_000n, 800_000_000n).status).toBe('warning'); // exactly 80%
  });
});

describe('calculateBudgetStatus — amount = 0 tidak menyebabkan pembagian nol', () => {
  it('amount 0, spent 0 → safe, 0%', () => {
    expect(calculateBudgetStatus(0n, 0n)).toEqual({ status: 'safe', percent: 0 });
  });

  it('amount 0, spent > 0 → over, tanpa NaN/Infinity yang lolos tak sengaja ke logika status', () => {
    const result = calculateBudgetStatus(0n, 50_000n);
    expect(result.status).toBe('over');
    expect(Number.isNaN(result.percent)).toBe(false);
  });

  it('amount negatif (data tidak valid) diperlakukan sama seperti nol, bukan melempar', () => {
    expect(() => calculateBudgetStatus(-1000n, 500n)).not.toThrow();
    expect(calculateBudgetStatus(-1000n, 500n).status).toBe('over');
    expect(calculateBudgetStatus(-1000n, 0n).status).toBe('safe');
  });
});

describe('needsAttention — dashboard cutoff (docs/09 §1: hanya budget ≥ 80%)', () => {
  it('false di bawah 80%', () => {
    expect(needsAttention(AMOUNT, 799_000n)).toBe(false);
  });

  it('true persis di 80%', () => {
    expect(needsAttention(AMOUNT, 800_000n)).toBe(true);
  });

  it('true saat over', () => {
    expect(needsAttention(AMOUNT, 1_500_000n)).toBe(true);
  });
});

describe('BUDGET_STATUS_COLOR', () => {
  it('punya entri warna untuk ketiga status', () => {
    expect(Object.keys(BUDGET_STATUS_COLOR).sort()).toEqual(['over', 'safe', 'warning']);
  });
});
