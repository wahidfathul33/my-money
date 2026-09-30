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
}

/** Rupiah amounts from this API are plain whole-rupiah numbers (no minor
 * units) — same "no decimals in IDR" assumption `fromRupiah` makes for
 * user-typed input, but multiplied straight to minor units since these
 * values are already known-whole (never a decimal string to parse). */
function toMoney(amount: number | string): bigint {
  return BigInt(Math.round(Number(amount))) * 100n;
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
    }));
}
