import { describe, expect, it } from 'vitest';
import {
  deserializeMoney,
  formatIDR,
  fromRupiah,
  MINOR_UNITS,
  multiplyRatio,
  serializeMoney,
  type Money,
} from '../money';

// int64 bounds — the BIGINT column limit in Postgres. Money must stay
// correct all the way out to these, since that's what the DB will accept.
const INT64_MAX = 9223372036854775807n;
const INT64_MIN = -9223372036854775808n;

describe('MINOR_UNITS', () => {
  it('is 100 (2 decimal places)', () => {
    expect(MINOR_UNITS).toBe(100n);
  });
});

describe('fromRupiah', () => {
  it('converts a whole-number rupiah amount to minor units', () => {
    expect(fromRupiah(50000)).toBe(5000000n);
  });

  it('converts a string amount', () => {
    expect(fromRupiah('50000')).toBe(5000000n);
  });

  it('converts fractional rupiah (cents)', () => {
    expect(fromRupiah('50000.5')).toBe(5000050n);
    expect(fromRupiah('50000.55')).toBe(5000055n);
  });

  it('truncates more than 2 decimal places rather than rounding', () => {
    expect(fromRupiah('50000.999')).toBe(5000099n);
  });

  it('pads a single decimal digit', () => {
    expect(fromRupiah('100.5')).toBe(10050n);
  });

  it('handles zero', () => {
    expect(fromRupiah(0)).toBe(0n);
    expect(fromRupiah('0')).toBe(0n);
  });

  it('handles negative amounts', () => {
    expect(fromRupiah(-50000)).toBe(-5000000n);
    expect(fromRupiah('-50000.5')).toBe(-5000050n);
  });

  it('handles amounts with no fractional part but a trailing dot', () => {
    expect(fromRupiah('50000.')).toBe(5000000n);
  });

  it('handles a leading dot with no whole part — the `whole || "0"` fallback', () => {
    // split('.') on ".5" yields ['', '5']: `whole` is an empty string (falsy,
    // not undefined), so the `whole || '0'` fallback in fromRupiah actually
    // fires here — unlike a merely-missing array element, which the
    // destructuring default `= '0'` already covers.
    expect(fromRupiah('.5')).toBe(50n);
    expect(fromRupiah('-.5')).toBe(-50n);
  });
});

describe('formatIDR', () => {
  // Format per docs/08-copywriting.md §4: "Rp" sticks to the number (no
  // space), and a negative amount uses a proper minus sign (U+2212, "−"),
  // not a hyphen. This supersedes the space-including example in
  // docs/05-financial-integrity.md §2 — see the doc comment on formatIDR.
  it('formats a positive amount with thousands separators, "Rp" with no space', () => {
    expect(formatIDR(150000000n)).toBe('Rp1.500.000');
  });

  it('formats zero', () => {
    expect(formatIDR(0n)).toBe('Rp0');
  });

  it('formats a negative amount with a proper minus sign (U+2212) directly before "Rp"', () => {
    expect(formatIDR(-150000000n)).toBe('−Rp1.500.000');
  });

  it('truncates minor units (sub-rupiah) when displaying', () => {
    expect(formatIDR(150000050n)).toBe('Rp1.500.000');
  });

  it('formats amounts near the int64 boundary without precision loss', () => {
    expect(formatIDR(INT64_MAX)).toBe('Rp' + (INT64_MAX / MINOR_UNITS).toLocaleString('id-ID'));
    expect(formatIDR(INT64_MIN)).toBe(
      '−Rp' + (-INT64_MIN / MINOR_UNITS).toLocaleString('id-ID'),
    );
  });
});

describe('multiplyRatio (explicit half-up rounding)', () => {
  it('rounds a positive exact-half result up', () => {
    // 5 * 1/2 = 2.5 → rounds to 3
    expect(multiplyRatio(5n, 1n, 2n)).toBe(3n);
  });

  it('rounds a positive below-half result down', () => {
    // 5 * 1/3 = 1.666... → truncated toward zero after adding half: (5+1)/3 = 2
    expect(multiplyRatio(10n, 1n, 3n)).toBe(3n); // (10 + 1) / 3 = 3.67 -> 3
  });

  it('rounds a negative exact-half result away from zero (symmetric half-up)', () => {
    // -5 * 1/2 = -2.5 → half-up ties round away from zero: -3, not -2.
    expect(multiplyRatio(-5n, 1n, 2n)).toBe(-3n);
  });

  it('is symmetric: multiplyRatio(-x, n, d) === -multiplyRatio(x, n, d) for exact halves', () => {
    expect(multiplyRatio(-5n, 1n, 2n)).toBe(-multiplyRatio(5n, 1n, 2n));
    expect(multiplyRatio(-7n, 1n, 2n)).toBe(-multiplyRatio(7n, 1n, 2n));
  });

  it('computes a realistic deposit-interest split (annual rate over a period)', () => {
    // Rp10,000,000 principal (in minor units), 6% annual, 90/365 days.
    const principal: Money = 1_000_000_000n; // Rp10,000,000
    const rateBps = 600n; // 6.00% expressed in basis points (bps / 10000)
    const days = 90n;
    const annualBasis = 365n;

    const grossForYear = multiplyRatio(principal, rateBps, 10_000n);
    const grossForPeriod = multiplyRatio(grossForYear, days, annualBasis);

    expect(grossForPeriod).toBeGreaterThan(0n);
    // Sanity bound: interest for 90 days at 6% should be well under the full
    // annual interest.
    expect(grossForPeriod).toBeLessThan(grossForYear);
  });

  it('handles a zero numerator', () => {
    expect(multiplyRatio(1_000_000n, 0n, 3n)).toBe(0n);
  });

  it('handles a zero amount', () => {
    expect(multiplyRatio(0n, 1n, 3n)).toBe(0n);
  });

  it('throws on a non-positive denominator', () => {
    expect(() => multiplyRatio(100n, 1n, 0n)).toThrow(RangeError);
    expect(() => multiplyRatio(100n, 1n, -3n)).toThrow(RangeError);
  });

  it('stays exact at the int64 boundary for a simple ratio (no float precision loss)', () => {
    // 9223372036854775807 * 1/2 = 4611686018427387903.5 → half-up → ...904
    const result = multiplyRatio(INT64_MAX, 1n, 2n);
    expect(result).toBe(4611686018427387904n);
  });
});

describe('serializeMoney / deserializeMoney', () => {
  it('round-trips a positive amount', () => {
    const amount: Money = 123456789n;
    expect(deserializeMoney(serializeMoney(amount))).toBe(amount);
  });

  it('round-trips a negative amount', () => {
    const amount: Money = -123456789n;
    expect(deserializeMoney(serializeMoney(amount))).toBe(amount);
  });

  it('round-trips zero', () => {
    expect(deserializeMoney(serializeMoney(0n))).toBe(0n);
  });

  it('round-trips the int64 boundary values', () => {
    expect(deserializeMoney(serializeMoney(INT64_MAX))).toBe(INT64_MAX);
    expect(deserializeMoney(serializeMoney(INT64_MIN))).toBe(INT64_MIN);
  });

  it('serializes to a plain digit string, not JSON-quoted or exponential', () => {
    expect(serializeMoney(1000000000000n)).toBe('1000000000000');
    expect(serializeMoney(1000000000000n)).not.toMatch(/e\+/i);
  });

  it('rejects a non-integer string', () => {
    expect(() => deserializeMoney('123.45')).toThrow(RangeError);
  });

  it('rejects a non-numeric string', () => {
    expect(() => deserializeMoney('not-a-number')).toThrow(RangeError);
    expect(() => deserializeMoney('')).toThrow(RangeError);
  });
});
