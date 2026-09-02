import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fromRupiah } from '@/lib/finance/money';
import { MoneyText } from '../money-text';

describe('MoneyText', () => {
  it('renders a positive amount with positive tone and no sign by default', () => {
    render(<MoneyText amount={fromRupiah(45_000)} />);
    const el = screen.getByText('Rp45.000');
    expect(el).toHaveClass('text-positive-readable');
    expect(el).toHaveAttribute('aria-label', 'Rp45.000');
  });

  it('renders a negative amount with negative tone, magnitude only in text', () => {
    render(<MoneyText amount={-fromRupiah(45_000)} />);
    const el = screen.getByText('Rp45.000');
    expect(el).toHaveClass('text-negative');
    expect(el).toHaveAttribute('aria-label', 'Rp45.000');
  });

  it('renders zero as plain tone, Rp0, never blank', () => {
    render(<MoneyText amount={0n} />);
    const el = screen.getByText('Rp0');
    expect(el).toHaveClass('text-text');
  });

  it('supports tone="neutral" for transfers — muted color, no sign by default', () => {
    render(<MoneyText amount={fromRupiah(500_000)} tone="neutral" />);
    const el = screen.getByText('Rp500.000');
    expect(el).toHaveClass('text-text-muted');
    // Transfers never carry a sign per docs/07 §4 — callers pass
    // showSign={false} (the default) alongside tone="neutral".
    expect(el.textContent).toBe('Rp500.000');
  });

  it('showSign prefixes + for income and uses narrative aria-label "masuk"', () => {
    render(<MoneyText amount={fromRupiah(15_000_000)} showSign />);
    const el = screen.getByText('+Rp15.000.000');
    expect(el).toHaveAttribute('aria-label', 'masuk Rp15.000.000');
  });

  it('showSign prefixes − for expense and uses narrative aria-label "keluar", not "minus"', () => {
    render(<MoneyText amount={-fromRupiah(45_000)} showSign />);
    const el = screen.getByText('−Rp45.000');
    expect(el).toHaveAttribute('aria-label', 'keluar Rp45.000');
    expect(el.getAttribute('aria-label')).not.toContain('minus');
  });

  it('always applies font-money (tabular-nums) regardless of tone/size', () => {
    render(<MoneyText amount={fromRupiah(1_000)} />);
    expect(screen.getByText('Rp1.000')).toHaveClass('font-money');
  });

  it.each([
    ['sm', 'text-sm'],
    ['md', 'text-body'],
    ['lg', 'text-title'],
    ['display', 'text-display'],
    ['hero', 'text-hero'],
  ] as const)('size="%s" applies %s', (size, expectedClass) => {
    render(<MoneyText amount={fromRupiah(1_000)} size={size} />);
    expect(screen.getByText('Rp1.000')).toHaveClass(expectedClass);
  });
});
