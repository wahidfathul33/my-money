import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calculateGoalProgress, suggestedMonthlyPerMember } from '../savings';

describe('calculateGoalProgress', () => {
  const base = {
    targetAmount: 10_000_000_00n, // Rp10.000.000
    currentAmount: 0n,
    targetDate: null as string | null,
    today: '2026-01-01',
  };

  it('computes progress_pct as current/target × 100', () => {
    const result = calculateGoalProgress({ ...base, currentAmount: 2_500_000_00n });
    expect(result.progressPct).toBe(25);
  });

  it('caps progress_pct at 100 even when current exceeds target (over-funded goal)', () => {
    const result = calculateGoalProgress({ ...base, currentAmount: 12_000_000_00n });
    expect(result.progressPct).toBe(100);
  });

  it('remaining_amount is MAX(0, target − current)', () => {
    const result = calculateGoalProgress({ ...base, currentAmount: 4_000_000_00n });
    expect(result.remainingAmount).toBe(6_000_000_00n);
  });

  it('remaining_amount floors at 0 for an over-funded goal — never negative', () => {
    const result = calculateGoalProgress({ ...base, currentAmount: 12_000_000_00n });
    expect(result.remainingAmount).toBe(0n);
  });

  it('target tercapai: isCompleted true exactly at current === target', () => {
    const result = calculateGoalProgress({ ...base, currentAmount: base.targetAmount });
    expect(result.isCompleted).toBe(true);
    expect(result.progressPct).toBe(100);
    expect(result.remainingAmount).toBe(0n);
  });

  it('not yet completed one rupiah below target', () => {
    const result = calculateGoalProgress({ ...base, currentAmount: base.targetAmount - 1n });
    expect(result.isCompleted).toBe(false);
  });

  it('months_remaining/suggested_monthly are null when there is no targetDate', () => {
    const result = calculateGoalProgress({ ...base, currentAmount: 1_000_000_00n, targetDate: null });
    expect(result.monthsRemaining).toBeNull();
    expect(result.suggestedMonthly).toBeNull();
    expect(result.isOverdue).toBe(false);
  });

  it('months_remaining = ceil(days / 30.44) for a future target date', () => {
    // 2026-01-01 -> 2026-04-01 is 90 days. 90 / 30.44 = 2.956... -> ceil = 3.
    const result = calculateGoalProgress({ ...base, targetDate: '2026-04-01' });
    expect(result.monthsRemaining).toBe(3);
  });

  it('suggested_monthly = ceil(remaining / months_remaining) when months_remaining > 0', () => {
    // Rp10.000.000 remaining (= 1_000_000_000 minor units) over 3 months:
    // ceil(1_000_000_000 / 3) = 333_333_334 minor units (Rp3.333.333,34, rounded UP).
    const result = calculateGoalProgress({ ...base, targetDate: '2026-04-01' });
    expect(result.monthsRemaining).toBe(3);
    expect(result.suggestedMonthly).toBe(333_333_334n);
  });

  it('target terlewat: isOverdue true when target date has passed and goal is not funded', () => {
    const result = calculateGoalProgress({ ...base, targetDate: '2025-12-01', today: '2026-01-01' });
    expect(result.isOverdue).toBe(true);
    // Never a negative number for months_remaining's consumer to render directly —
    // the raw value CAN be <= 0 (that's what isOverdue is for), but it must never
    // be mistaken for "still on track". The UI layer substitutes "Target terlewat".
    expect(result.monthsRemaining).toBeLessThanOrEqual(0);
  });

  it('sisa 0 / months_remaining 0 (target date is today): suggested_monthly falls back to remaining_amount, not a divide-by-zero', () => {
    const result = calculateGoalProgress({ ...base, currentAmount: 4_000_000_00n, targetDate: '2026-01-01', today: '2026-01-01' });
    expect(result.monthsRemaining).toBe(0);
    expect(result.suggestedMonthly).toBe(result.remainingAmount);
    expect(result.suggestedMonthly).toBe(6_000_000_00n);
  });

  it('overdue but already completed: isOverdue is false (completion wins over lateness)', () => {
    const result = calculateGoalProgress({
      ...base,
      currentAmount: base.targetAmount,
      targetDate: '2025-01-01',
      today: '2026-01-01',
    });
    expect(result.isCompleted).toBe(true);
    expect(result.isOverdue).toBe(false);
  });

  it('a fully overdue goal still reports suggested_monthly as the full remaining amount (pay-it-now fallback)', () => {
    const result = calculateGoalProgress({
      ...base,
      currentAmount: 1_000_000_00n,
      targetDate: '2025-01-01', // ~1 year ago
      today: '2026-01-01',
    });
    expect(result.monthsRemaining).toBeLessThan(0);
    expect(result.suggestedMonthly).toBe(result.remainingAmount);
  });

  it('rejects a non-positive targetAmount', () => {
    expect(() => calculateGoalProgress({ ...base, targetAmount: 0n })).toThrow(RangeError);
    expect(() => calculateGoalProgress({ ...base, targetAmount: -1n })).toThrow(RangeError);
  });

  it('rejects a negative currentAmount', () => {
    expect(() => calculateGoalProgress({ ...base, currentAmount: -1n })).toThrow(RangeError);
  });

  it('property: progress_pct is always within [0, 100] for any non-negative current/positive target', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 1_000_000_000_000n }),
        fc.bigInt({ min: 0n, max: 2_000_000_000_000n }),
        (targetAmount, currentAmount) => {
          const result = calculateGoalProgress({ targetAmount, currentAmount, targetDate: null });
          expect(result.progressPct).toBeGreaterThanOrEqual(0);
          expect(result.progressPct).toBeLessThanOrEqual(100);
        },
      ),
    );
  });

  it('property: remaining_amount + current_amount >= target_amount always holds (remaining never lets the total undershoot)', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 1_000_000_000_000n }),
        fc.bigInt({ min: 0n, max: 2_000_000_000_000n }),
        (targetAmount, currentAmount) => {
          const result = calculateGoalProgress({ targetAmount, currentAmount, targetDate: null });
          expect(currentAmount + result.remainingAmount).toBeGreaterThanOrEqual(targetAmount);
          expect(result.remainingAmount).toBeGreaterThanOrEqual(0n);
        },
      ),
    );
  });
});

describe('suggestedMonthlyPerMember', () => {
  it('divides the suggested monthly amount evenly, rounding up', () => {
    // Rp1.000.001 = 100_000_100 minor units, across 3 members:
    // ceil(100_000_100 / 3) = 33_333_367 minor units.
    expect(suggestedMonthlyPerMember(1_000_001_00n, 3)).toBe(33_333_367n);
  });

  it('divides exactly when it splits evenly', () => {
    expect(suggestedMonthlyPerMember(9_000_000_00n, 3)).toBe(3_000_000_00n);
  });

  it('returns the full amount for a single member', () => {
    expect(suggestedMonthlyPerMember(500_000_00n, 1)).toBe(500_000_00n);
  });

  it('returns 0 for a zero suggested amount', () => {
    expect(suggestedMonthlyPerMember(0n, 4)).toBe(0n);
  });

  it('rejects a non-positive member count', () => {
    expect(() => suggestedMonthlyPerMember(1_000_00n, 0)).toThrow(RangeError);
    expect(() => suggestedMonthlyPerMember(1_000_00n, -1)).toThrow(RangeError);
  });

  it('property: N × per-member share is always >= the original amount (never under-suggests in aggregate)', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_000_00n }),
        fc.integer({ min: 1, max: 20 }),
        (amount, members) => {
          const share = suggestedMonthlyPerMember(amount, members);
          expect(share * BigInt(members)).toBeGreaterThanOrEqual(amount);
        },
      ),
    );
  });
});
