/**
 * Gold market price refresh — the only module allowed to write
 * `gold_market_prices` (docs/11-tech-architecture.md §3: only
 * `src/lib/services/**` may import `@/lib/db/write`), same rule
 * `src/lib/services/gold.ts` follows for the per-user gold tables.
 */
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { goldMarketPrices } from '@/lib/db/schema';
import { fetchGoldMarketPrices } from '@/lib/gold-price/market';
import { refreshGoldAssetCachedValues } from './gold';

export interface RefreshGoldMarketPricesResult {
  count: number;
}

/**
 * Cron entry point (`/api/cron/gold-market-price`) — fetches every
 * vendor/product row from the external feed and upserts it keyed on
 * `externalId` (`gold_market_prices_external_id_uniq`), so a re-run the same
 * day just overwrites the same rows rather than duplicating them.
 */
export async function refreshGoldMarketPrices(): Promise<RefreshGoldMarketPricesResult> {
  const items = await fetchGoldMarketPrices();
  if (items.length === 0) {
    return { count: 0 };
  }

  // One upsert per row (not a single bulk `.values([...])`) — `set` on a
  // bulk `onConflictDoUpdate` would need to reference Postgres's `excluded`
  // pseudo-table per column, whereas this dataset is small enough (a
  // handful of vendors x products) that a plain per-row upsert, matching
  // src/lib/services/gold.ts's `recordGoldPrice`, is simplest.
  for (const item of items) {
    await dbWrite
      .insert(goldMarketPrices)
      .values({
        id: uuidv7(),
        externalId: item.externalId,
        vendorName: item.vendorName,
        productName: item.productName,
        priceDate: item.priceDate,
        buyPrice: item.buyPrice,
        buybackPrice: item.buybackPrice,
        weightGrams: item.weightGrams,
        currency: item.currency,
        asOf: item.asOf,
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: goldMarketPrices.externalId,
        set: {
          vendorName: item.vendorName,
          productName: item.productName,
          priceDate: item.priceDate,
          buyPrice: item.buyPrice,
          buybackPrice: item.buybackPrice,
          weightGrams: item.weightGrams,
          currency: item.currency,
          asOf: item.asOf,
          fetchedAt: new Date(),
        },
      });
  }

  await refreshGoldAssetCachedValues();
  return { count: items.length };
}
