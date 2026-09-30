/**
 * Multi-vendor gold market price feed — `GET /v1/emas/id/fisik` on the
 * bogortech API (`GOLD_PRICE_API_URL`/`GOLD_PRICE_API_KEY`, same env vars
 * `ExternalPriceProvider` (./external.ts) was built to point at). Kept
 * separate from `external.ts` deliberately: that class feeds the per-user
 * single-quote valuation fallback (ADR-008) behind `GOLD_PRICE_PROVIDER
 * =external` and expects a flat `{sellPerGram, buybackPerGram}` body with a
 * `Bearer` Authorization header — neither matches this API's real shape
 * (`{status, data: [...]}`, one row per vendor/product) or its real auth
 * (`X-API-KEY`). This module fetches the REAL shape and is always used by
 * the market-price cron, independent of that unrelated toggle.
 *
 * Never cached (`cache: 'no-store'`) and throws on any failure — same
 * discipline as `external.ts`; the caller (src/lib/services/gold-market.ts)
 * decides what "failed to refresh" means for the rest of the app.
 */
import { z } from 'zod';
import { getEnv } from '@/lib/env';

const marketPriceItemSchema = z.object({
  id: z.union([z.number(), z.string()]),
  vendor_name: z.string(),
  product_name: z.string(),
  price_date: z.string(),
  buy_price: z.union([z.number(), z.string()]),
  buyback_price: z.union([z.number(), z.string()]),
  currency: z.string().default('IDR'),
  as_of: z.string(),
});

const marketPriceResponseSchema = z.object({
  status: z.string(),
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

  return parsed.data.data.map((item) => ({
    externalId: BigInt(item.id),
    vendorName: item.vendor_name,
    productName: item.product_name,
    priceDate: item.price_date,
    buyPrice: toMoney(item.buy_price),
    buybackPrice: toMoney(item.buyback_price),
    currency: item.currency,
    asOf: new Date(item.as_of),
  }));
}
