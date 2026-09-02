/**
 * Money representation — docs/05-financial-integrity.md §2.
 *
 * Absolute rules, enforced by module structure, ESLint (`local/no-money-number`),
 * and review — never by convention alone:
 *   - `number` for a money amount, anywhere — component props, API responses,
 *     query results.
 *   - `parseFloat` / `Number()` on a money value.
 *   - `.toFixed()` to format money.
 *   - Dividing money without an explicit rounding decision.
 *
 * Pure module: no I/O, no framework imports (see docs/11-tech-architecture.md §3).
 */

/** Money amount in minor units (cents). Always bigint, never number. */
export type Money = bigint;

/** Scale factor: 1 rupiah = 100 minor units. */
export const MINOR_UNITS = 100n;

/**
 * Parses a rupiah amount (whole units, optionally with up to 2 decimal
 * places) into minor units. Accepts a number or string so callers can pass
 * either a literal (`fromRupiah(50000)`) or a user-typed string
 * (`fromRupiah('50000.5')`) without going through `parseFloat`.
 */
export function fromRupiah(rupiah: number | string): Money {
  const raw = String(rupiah);
  const negative = raw.trim().startsWith('-');
  const unsigned = negative ? raw.trim().slice(1) : raw.trim();

  const [whole = '0', frac = ''] = unsigned.split('.');
  const cents = (frac + '00').slice(0, 2);
  const magnitude = BigInt(whole || '0') * MINOR_UNITS + BigInt(cents || '0');

  return negative ? -magnitude : magnitude;
}

/**
 * Formats minor units as an "Rp"-prefixed, thousands-grouped string, per
 * docs/08-copywriting.md §4: `Rp` sticks to the number with no space, and a
 * negative amount gets a proper minus sign (U+2212, not a hyphen) directly
 * before `Rp` — `−Rp45.000`, not `-Rp 45.000`. docs/05-financial-integrity.md's
 * own §2 code sample uses a space; docs/08 §4 explicitly supersedes it
 * ("Ini mengubah formatIDR ... yang saat ini memakai spasi. Panduan ini yang
 * berlaku"). This signature and behavior are relied on by
 * src/components/finance/money-text.tsx (task 01) — keep them stable.
 */
export function formatIDR(amount: Money): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const rupiah = abs / MINOR_UNITS;
  const formatted = 'Rp' + rupiah.toLocaleString('id-ID');
  return negative ? `−${formatted}` : formatted;
}

/**
 * Multiplies money by a ratio (numerator/denominator), rounding half-up
 * explicitly. Used for deposit interest, budget splits, and gold cost basis —
 * places where implicit rounding accumulates a drift that compounds over
 * time.
 *
 * `denominator` must be positive; a zero or negative denominator is a
 * programming error (division semantics), not a value to round.
 */
export function multiplyRatio(amount: Money, numerator: bigint, denominator: bigint): Money {
  if (denominator <= 0n) {
    throw new RangeError('multiplyRatio: denominator must be positive');
  }

  const product = amount * numerator;
  const half = denominator / 2n;

  return product >= 0n ? (product + half) / denominator : (product - half) / denominator;
}

/** Serializes a Money value across a Server Action / route handler boundary. */
export function serializeMoney(amount: Money): string {
  return amount.toString();
}

/** Deserializes a Money value received across a Server Action / route handler boundary. */
export function deserializeMoney(value: string): Money {
  if (!/^-?\d+$/.test(value)) {
    throw new RangeError(`deserializeMoney: "${value}" is not a valid integer string`);
  }
  return BigInt(value);
}
