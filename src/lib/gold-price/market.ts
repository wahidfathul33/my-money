/**
 * Multi-vendor gold market price feed — `GET /v1/emas/id/fisik` on the
 * bogortech API (`GOLD_PRICE_API_URL`/`GOLD_PRICE_API_KEY`, same env vars
 * `ExternalPriceProvider` (./external.ts) was built to point at). Kept
 * separate from `external.ts` deliberately: that class feeds the per-user
 * single-quote valuation fallback (ADR-008) behind `GOLD_PRICE_PROVIDER
 * =external` and expects a flat `{sellPerGram, buybackPerGram}` body with a
 * `Bearer` Authorization header — neither matches this API's real shape or
 * its real auth (`X-API-KEY`). This module fetches the REAL shape and is
 * always used by the market-price cron, independent of that unrelated
 * toggle.
 *
 * The REAL response (confirmed against the live `SLK-DEV-…` sandbox key)
 * differs from the flat `{status, message, data: [{vendor_name,
 * product_name, id, ...}]}` shape a hand-written example might suggest:
 * it's `{data: [...]}`, each row nests `vendor`/`product` objects, and the
 * feed is NOT pre-filtered to Indonesian physical gold despite the
 * `/fisik` path — it also returns international spot benchmarks (Kitco,
 * LBMA, BullionStar, ...) and other metals (silver, platinum, palladium,
 * copper) in both IDR and USD. `vendor.type === 'physical' && currency ===
 * 'IDR'` is what actually isolates "an Indonesian shop selling physical
 * gold" — every row satisfying that in the observed feed (Antam, Galeri 24,
 * Lotus Archi, Sampoerna Gold, Hartadinata) is a genuine gold product,
 * unlike a `product.name` prefix check (misses non-"Emas"-prefixed names
 * like "Lotus Archi 0.1g").
 *
 * `product.id` (not `vendor.id`) is the upsert key: it's unique per
 * vendor+product pair in the observed feed (e.g. "Emas Antam 1 Gram" has a
 * different `product.id` under Galeri 24 vs. under Antam directly), which
 * is exactly the row granularity `gold_market_prices.external_id` needs.
 *
 * Never cached (`cache: 'no-store'`) and throws on any failure — same
 * discipline as `external.ts`; the caller (src/lib/services/gold-market.ts)
 * decides what "failed to refresh" means for the rest of the app.
 */
import { z } from 'zod';
import { getEnv } from '@/lib/env';

const marketPriceItemSchema = z.object({
  buy_price: z.union([z.number(), z.string()]),
  buyback_price: z.union([z.number(), z.string()]),
  currency: z.string(),
  price_date: z.string().nullable(),
  as_of: z.string(),
  vendor: z.object({
    id: z.union([z.number(), z.string()]),
    name: z.string(),
    type: z.string(),
  }),
  product: z.object({
    id: z.union([z.number(), z.string()]),
    name: z.string(),
    // Optional — not every row in the observed feed carries these (e.g. a
    // future variant of the endpoint), so a missing/unrecognized weight
    // degrades to `weightGrams: null` on that one row (see `weightToGrams`
    // below) rather than failing the whole refresh.
    weight: z.union([z.number(), z.string()]).optional(),
    unit: z.string().optional(),
  }),
});

const marketPriceResponseSchema = z.object({
  data: z.array(marketPriceItemSchema),
});

export interface GoldMarketPriceItem {
  externalId: bigint;
  vendorName: string;
  productName: string;
  priceDate: string;
  buyPrice: bigint;
  buybackPrice: bigint;
  currency: string;
  asOf: Date;
  /** `NUMERIC(18,4)`-shaped decimal grams (e.g. `"1.0000"`), converted from
   * `product.weight`/`product.unit` — `null` when either field is missing
   * or the unit isn't one this module recognizes (see `weightToGrams`). A
   * row with a `null` weight is still kept (same "don't fail the whole
   * refresh over one row" discipline the `price_date` fallback below
   * follows) since the Harga Pasar reference page has no need for it, only
   * per-lot valuation matching does. */
  weightGrams: string | null;
}

/** Rupiah amounts from this API are plain whole-rupiah numbers (no minor
 * units) — same "no decimals in IDR" assumption `fromRupiah` makes for
 * user-typed input, but multiplied straight to minor units since these
 * values are already known-whole (never a decimal string to parse). */
function toMoney(amount: number | string): bigint {
  return BigInt(Math.round(Number(amount))) * 100n;
}

/** Exact gram-equivalent of one unit, as a fraction — avoids float error
 * for the irrational-looking troy-ounce conversion (31.1034768 g exactly
 * per the international troy-ounce definition). */
const UNIT_GRAMS_PER_UNIT: Record<string, { num: bigint; den: bigint }> = {
  gram: { num: 1n, den: 1n },
  gr: { num: 1n, den: 1n },
  g: { num: 1n, den: 1n },
  kg: { num: 1000n, den: 1n },
  troy_oz: { num: 311_034_768n, den: 10_000_000n },
  troyoz: { num: 311_034_768n, den: 10_000_000n },
  oz: { num: 311_034_768n, den: 10_000_000n },
  ons: { num: 311_034_768n, den: 10_000_000n },
};

/** `numerator / denominator`, half-up rounded — same rounding discipline
 * as src/lib/finance/money.ts's `multiplyRatio`, reimplemented locally
 * since this module stays dependency-free from the finance layer (pure
 * I/O-adjacent parsing, not domain arithmetic). */
function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

/** `product.weight`/`product.unit` → a `NUMERIC(18,4)`-shaped decimal gram
 * string, or `null` for an unrecognized unit, a non-positive weight, or a
 * weight that isn't a plain non-negative decimal. All arithmetic stays in
 * exact bigint fractions (no float) until the very last step, which
 * rounds to the column's 4 decimal places. */
function weightToGrams(
  weight: number | string | undefined,
  unit: string | undefined,
): string | null {
  if (weight === undefined || unit === undefined) return null;
  const factor = UNIT_GRAMS_PER_UNIT[unit.trim().toLowerCase()];
  if (!factor) return null;

  const weightStr = typeof weight === 'number' ? weight.toString() : weight.trim();
  if (!/^\d+(\.\d+)?$/.test(weightStr)) return null;

  const INPUT_PRECISION = 8n;
  const [whole = '0', frac = ''] = weightStr.split('.');
  const paddedFrac = (frac + '0'.repeat(Number(INPUT_PRECISION))).slice(0, Number(INPUT_PRECISION));
  const weightScaled = BigInt(whole) * 10n ** INPUT_PRECISION + BigInt(paddedFrac);
  if (weightScaled <= 0n) return null;

  const gramsScaled = roundHalfUpDiv(weightScaled * factor.num, factor.den);
  const gramsAt4Decimals = roundHalfUpDiv(gramsScaled, 10n ** (INPUT_PRECISION - 4n));
  if (gramsAt4Decimals <= 0n) return null;

  const gramsWhole = gramsAt4Decimals / 10_000n;
  const gramsFrac = gramsAt4Decimals % 10_000n;
  return `${gramsWhole}.${gramsFrac.toString().padStart(4, '0')}`;
}

export async function fetchGoldMarketPrices(): Promise<GoldMarketPriceItem[]> {
  const env = getEnv();
  if (!env.GOLD_PRICE_API_URL) {
    throw new Error('fetchGoldMarketPrices: GOLD_PRICE_API_URL is not set');
  }

  const response = await fetch(env.GOLD_PRICE_API_URL, {
    headers: {
      Accept: 'application/json',
      ...(env.GOLD_PRICE_API_KEY ? { 'X-API-KEY': env.GOLD_PRICE_API_KEY } : {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`fetchGoldMarketPrices: request failed with HTTP ${response.status}`);
  }

  const body: unknown = await response.json();
  const parsed = marketPriceResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error('fetchGoldMarketPrices: response body does not match the expected shape');
  }

  return parsed.data.data
    .filter((item) => item.vendor.type === 'physical' && item.currency === 'IDR')
    .map((item) => ({
      externalId: BigInt(item.product.id),
      vendorName: item.vendor.name,
      productName: item.product.name,
      // `price_date` is a full ISO datetime in this feed (e.g.
      // "2026-09-30T00:00:00Z"), not a plain date, and is nullable (seen on
      // at least one malformed row) — slice to `YYYY-MM-DD` either way for
      // the `date`-typed `gold_market_prices.price_date` column, falling
      // back to `as_of`'s own date so a null `price_date` still produces
      // something honest rather than failing the whole refresh over one row.
      priceDate: (item.price_date ?? item.as_of).slice(0, 10),
      buyPrice: toMoney(item.buy_price),
      buybackPrice: toMoney(item.buyback_price),
      currency: item.currency,
      asOf: new Date(item.as_of),
      weightGrams: weightToGrams(item.product.weight, item.product.unit),
    }));
}
