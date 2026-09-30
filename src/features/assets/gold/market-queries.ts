/**
 * Reads for the global gold market price reference table — `dbRead` only
 * (docs/11-tech-architecture.md §2). NOT scoped by `ownedBy`: unlike the rest
 * of ./queries.ts, `gold_market_prices` isn't per-user.
 */
import { asc, ilike, or } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { goldMarketPrices } from '@/lib/db/schema';
import type { Money } from '@/lib/finance/money';

export interface GoldMarketPriceItem {
  id: string;
  vendorName: string;
  productName: string;
  priceDate: string;
  buyPrice: Money;
  buybackPrice: Money;
  currency: string;
  asOf: Date;
}

/** Every vendor/product row, optionally filtered by a case-insensitive
 * substring match on vendor or product name — the "Harga Pasar" page's
 * search box. Ordered by vendor then product so same-vendor rows group
 * together. */
export async function listGoldMarketPrices(search?: string): Promise<GoldMarketPriceItem[]> {
  const trimmed = search?.trim();
  const where = trimmed
    ? or(ilike(goldMarketPrices.vendorName, `%${trimmed}%`), ilike(goldMarketPrices.productName, `%${trimmed}%`))
    : undefined;

  return dbRead
    .select({
      id: goldMarketPrices.id,
      vendorName: goldMarketPrices.vendorName,
      productName: goldMarketPrices.productName,
      priceDate: goldMarketPrices.priceDate,
      buyPrice: goldMarketPrices.buyPrice,
      buybackPrice: goldMarketPrices.buybackPrice,
      currency: goldMarketPrices.currency,
      asOf: goldMarketPrices.asOf,
    })
    .from(goldMarketPrices)
    .where(where)
    .orderBy(asc(goldMarketPrices.vendorName), asc(goldMarketPrices.productName));
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
