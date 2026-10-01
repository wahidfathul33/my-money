/** Pure matching and arithmetic for global gold market quotes. */
import { GRAM_SCALE, type Grams } from './gold';
import type { Money } from './money';

export interface GoldMarketQuote {
  vendorName: string;
  productName: string;
  /** Decimal grams, normalized when the feed is parsed. */
  weightGrams: string;
  /** Whole listed-product buyback amount in money minor units. */
  buybackPrice: Money;
  priceDate: string;
  asOf: Date;
}

/** Product-level buyback amount converted to whole-rupiah money per gram. */
export function buybackPerGram(quote: GoldMarketQuote): Money {
  const weight = parseScaledGrams(quote.weightGrams);
  if (weight <= 0n) throw new RangeError('buybackPerGram: quote weight must be positive');
  return roundHalfUp(quote.buybackPrice * GRAM_SCALE, weight);
}

/** Pick an exact-weight quote, preferring the lot's own vendor, then freshness. */
export function selectGoldMarketQuote(
  quotes: GoldMarketQuote[],
  lotVendorName: string | null,
  lotWeight: Grams,
  allowAnyVendorFallback = true,
): GoldMarketQuote | null {
  const candidates = quotes.filter((quote) => parseScaledGrams(quote.weightGrams) === lotWeight);
  if (candidates.length === 0) return null;

  const sameVendor = lotVendorName
    ? candidates.filter(
        (quote) => normalizeVendor(quote.vendorName) === normalizeVendor(lotVendorName),
      )
    : [];
  if (!allowAnyVendorFallback && (lotVendorName === null || sameVendor.length === 0)) return null;
  const pool = sameVendor.length > 0 ? sameVendor : candidates;

  return [...pool].sort((a, b) => {
    const freshness = b.asOf.getTime() - a.asOf.getTime();
    if (freshness !== 0) return freshness;
    const dateOrder = b.priceDate.localeCompare(a.priceDate);
    if (dateOrder !== 0) return dateOrder;
    const vendorOrder = a.vendorName.localeCompare(b.vendorName);
    return vendorOrder || a.productName.localeCompare(b.productName);
  })[0]!;
}

function parseScaledGrams(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  if (!/^\d+(\.\d{1,4})?$/.test(value))
    throw new RangeError(`Invalid market product weight: ${value}`);
  return BigInt(whole) * GRAM_SCALE + BigInt((fraction + '0000').slice(0, 4));
}

function normalizeVendor(value: string): string {
  return value.trim().toLocaleLowerCase('id-ID');
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('roundHalfUp: denominator must be positive');
  return numerator >= 0n
    ? (numerator + denominator / 2n) / denominator
    : (numerator - denominator / 2n) / denominator;
}
