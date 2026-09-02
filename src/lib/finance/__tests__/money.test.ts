import { describe, expect, it } from 'vitest';
import { formatIDR, fromRupiah, MINOR_UNITS } from '../money';

describe('formatIDR', () => {
  it('formats zero as Rp0, never a dash or blank', () => {
    expect(formatIDR(0n)).toBe('Rp0');
  });

  it('formats positive amounts with dotted thousand separators', () => {
    expect(formatIDR(fromRupiah(8_000_000))).toBe('Rp8.000.000');
    expect(formatIDR(fromRupiah(45_000))).toBe('Rp45.000');
  });

  it('formats negative amounts with a minus sign in front of Rp, no space', () => {
    expect(formatIDR(-fromRupiah(45_000))).toBe('−Rp45.000');
  });

  it('formats amounts >= 1 billion with full digits (no abbreviation)', () => {
    expect(formatIDR(fromRupiah(1_200_000_000))).toBe('Rp1.200.000.000');
  });

  it('never inserts a space between Rp and the digits', () => {
    expect(formatIDR(fromRupiah(1_000))).not.toMatch(/Rp\s/);
  });
});

describe('fromRupiah', () => {
  it('converts a whole rupiah amount to minor units', () => {
    expect(fromRupiah(1)).toBe(1n * MINOR_UNITS);
    expect(fromRupiah('1')).toBe(1n * MINOR_UNITS);
  });

  it('converts a decimal amount, padding/truncating to two minor digits', () => {
    expect(fromRupiah('1.5')).toBe(150n);
    expect(fromRupiah('1.50')).toBe(150n);
  });

  it('round-trips through formatIDR for a representative value', () => {
    expect(formatIDR(fromRupiah(2_500))).toBe('Rp2.500');
  });
});
