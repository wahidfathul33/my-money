import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fromRupiah } from '@/lib/finance/money';
import { NetWorthHero } from '../net-worth-hero';

// tasks/20-dashboard/todo.md: "Unit: delta disembunyikan bila riwayat < 2"
// — spec.md's acceptance criterion is explicit that this is NEVER rendered
// as a 0%/flat change, it's omitted entirely.
describe('NetWorthHero', () => {
  it('hides the delta/sparkline entirely with an empty history', () => {
    render(<NetWorthHero netWorth={fromRupiah(1_000_000)} history={[]} />);
    expect(screen.getByText('Rp1.000.000')).toBeInTheDocument();
    expect(screen.queryByText(/periode ini/)).not.toBeInTheDocument();
  });

  it('hides the delta/sparkline entirely with exactly ONE history point', () => {
    render(
      <NetWorthHero
        netWorth={fromRupiah(1_000_000)}
        history={[{ date: '2026-09-01', netWorth: fromRupiah(1_000_000) }]}
      />,
    );
    expect(screen.queryByText(/periode ini/)).not.toBeInTheDocument();
  });

  it('shows a positive delta (first -> last of history) with >= 2 points, never 0%', () => {
    render(
      <NetWorthHero
        netWorth={fromRupiah(191_650_000)}
        history={[
          { date: '2026-08-01', netWorth: fromRupiah(187_450_000) },
          { date: '2026-09-01', netWorth: fromRupiah(191_650_000) },
        ]}
      />,
    );
    expect(screen.getByText(/periode ini/)).toBeInTheDocument();
    expect(screen.getByText('+Rp4.200.000')).toBeInTheDocument();
    // The percent span uses plain `Number.toFixed` (period decimal), not
    // `MoneyText`'s Indonesian-locale formatting — see net-worth-hero.tsx's
    // own render: `{percent.toFixed(1)}%`.
    expect(screen.getByText('(+2.2%)')).toBeInTheDocument();
  });

  it('shows a negative delta in the negative tone, no sparkline crash on a downward trend', () => {
    render(
      <NetWorthHero
        netWorth={fromRupiah(90_000_000)}
        history={[
          { date: '2026-08-01', netWorth: fromRupiah(100_000_000) },
          { date: '2026-09-01', netWorth: fromRupiah(90_000_000) },
        ]}
      />,
    );
    const delta = screen.getByText('−Rp10.000.000');
    expect(delta).toBeInTheDocument();
    expect(screen.getByText('(-10.0%)')).toBeInTheDocument();
  });
});
