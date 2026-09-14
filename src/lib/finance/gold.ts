/**
 * Gold holdings — docs/03-domain-model.md §11.2, ADR-007 (buyback valuation),
 * ADR-008 (pluggable price provider).
 *
 * Weight is a QUANTITY, not money: `gold_lots.weight_grams` /
 * `remaining_grams` are `NUMERIC(18,4)` (src/lib/db/schema/assets.ts), which
 * Drizzle reads back as a plain decimal `string` (ADR-002 — "Drizzle
 * memetakan NUMERIC ke string"). Doing arithmetic on that string with
 * `parseFloat` would reintroduce exactly the float-precision problem
 * ADR-003 rules out for money, just one type over — spec.md's "Jangan:
 * `float` untuk berat maupun harga" draws no distinction between the two.
 * This module instead represents grams as a `bigint` scaled by
 * `GRAM_SCALE` (10 000, matching the column's 4 decimal places) and does
 * every computation in that exact integer domain, only ever touching a
 * decimal string at the two edges (`parseGrams` in, `formatGramsForDb` /
 * `formatGramsDisplay` out).
 *
 * Every weight × price → money conversion is an EXPLICIT half-up rounding
 * step via `multiplyRatio` (src/lib/finance/money.ts) — never implicit
 * float math, per this module's spec.md "Batasan".
 *
 * Pure module: no I/O, no framework imports (docs/11-tech-architecture.md §3).
 */
import { multiplyRatio, type Money } from './money';

/** Grams scaled by `GRAM_SCALE` — an exact integer, never a float. */
export type Grams = bigint;

/** `NUMERIC(18,4)` — 4 decimal places, so 1 gram = 10 000 scaled units. */
export const GRAM_SCALE = 10_000n;

const GRAMS_PATTERN = /^\d+(\.\d{1,4})?$/;

/**
 * Parses a decimal gram string (e.g. `"10.5"`, or `"2.1234"` as read back
 * from a NUMERIC(18,4) column) into scaled integer grams. Rejects anything
 * that isn't a non-negative decimal with at most 4 fractional digits —
 * callers that need "> 0" (every purchase/sale amount) check that
 * separately, since a `0` weight is syntactically valid decimal but never a
 * valid transaction.
 */
export function parseGrams(value: string): Grams {
  const trimmed = value.trim();
  if (!GRAMS_PATTERN.test(trimmed)) {
    throw new RangeError(`parseGrams: "${value}" is not a valid non-negative decimal (max 4 decimals)`);
  }

  const [whole, frac = ''] = trimmed.split('.');
  const paddedFrac = (frac + '0000').slice(0, 4);
  return BigInt(whole) * GRAM_SCALE + BigInt(paddedFrac);
}

/** Formats scaled grams back into the exact `NUMERIC(18,4)`-shaped decimal
 * string a Drizzle `numeric` column expects on write (e.g. `"10.5000"`). */
export function formatGramsForDb(grams: Grams): string {
  if (grams < 0n) {
    throw new RangeError('formatGramsForDb: grams must be non-negative');
  }
  const whole = grams / GRAM_SCALE;
  const frac = grams % GRAM_SCALE;
  return `${whole}.${frac.toString().padStart(4, '0')}`;
}

/** Formats scaled grams for display, Indonesian decimal comma, trailing
 * zeros trimmed (`"10,5"`, `"2,1234"`, `"55"`) — docs/08-copywriting.md §8's
 * glossary lists `Berat` as a gold field with no fixed decimal count shown. */
export function formatGramsDisplay(grams: Grams): string {
  if (grams < 0n) {
    throw new RangeError('formatGramsDisplay: grams must be non-negative');
  }
  const whole = grams / GRAM_SCALE;
  const frac = grams % GRAM_SCALE;
  const wholeStr = whole.toLocaleString('id-ID');
  if (frac === 0n) return wholeStr;

  const fracStr = frac.toString().padStart(4, '0').replace(/0+$/, '');
  return `${wholeStr},${fracStr}`;
}

/** Half-up rounding division for bigints — mirrors money.ts's `multiplyRatio`
 * tail exactly, but on a plain numerator/denominator (not an amount×ratio
 * shape), for `averageCostPerGram`'s weighted-average division below.
 * `denominator` must be positive. */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError('roundHalfUp: denominator must be positive');
  }
  const half = denominator / 2n;
  return numerator >= 0n ? (numerator + half) / denominator : (numerator - half) / denominator;
}

/**
 * Weight(scaled) × price/gram → money, half-up rounded. `GRAM_SCALE` is the
 * ratio's denominator: `multiplyRatio(pricePerGram, grams, GRAM_SCALE)` =
 * `round(pricePerGram × grams ÷ GRAM_SCALE)` = `round(pricePerGram ×
 * realGrams)` — exactly the "weight × price → money, explicit rounding"
 * conversion spec.md requires, reusing money.ts's existing helper rather
 * than reimplementing half-up rounding a second time.
 */
export function gramsToMoney(grams: Grams, pricePerGram: Money): Money {
  return multiplyRatio(pricePerGram, grams, GRAM_SCALE);
}

export interface GoldLotInput {
  /** Only the REMAINING portion of a lot counts toward cost basis / value —
   * the already-sold portion isn't holdings anymore. */
  remainingGrams: Grams;
  purchasePricePerGram: Money;
}

/** Σ remaining_grams across every lot passed in — callers decide which lots
 * qualify (e.g. "belongs to this user's gold asset"); this function has no
 * opinion on that, only on the arithmetic. */
export function totalRemainingGrams(lots: GoldLotInput[]): Grams {
  return lots.reduce((sum, lot) => sum + lot.remainingGrams, 0n);
}

/** One lot's cost basis: `remainingGrams × purchasePricePerGram`, rounded
 * once per lot — this is also exactly the "Beli Rp.../gr" → "Nilai Rp..."
 * figure the per-lot UI row shows (docs/09-screen-specs.md §6). */
export function lotCostBasis(lot: GoldLotInput): Money {
  return gramsToMoney(lot.remainingGrams, lot.purchasePricePerGram);
}

/** Σ of each lot's OWN rounded cost basis — summing already-integer sen
 * values, so no further rounding is introduced here. Deliberately NOT
 * "sum the raw products, divide once": each lot's cost basis is a real,
 * independently-displayed figure (the per-lot list), so it has to be
 * rounded at the lot level for the total to match what's shown per row. */
export function totalCostBasis(lots: GoldLotInput[]): Money {
  return lots.reduce((sum, lot) => sum + lotCostBasis(lot), 0n);
}

/**
 * `avg_cost_per_gram = Σ(remaining_grams × purchase_price_per_gram) /
 * Σ(remaining_grams)` — docs/03 §11.2. `GRAM_SCALE` cancels exactly between
 * numerator and denominator (both are scaled the same way), so this is safe
 * to compute directly in the scaled-integer domain without ever
 * reintroducing GRAM_SCALE explicitly. Returns `0n` for an empty/fully-sold
 * holding rather than dividing by zero — there is no meaningful "average
 * cost" with nothing left to average.
 */
export function averageCostPerGram(lots: GoldLotInput[]): Money {
  const totalGrams = totalRemainingGrams(lots);
  if (totalGrams === 0n) return 0n;

  const numerator = lots.reduce((sum, lot) => sum + lot.remainingGrams * lot.purchasePricePerGram, 0n);
  return roundHalfUp(numerator, totalGrams);
}

/** `current_value = total_grams × buyback_price_per_gram` — docs/03 §11.2.
 * ADR-007: ALWAYS the buyback price, never the sell price — valuing at the
 * sell price systematically overstates wealth by the 5-12% spread. */
export function currentValue(totalGrams: Grams, buybackPerGram: Money): Money {
  return gramsToMoney(totalGrams, buybackPerGram);
}

/** `unrealized_gain = current_value − Σ(remaining_grams ×
 * purchase_price_per_gram)` — docs/03 §11.2. */
export function unrealizedGain(lots: GoldLotInput[], buybackPerGram: Money): Money {
  const totalGrams = totalRemainingGrams(lots);
  return currentValue(totalGrams, buybackPerGram) - totalCostBasis(lots);
}

export interface GoldLotForSale {
  id: string;
  remainingGrams: Grams;
  purchasePricePerGram: Money;
}

export interface LotReduction {
  lotId: string;
  /** Amount to subtract from this lot's `remaining_grams`. Reductions
   * across every lot sum to EXACTLY `gramsSold` — never more, never less,
   * and never more than any single lot's own `remainingGrams`. */
  reduceBy: Grams;
}

export interface SaleComputation {
  /** `grams_sold × buyback_price_at_sale`. */
  proceeds: Money;
  /** `grams_sold × avg_cost_per_gram` — the cost basis of the SOLD portion
   * only, not the whole remaining holding. */
  costBasis: Money;
  /** `proceeds − costBasis`. */
  realizedGain: Money;
  reductions: LotReduction[];
}

/**
 * Computes a sale against weighted-average cost basis, and how
 * `remaining_grams` should shrink PROPORTIONALLY across every lot —
 * docs/03 §11.2: "Penjualan mengurangi remaining_grams lot-lot secara
 * proporsional", chosen over FIFO because physical gold is fungible and
 * FIFO would force the UI to explain which specific lot was sold for no
 * benefit to a personal-finance user.
 *
 * The per-lot split uses the largest-remainder method: each lot's exact
 * share (`gramsSold × lot.remainingGrams / totalGrams`) is floored, then
 * the leftover scaled-gram units (at most `lots.length − 1`, each worth
 * 0.0001g) go to the lots with the largest fractional remainder first. This
 * guarantees `Σ reduceBy === gramsSold` exactly — no drift from summing
 * independently-rounded shares — while never pushing any single lot's
 * reduction past its own `remainingGrams`: a lot can only receive its floor
 * share PLUS a leftover unit, and the one case where a lot's floor share
 * already equals its full `remainingGrams` (a full liquidation, `gramsSold
 * === totalGrams`) is exactly the case where every remainder is zero and
 * there is no leftover left to distribute (see this function's own test
 * suite for the proof case).
 *
 * Throws (a programming error, not a user-facing validation) if `gramsSold`
 * is non-positive or exceeds `totalGrams` — callers MUST check "selling more
 * than owned" themselves, under a `SELECT ... FOR UPDATE` lock on the lot
 * rows (spec.md's "Batasan": "penjualan memakai `FOR UPDATE`"), and turn
 * that into a `ValidationError` BEFORE calling this function — by the time
 * this runs, the request is assumed already validated.
 */
export function computeSale(lots: GoldLotForSale[], gramsSold: Grams, pricePerGram: Money): SaleComputation {
  const totalGrams = totalRemainingGrams(lots);
  if (gramsSold <= 0n) {
    throw new RangeError('computeSale: gramsSold must be positive');
  }
  if (gramsSold > totalGrams) {
    throw new RangeError('computeSale: gramsSold exceeds total remaining grams');
  }

  const avgCost = averageCostPerGram(lots);
  const proceeds = gramsToMoney(gramsSold, pricePerGram);
  const costBasis = gramsToMoney(gramsSold, avgCost);
  const realizedGain = proceeds - costBasis;

  const shares = lots.map((lot) => {
    const product = gramsSold * lot.remainingGrams;
    return { lotId: lot.id, floor: product / totalGrams, remainder: product % totalGrams };
  });

  const reduceBy = new Map(shares.map((s) => [s.lotId, s.floor]));
  let leftover = gramsSold - shares.reduce((sum, s) => sum + s.floor, 0n);

  const byRemainderDesc = [...shares].sort((a, b) => (a.remainder < b.remainder ? 1 : a.remainder > b.remainder ? -1 : 0));
  for (const s of byRemainderDesc) {
    if (leftover <= 0n) break;
    reduceBy.set(s.lotId, (reduceBy.get(s.lotId) ?? 0n) + 1n);
    leftover -= 1n;
  }

  return {
    proceeds,
    costBasis,
    realizedGain,
    reductions: lots.map((lot) => ({ lotId: lot.id, reduceBy: reduceBy.get(lot.id) ?? 0n })),
  };
}

// --- Price age / staleness — ADR-008: "Harga lebih tua dari 30 hari
// memicu peringatan di UI". ---------------------------------------------

/** Days after which a recorded price is considered stale — docs/09-screen-specs.md
 * §6 "Badge ... berubah menjadi peringatan setelah 30 hari". */
export const PRICE_STALE_AFTER_DAYS = 30;

function toUtcMidnight(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days between `priceDate` (`YYYY-MM-DD`) and `today` (defaults to
 * the current UTC date — pass explicitly in tests for determinism, same
 * convention as src/lib/finance/savings.ts's `GoalProgressInput.today`).
 * Never negative in practice (a price is never dated in the future), but
 * not clamped here — a negative value is more useful for a caller to
 * notice during development than silently hidden.
 */
export function priceAgeDays(priceDate: string, today: string = todayIso()): number {
  return Math.floor((toUtcMidnight(today) - toUtcMidnight(priceDate)) / MS_PER_DAY);
}

/** `ageDays > 30` — strictly greater, so exactly 30 days old is still fresh. */
export function isPriceStale(ageDays: number): boolean {
  return ageDays > PRICE_STALE_AFTER_DAYS;
}
