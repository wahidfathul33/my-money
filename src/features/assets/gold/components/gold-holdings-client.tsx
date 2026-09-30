'use client';

/**
 * `/wealth/assets/gold` interactive shell — header stats, buyback price row
 * (staleness badge + explanatory tooltip), the `exclude_from_household`
 * toggle, the buy/sell trigger row, and the per-lot list —
 * docs/09-screen-specs.md §6.
 *
 * ADR-007 in one screen: the headline number ALWAYS comes from
 * `summary.currentValue`, which src/features/assets/gold/queries.ts's
 * `getGoldHoldingsSummary` computed using the BUYBACK price — never the
 * sell price, and hidden entirely (`summary.hasPrice === false`) rather
 * than shown as a misleading number when no price has ever been recorded.
 * Price itself is sourced entirely from the ADR-008 external provider
 * (`GOLD_PRICE_PROVIDER=external`, `/api/cron/gold-price` →
 * `refreshGoldPrices` → `recordGoldPrice`) — there is no manual-entry UI
 * here for the user to set it themselves.
 */
import { useState } from 'react';
import { AlertTriangle, Gem, Info, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Tooltip } from '@/components/ui/tooltip';
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import { cn } from '@/lib/utils';
import { ExclusionToggle } from '@/features/sharing/components/exclusion-toggle';
import type { WalletOption } from '@/features/transactions/sheet-data';
import type { GoldVendorOption } from '../market-queries';
import type {
  GoldHoldingsSummaryClientData,
  GoldLotClientData,
  LatestGoldPriceClientData,
} from '../client-types';
import { BuyGoldSheet } from './buy-gold-sheet';
import { SellGoldSheet } from './sell-gold-sheet';
import { GoldLotList } from './gold-lot-list';

const BUYBACK_TOOLTIP =
  'Harga buyback adalah harga saat Anda MENJUAL — biasanya 5-12% lebih rendah dari harga beli. Nilai kepemilikan dihitung memakai harga ini, karena itulah yang benar-benar akan Anda terima.';

interface GoldHoldingsClientProps {
  summary: GoldHoldingsSummaryClientData;
  lots: GoldLotClientData[];
  latestPrice: LatestGoldPriceClientData | null;
  /** `null` when the caller has never bought any gold yet. */
  assetId: string | null;
  excludeFromHousehold: boolean;
  wallets: WalletOption[];
  defaultWalletId: string | null;
  vendors: GoldVendorOption[];
}

/** Whole-rupiah string (e.g. `"1250000"`) from a serialized `Money` —
 * exactly what an `Input type="money"` field expects to prefill, same
 * conversion src/features/savings/components/goal-form-sheet.tsx does for
 * `targetAmount`. */
function toRupiahString(serialized: string): string {
  return (deserializeMoney(serialized) / 100n).toString();
}

export function GoldHoldingsClient({
  summary,
  lots,
  latestPrice,
  assetId,
  excludeFromHousehold,
  wallets,
  defaultWalletId,
  vendors,
}: GoldHoldingsClientProps) {
  const [buyOpen, setBuyOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);

  const currentValue = deserializeMoney(summary.currentValue);
  const unrealizedGain = deserializeMoney(summary.unrealizedGain);
  const costBasis = currentValue - unrealizedGain;
  // Scaled-bigint division before ever touching `Number` — same discipline
  // src/lib/finance/savings.ts's `calculateGoalProgress` uses for its ratio.
  const gainPct =
    summary.hasPrice && costBasis > 0n ? Number((unrealizedGain * 1_000_000n) / costBasis) / 10_000 : null;
  const isGain = unrealizedGain >= 0n;

  const defaultSellRupiah = latestPrice ? toRupiahString(latestPrice.sellPricePerGram) : null;
  const defaultBuybackRupiah = latestPrice ? toRupiahString(latestPrice.buybackPricePerGram) : null;

  return (
    <div className="px-page-x flex flex-col gap-6 pb-24">
      {summary.hasHoldings ? (
        <div className="flex flex-col items-center gap-1 py-4 text-center">
          <p className="text-text-muted text-sm">Total {summary.totalGramsDisplay} gram</p>
          {summary.hasPrice ? (
            <>
              <MoneyText amount={currentValue} tone="plain" size="hero" />
              <div className="flex items-center gap-1.5">
                {isGain ? (
                  <TrendingUp className="text-positive-readable size-4" aria-hidden="true" />
                ) : (
                  <TrendingDown className="text-negative size-4" aria-hidden="true" />
                )}
                <MoneyText amount={unrealizedGain} tone="auto" showSign size="sm" />
                {gainPct !== null && (
                  <span className="text-text-muted text-sm">
                    ({gainPct >= 0 ? '+' : ''}
                    {gainPct.toFixed(1)}%)
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1 pt-2">
              <p className="text-text-muted text-body">Nilai belum tersedia</p>
              <p className="text-text-subtle text-xs">Harga akan diperbarui otomatis</p>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Gem}
          title="Catat kepemilikan emas"
          description="Lacak berat, harga beli, dan nilai emas Anda saat ini."
          action={<Button onClick={() => setBuyOpen(true)}>Tambah Emas</Button>}
        />
      )}

      {summary.hasHoldings && latestPrice && (
        <div className="bg-surface rounded-card flex flex-col gap-0.5 p-4">
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted text-sm">Harga buyback</span>
            <Tooltip content={BUYBACK_TOOLTIP}>
              <Info className="text-text-subtle size-3.5" aria-hidden="true" />
            </Tooltip>
          </div>
          <MoneyText amount={deserializeMoney(latestPrice.buybackPricePerGram)} tone="plain" size="md" />
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs',
              latestPrice.isStale ? 'text-warning-readable font-medium' : 'text-text-muted',
            )}
          >
            {latestPrice.isStale && <AlertTriangle className="size-3" aria-hidden="true" />}
            Diperbarui {latestPrice.ageDays === 0 ? 'hari ini' : `${latestPrice.ageDays} hari lalu`}
            {latestPrice.isStale && ' — pembaruan otomatis berikutnya'}
          </span>
        </div>
      )}

      {assetId && (
        <div className="border-border flex items-center justify-between gap-3 border-t pt-3">
          <div className="flex flex-col">
            <span className="text-text text-sm font-medium">Sembunyikan dari keluarga</span>
            <span className="text-text-muted text-xs">Tidak ikut dihitung di kekayaan keluarga.</span>
          </div>
          <ExclusionToggle entityType="asset" entityId={assetId} label="Emas ini" excluded={excludeFromHousehold} />
        </div>
      )}

      {summary.hasHoldings && (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setBuyOpen(true)}>
            Beli
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setSellOpen(true)}>
            Jual Emas
          </Button>
        </div>
      )}

      {lots.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-text text-sm font-semibold">Kepemilikan</h3>
          <GoldLotList lots={lots} vendors={vendors} />
        </section>
      )}

      <BuyGoldSheet
        open={buyOpen}
        onOpenChange={setBuyOpen}
        wallets={wallets}
        defaultWalletId={defaultWalletId}
        defaultPricePerGram={defaultSellRupiah}
        vendors={vendors}
      />

      {summary.hasHoldings && (
        <SellGoldSheet
          open={sellOpen}
          onOpenChange={setSellOpen}
          lots={lots}
          totalGramsRaw={summary.totalGramsRaw}
          totalGramsDisplay={summary.totalGramsDisplay}
          defaultBuybackPerGram={defaultBuybackRupiah}
          wallets={wallets}
          defaultWalletId={defaultWalletId}
        />
      )}
    </div>
  );
}
