import { describe, expect, it } from 'vitest';
import { fromRupiah } from '@/lib/finance/money';
import type { SavingsGoalListItem } from '@/features/savings/queries';
import { buildNetWorthTrend, selectDashboardSavingsGoals } from '../queries';

describe('buildNetWorthTrend', () => {
  it('slices to the last point before the current month through today', () => {
    const history = [
      { date: '2026-08-15', netWorth: fromRupiah(180_000_000) }, // last of previous month
      { date: '2026-09-05', netWorth: fromRupiah(185_000_000) },
      { date: '2026-09-16', netWorth: fromRupiah(191_650_000) },
    ];
    const result = buildNetWorthTrend(history, '2026-09-01');
    expect(result).toEqual(history); // the 08-15 point is already the cutoff
  });

  it('drops points before the last snapshot of the previous month', () => {
    const history = [
      { date: '2026-07-20', netWorth: fromRupiah(150_000_000) },
      { date: '2026-08-28', netWorth: fromRupiah(180_000_000) }, // last of previous month
      { date: '2026-09-16', netWorth: fromRupiah(191_650_000) },
    ];
    const result = buildNetWorthTrend(history, '2026-09-01');
    expect(result.map((h) => h.date)).toEqual(['2026-08-28', '2026-09-16']);
  });

  it('falls back to the full array when no point predates the current month (brand-new account)', () => {
    const history = [
      { date: '2026-09-02', netWorth: fromRupiah(1_000_000) },
      { date: '2026-09-16', netWorth: fromRupiah(1_200_000) },
    ];
    const result = buildNetWorthTrend(history, '2026-09-01');
    expect(result).toEqual(history);
  });

  it('returns fewer than 2 points untouched — the CALLER (NetWorthHero) is what hides the delta', () => {
    expect(buildNetWorthTrend([], '2026-09-01')).toEqual([]);
    const single = [{ date: '2026-09-16', netWorth: fromRupiah(1_000_000) }];
    expect(buildNetWorthTrend(single, '2026-09-01')).toEqual(single);
  });
});

function goal(overrides: Partial<SavingsGoalListItem>): SavingsGoalListItem {
  return {
    id: overrides.id ?? 'goal-1',
    name: 'Goal',
    targetAmount: fromRupiah(20_000_000),
    currentAmount: fromRupiah(8_000_000),
    targetDate: null,
    status: 'active',
    icon: 'target',
    color: 'blue',
    householdId: null,
    householdName: null,
    ...overrides,
  };
}

describe('selectDashboardSavingsGoals', () => {
  it('excludes non-active goals', () => {
    const goals = [goal({ id: 'a', status: 'active' }), goal({ id: 'b', status: 'completed' })];
    expect(selectDashboardSavingsGoals(goals).map((g) => g.id)).toEqual(['a']);
  });

  it('sorts by nearest target date first', () => {
    const goals = [
      goal({ id: 'far', targetDate: '2027-01-01' }),
      goal({ id: 'near', targetDate: '2026-10-01' }),
      goal({ id: 'mid', targetDate: '2026-12-01' }),
    ];
    expect(selectDashboardSavingsGoals(goals).map((g) => g.id)).toEqual(['near', 'mid']);
  });

  it('sorts goals without a target date last', () => {
    const goals = [
      goal({ id: 'no-date', targetDate: null }),
      goal({ id: 'dated', targetDate: '2026-12-01' }),
    ];
    expect(selectDashboardSavingsGoals(goals, 2).map((g) => g.id)).toEqual(['dated', 'no-date']);
  });

  it('caps at the limit (default 2)', () => {
    const goals = [
      goal({ id: 'a', targetDate: '2026-10-01' }),
      goal({ id: 'b', targetDate: '2026-11-01' }),
      goal({ id: 'c', targetDate: '2026-12-01' }),
    ];
    expect(selectDashboardSavingsGoals(goals)).toHaveLength(2);
    expect(selectDashboardSavingsGoals(goals).map((g) => g.id)).toEqual(['a', 'b']);
  });
});
