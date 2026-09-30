import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/require-user';
import {
  getGoldAsset,
  getGoldHoldingsSummary,
  getLatestGoldPrice,
  listGoldLots,
  listWalletOptions,
} from '@/features/assets/gold/queries';
import { listGoldVendors } from '@/features/assets/gold/market-queries';
import { resolveDefaultWalletId } from '@/features/transactions/queries';
import {
  toGoldHoldingsSummaryClientData,
  toGoldLotClientData,
  toLatestGoldPriceClientData,
} from '@/features/assets/gold/client-types';
import { GoldHoldingsClient } from '@/features/assets/gold/components/gold-holdings-client';

/**
 * `/wealth/assets/gold` — docs/09-screen-specs.md §6. Structurally the
 * closest analog to `/wealth/savings/[id]` (one detail-shaped page: header
 * stats, primary actions, a list underneath), fetched once here and handed
 * to a single Client Component that owns the buy/sell/price-update sheets.
 */
export default async function GoldAssetPage() {
  const user = await requireUser();

  const [asset, summary, lots, latestPrice, wallets, defaultWalletId, vendors] = await Promise.all([
    getGoldAsset(user.id),
    getGoldHoldingsSummary(user.id),
    listGoldLots(user.id),
    getLatestGoldPrice(user.id),
    listWalletOptions(user.id),
    resolveDefaultWalletId(user.id),
    listGoldVendors(),
  ]);

  const buybackPerGram = latestPrice?.buybackPricePerGram ?? null;

  return (
    <>
      <PageHeader
        title="Emas"
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/wealth/assets/gold/prices">Harga Pasar</Link>
          </Button>
        }
      />
      <GoldHoldingsClient
        summary={toGoldHoldingsSummaryClientData(summary)}
        lots={lots.map((lot) => toGoldLotClientData(lot, buybackPerGram))}
        latestPrice={latestPrice ? toLatestGoldPriceClientData(latestPrice) : null}
        assetId={asset?.id ?? null}
        excludeFromHousehold={asset?.excludeFromHousehold ?? false}
        wallets={wallets}
        defaultWalletId={defaultWalletId}
        vendors={vendors}
      />
    </>
  );
}
