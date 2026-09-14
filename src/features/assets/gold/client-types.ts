/**
 * Wire-safe gold shapes for crossing the Server → Client Component boundary
 * — same reasoning as src/features/savings/client-types.ts's file header:
 * RSC flight serialization can't carry a raw `bigint` (`Money` or the
 * scaled `Grams`), so every such field here is a `string`, and every
 * client component in this feature takes one of these, never the raw row
 * types from ./queries.ts.
 */
import { serializeMoney, type Money } from '@/lib/finance/money';
import { formatGramsDisplay, formatGramsForDb, gramsToMoney, lotCostBasis, parseGrams } from '@/lib/finance/gold';
import type {
  GoldHoldingsSummary,
  GoldLotItem,
  GoldSaleItem,
  LatestGoldPrice,
} from './queries';

export interface GoldHoldingsSummaryClientData {
  totalGramsDisplay: string;
  /** Raw `NUMERIC(18,4)`-shaped decimal string — feeds the sell sheet's
   * "sell everything" affordance without re-deriving it from lots client-side. */
  totalGramsRaw: string;
  hasHoldings: boolean;
  averageCostPerGram: string;
  currentValue: string;
  unrealizedGain: string;
  hasPrice: boolean;
}

export function toGoldHoldingsSummaryClientData(summary: GoldHoldingsSummary): GoldHoldingsSummaryClientData {
  return {
    totalGramsDisplay: formatGramsDisplay(summary.totalGrams),
    totalGramsRaw: formatGramsForDb(summary.totalGrams),
    hasHoldings: summary.hasHoldings,
    averageCostPerGram: serializeMoney(summary.averageCostPerGram),
    currentValue: serializeMoney(summary.currentValue),
    unrealizedGain: serializeMoney(summary.unrealizedGain),
    hasPrice: summary.hasPrice,
  };
}

export interface GoldLotClientData {
  id: string;
  weightGramsDisplay: string;
  remainingGramsDisplay: string;
  remainingGramsRaw: string;
  purchasePricePerGram: string;
  purchaseDate: string;
  goldForm: string | null;
  /** `null` when there is no recorded price yet — the row shows cost basis
   * only, per spec.md's "Belum ada harga -> valuasi disembunyikan". */
  currentValue: string | null;
  /** Percentage (e.g. `13.3` for "+13,3%"), rounded via the same
   * scaled-bigint-then-Number discipline as
   * src/lib/finance/savings.ts's `progressPct` — never computed by
   * dividing two `Money` values as plain JS numbers. `null` alongside
   * `currentValue` when unpriced, or when the lot's own cost basis is `0`
   * (denominator would be zero). */
  gainPct: number | null;
}

/** Attaches the CURRENT buyback price (if any) to one lot, producing every
 * per-lot display figure docs/09-screen-specs.md §6's "Kepemilikan" list
 * needs: "Nilai Rp11.900.000 ↗ +13,3%". */
export function toGoldLotClientData(lot: GoldLotItem, buybackPerGram: Money | null): GoldLotClientData {
  const remainingGrams = parseGrams(lot.remainingGrams);
  const costBasis = lotCostBasis({ remainingGrams, purchasePricePerGram: lot.purchasePricePerGram });

  let currentValue: string | null = null;
  let gainPct: number | null = null;
  if (buybackPerGram !== null) {
    const value = gramsToMoney(remainingGrams, buybackPerGram);
    currentValue = serializeMoney(value);
    if (costBasis > 0n) {
      // Scaled-bigint division before ever touching `Number` — see
      // src/lib/finance/savings.ts's `calculateGoalProgress` for the same
      // discipline applied to a different ratio.
      const scaled = ((value - costBasis) * 1_000_000n) / costBasis;
      gainPct = Number(scaled) / 10_000;
    }
  }

  return {
    id: lot.id,
    weightGramsDisplay: formatGramsDisplay(parseGrams(lot.weightGrams)),
    remainingGramsDisplay: formatGramsDisplay(remainingGrams),
    remainingGramsRaw: lot.remainingGrams,
    purchasePricePerGram: serializeMoney(lot.purchasePricePerGram),
    purchaseDate: lot.purchaseDate,
    goldForm: lot.goldForm,
    currentValue,
    gainPct,
  };
}

export interface GoldSaleClientData {
  id: string;
  weightGramsDisplay: string;
  pricePerGram: string;
  proceeds: string;
  costBasis: string;
  realizedGain: string;
  saleDate: string;
}

export function toGoldSaleClientData(sale: GoldSaleItem): GoldSaleClientData {
  return {
    id: sale.id,
    weightGramsDisplay: formatGramsDisplay(parseGrams(sale.weightGrams)),
    pricePerGram: serializeMoney(sale.pricePerGram),
    proceeds: serializeMoney(sale.proceeds),
    costBasis: serializeMoney(sale.costBasis),
    realizedGain: serializeMoney(sale.realizedGain),
    saleDate: sale.saleDate,
  };
}

export interface LatestGoldPriceClientData {
  sellPricePerGram: string;
  buybackPricePerGram: string;
  priceDate: string;
  source: string;
  ageDays: number;
  isStale: boolean;
}

export function toLatestGoldPriceClientData(price: LatestGoldPrice): LatestGoldPriceClientData {
  return {
    ...price,
    sellPricePerGram: serializeMoney(price.sellPricePerGram),
    buybackPricePerGram: serializeMoney(price.buybackPricePerGram),
  };
}
