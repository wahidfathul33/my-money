import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { listGoldMarketPrices } from '@/features/assets/gold/market-queries';
import { toGoldMarketPriceClientData } from '@/features/assets/gold/client-types';
import { GoldMarketPricesClient } from '@/features/assets/gold/components/gold-market-prices-client';

/**
 * `/wealth/assets/gold/prices` — vendor/product gold price reference list,
 * refreshed daily at 10:00 WIB by `/api/cron/gold-market-price`. The whole
 * list is fetched once here; search filters it client-side (see
 * `GoldMarketPricesClient`'s own header for why a server round-trip isn't
 * worth it for a dataset this small).
 */
export default async function GoldMarketPricesPage() {
  await requireUser();

  const items = await listGoldMarketPrices();

  return (
    <>
      <PageHeader title="Harga Emas" description="Harga per vendor, diperbarui setiap hari pukul 10:00 WIB." />
      <GoldMarketPricesClient items={items.map(toGoldMarketPriceClientData)} />
    </>
  );
}
