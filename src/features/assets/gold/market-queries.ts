/**
 * Reads for the global gold market price reference table — `dbRead` only
 * (docs/11-tech-architecture.md §2). NOT scoped by `ownedBy`: unlike the rest
 * of ./queries.ts, `gold_market_prices` isn't per-user.
 */
import { and, asc, eq, ilike, inArray, or } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { goldMarketPrices } from '@/lib/db/schema';
import type { Money } from '@/lib/finance/money';
import type { GoldMarketQuote } from '@/lib/finance/gold-market';

export interface GoldMarketPriceItem extends Omit<GoldMarketQuote, 'weightGrams'> {
  id: string;
  buyPrice: Money;
  currency: string;
  /** `null` for rows whose source doesn't provide a known weight. */
  weightGrams: string | null;
}

/** Every vendor/product row, optionally filtered by a case-insensitive
 * substring match on vendor or product name — the "Harga Pasar" page's
 * search box. Ordered by vendor then product so same-vendor rows group
 * together. */
export async function listGoldMarketPrices(search?: string): Promise<GoldMarketPriceItem[]> {
  const trimmed = search?.trim();
  const where = trimmed
    ? or(
        ilike(goldMarketPrices.vendorName, `%${trimmed}%`),
        ilike(goldMarketPrices.productName, `%${trimmed}%`),
      )
    : undefined;

  return dbRead
    .select({
      id: goldMarketPrices.id,
      vendorName: goldMarketPrices.vendorName,
      productName: goldMarketPrices.productName,
      priceDate: goldMarketPrices.priceDate,
      buyPrice: goldMarketPrices.buyPrice,
      buybackPrice: goldMarketPrices.buybackPrice,
      weightGrams: goldMarketPrices.weightGrams,
      currency: goldMarketPrices.currency,
      asOf: goldMarketPrices.asOf,
    })
    .from(goldMarketPrices)
    .where(where)
    .orderBy(asc(goldMarketPrices.vendorName), asc(goldMarketPrices.productName));
}

/** Market rows for only the lot denominations we need to value. A null weight
 * is intentionally excluded; it remains visible on the reference page but
 * cannot safely be converted to a per-gram price. */
export async function listGoldMarketQuotesForWeights(
  weightGrams: string[],
): Promise<GoldMarketQuote[]> {
  if (weightGrams.length === 0) return [];

  const uniqueWeights = [...new Set(weightGrams)];
  const rows = await dbRead
    .select({
      vendorName: goldMarketPrices.vendorName,
      productName: goldMarketPrices.productName,
      weightGrams: goldMarketPrices.weightGrams,
      buybackPrice: goldMarketPrices.buybackPrice,
      priceDate: goldMarketPrices.priceDate,
      asOf: goldMarketPrices.asOf,
    })
    .from(goldMarketPrices)
    .where(
      and(
        inArray(goldMarketPrices.weightGrams, uniqueWeights),
        eq(goldMarketPrices.currency, 'IDR'),
      ),
    );

  return rows.flatMap((row) =>
    row.weightGrams === null ? [] : [{ ...row, weightGrams: row.weightGrams }],
  );
}

export interface GoldVendorOption {
  value: string;
  label: string;
}

/** Distinct vendor names for the buy sheet's "Penyedia" dropdown. */
export async function listGoldVendors(): Promise<GoldVendorOption[]> {
  const rows = await dbRead
    .selectDistinct({ vendorName: goldMarketPrices.vendorName })
    .from(goldMarketPrices)
    .orderBy(asc(goldMarketPrices.vendorName));
  return rows.map((row) => ({ value: row.vendorName, label: row.vendorName }));
}
