/**
 * "Kepemilikan" list — one card per lot: weight/form + purchase date,
 * purchase price/gram, and current value + gain% — docs/09-screen-specs.md
 * §6:
 * ```
 * │ Antam 10 gr · 12 Mar 2026     │
 * │ Beli Rp1.050.000/gr          │
 * │ Nilai Rp11.900.000  ↗ +13,3% │
 * ```
 * A Server Component — no interactivity of its own, just formatting
 * already-computed client data (src/features/assets/gold/client-types.ts).
 */
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import { cn } from '@/lib/utils';
import type { GoldLotClientData } from '../client-types';

function formatDateId(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function GoldLotRow({ lot }: { lot: GoldLotClientData }) {
  const heading = lot.goldForm
    ? `${lot.goldForm} ${lot.remainingGramsDisplay} gr`
    : `${lot.remainingGramsDisplay} gr`;
  const isGain = lot.gainPct !== null && lot.gainPct >= 0;

  return (
    <Card className="flex flex-col gap-1">
      <p className="text-text text-sm font-medium">
        {heading} · {formatDateId(lot.purchaseDate)}
      </p>
      <p className="text-text-muted text-xs">
        Beli Rp{(deserializeMoney(lot.purchasePricePerGram) / 100n).toLocaleString('id-ID')}/gr
      </p>
      {lot.currentValue !== null && lot.gainPct !== null ? (
        <div className="flex items-center gap-2">
          <MoneyText amount={deserializeMoney(lot.currentValue)} tone="plain" size="sm" />
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium',
              isGain ? 'text-positive-readable' : 'text-negative',
            )}
          >
            {isGain ? (
              <TrendingUp className="size-3" aria-hidden="true" />
            ) : (
              <TrendingDown className="size-3" aria-hidden="true" />
            )}
            {isGain ? '+' : ''}
            {lot.gainPct.toFixed(1)}%
          </span>
        </div>
      ) : (
        <p className="text-text-muted text-xs">Nilai belum tersedia — masukkan harga saat ini</p>
      )}
    </Card>
  );
}

export function GoldLotList({ lots }: { lots: GoldLotClientData[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {lots.map((lot) => (
        <li key={lot.id}>
          <GoldLotRow lot={lot} />
        </li>
      ))}
    </ul>
  );
}
