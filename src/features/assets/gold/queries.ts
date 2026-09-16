/**
 * Gold reads — `dbRead` only (docs/11-tech-architecture.md §2). Every
 * function here is scoped to the CALLER's own gold asset/lots/prices/sales
 * via `ownedBy` — there is no shared/household view of gold in this task
 * (only the plain per-item `exclude_from_household` toggle, reused as-is
 * from src/features/sharing/**).
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { assets, goldLots, goldPrices, goldSales, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import type { Money } from '@/lib/finance/money';
import {
  averageCostPerGram,
  currentValue,
  isPriceStale,
  parseGrams,
  priceAgeDays,
  totalRemainingGrams,
  unrealizedGain,
  type Grams,
} from '@/lib/finance/gold';
import type { WalletOption } from '@/features/transactions/sheet-data';

/** The caller's own active wallets, for the buy/sell sheets' wallet picker —
 * same shape/query as src/features/savings/queries.ts's own copy of this
 * (that file's comment on why it's duplicated rather than imported applies
 * here too). */
export async function listWalletOptions(userId: string): Promise<WalletOption[]> {
  return dbRead
    .select({
      id: wallets.id,
      name: wallets.name,
      type: wallets.type,
      icon: wallets.icon,
      color: wallets.color,
    })
    .from(wallets)
    .where(and(ownedBy(wallets, userId), eq(wallets.isArchived, false)))
    .orderBy(asc(wallets.type), asc(wallets.sortOrder));
}

export interface GoldAssetSummary {
  id: string;
  excludeFromHousehold: boolean;
  cachedValue: Money;
  cachedAt: Date | null;
}

/** The caller's one gold asset row (see src/lib/services/gold.ts's
 * `findOrCreateGoldAsset` for why there's only ever one), or `null` if
 * they've never bought any gold yet. */
export async function getGoldAsset(userId: string): Promise<GoldAssetSummary | null> {
  const [row] = await dbRead
    .select({
      id: assets.id,
      excludeFromHousehold: assets.excludeFromHousehold,
      cachedValue: assets.cachedValue,
      cachedAt: assets.cachedAt,
    })
    .from(assets)
    .where(and(ownedBy(assets, userId), eq(assets.assetType, 'gold')))
    .limit(1);
  return row ?? null;
}

export interface GoldLotItem {
  id: string;
  weightGrams: string; // NUMERIC(18,4) as Drizzle reads it — a decimal string.
  remainingGrams: string;
  purchasePricePerGram: Money;
  purchaseDate: string; // DATE column -> `YYYY-MM-DD`.
  goldForm: string | null;
}

/** Every lot with grams still remaining, oldest purchase first — matches
 * the order docs/09-screen-specs.md §6's "Kepemilikan" list implies (each
 * row shows its own purchase date). Fully-sold lots (remaining_grams = 0)
 * are historical bookkeeping, not part of "what you currently hold", so
 * they're excluded here — `getGoldSales` is where a liquidation shows up. */
export async function listGoldLots(userId: string): Promise<GoldLotItem[]> {
  const asset = await getGoldAsset(userId);
  if (!asset) return [];

  return dbRead
    .select({
      id: goldLots.id,
      weightGrams: goldLots.weightGrams,
      remainingGrams: goldLots.remainingGrams,
      purchasePricePerGram: goldLots.purchasePricePerGram,
      purchaseDate: goldLots.purchaseDate,
      goldForm: goldLots.goldForm,
    })
    .from(goldLots)
    .where(and(eq(goldLots.assetId, asset.id), sql`${goldLots.remainingGrams} > 0`))
    .orderBy(asc(goldLots.purchaseDate));
}

export interface LatestGoldPrice {
  sellPricePerGram: Money;
  buybackPricePerGram: Money;
  priceDate: string;
  source: string;
  ageDays: number;
  isStale: boolean;
}

/** The caller's own most recently recorded price, with its age already
 * resolved — `null` when they have never recorded one at all (spec.md:
 * "Belum ada harga sama sekali -> valuasi disembunyikan, CTA 'Masukkan
 * harga saat ini'"). */
export async function getLatestGoldPrice(userId: string): Promise<LatestGoldPrice | null> {
  const [row] = await dbRead
    .select({
      sellPricePerGram: goldPrices.sellPricePerGram,
      buybackPricePerGram: goldPrices.buybackPricePerGram,
      priceDate: goldPrices.priceDate,
      source: goldPrices.source,
    })
    .from(goldPrices)
    .where(ownedBy(goldPrices, userId))
    .orderBy(desc(goldPrices.priceDate))
    .limit(1);
  if (!row) return null;

  const ageDays = priceAgeDays(row.priceDate);
  return { ...row, ageDays, isStale: isPriceStale(ageDays) };
}

export interface GoldSaleItem {
  id: string;
  weightGrams: string;
  pricePerGram: Money;
  proceeds: Money;
  costBasis: Money;
  realizedGain: Money;
  saleDate: string;
}

/** Every sale ever recorded, newest first — spec.md/todo.md's `getGoldSales`. */
export async function getGoldSales(userId: string): Promise<GoldSaleItem[]> {
  return dbRead
    .select({
      id: goldSales.id,
      weightGrams: goldSales.weightGrams,
      pricePerGram: goldSales.pricePerGram,
      proceeds: goldSales.proceeds,
      costBasis: goldSales.costBasis,
      realizedGain: goldSales.realizedGain,
      saleDate: goldSales.saleDate,
    })
    .from(goldSales)
    .where(ownedBy(goldSales, userId))
    .orderBy(desc(goldSales.saleDate));
}

export interface GoldHoldingsSummary {
  /** Scaled grams (× GRAM_SCALE) — see src/lib/finance/gold.ts. */
  totalGrams: Grams;
  hasHoldings: boolean;
  averageCostPerGram: Money;
  /** `0n` when `hasPrice` is `false` — valuation is hidden in the UI in
   * that case rather than shown as a misleading zero. */
  currentValue: Money;
  unrealizedGain: Money;
  hasPrice: boolean;
}

/** `getGoldHoldings` (todo.md) — total gram, cost basis, nilai kini, gain,
 * combining `listGoldLots` + `getLatestGoldPrice` through the pure
 * functions in src/lib/finance/gold.ts. ALWAYS values at the buyback price
 * (ADR-007), never the sell price. */
export async function getGoldHoldingsSummary(userId: string): Promise<GoldHoldingsSummary> {
  const [lots, latestPrice] = await Promise.all([listGoldLots(userId), getLatestGoldPrice(userId)]);
  const lotInputs = lots.map((lot) => ({
    remainingGrams: parseGrams(lot.remainingGrams),
    purchasePricePerGram: lot.purchasePricePerGram,
  }));

  const totalGrams = totalRemainingGrams(lotInputs);
  const hasPrice = latestPrice !== null;

  return {
    totalGrams,
    hasHoldings: lots.length > 0,
    averageCostPerGram: averageCostPerGram(lotInputs),
    currentValue: hasPrice ? currentValue(totalGrams, latestPrice.buybackPricePerGram) : 0n,
    unrealizedGain: hasPrice ? unrealizedGain(lotInputs, latestPrice.buybackPricePerGram) : 0n,
    hasPrice,
  };
}
