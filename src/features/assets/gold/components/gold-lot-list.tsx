'use client';

/**
 * "Kepemilikan" list — one card per lot: weight/form + purchase date,
 * purchase price/gram, and current value + gain% — docs/09-screen-specs.md
 * §6:
 * ```
 * │ Antam 10 gr · 12 Mar 2026     │
 * │ Beli Rp1.050.000/gr          │
 * │ Nilai Rp11.900.000  ↗ +13,3% │
 * ```
 * A Client Component (was a Server Component before edit/delete existed) —
 * tapping a row opens `GoldLotDetailSheet` ("Detail kepemilikan emas"),
 * mirroring src/features/transactions/components/detail-sheet.tsx's
 * tap-row-for-detail pattern rather than inline per-row buttons. Only one
 * detail/edit/delete instance is ever mounted for the whole list, driven by
 * whichever row was tapped.
 */
import { useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import { cn } from '@/lib/utils';
import type { GoldLotClientData } from '../client-types';
import type { GoldVendorOption } from '../market-queries';
import { GoldLotDetailSheet } from './gold-lot-detail-sheet';
import { EditGoldLotSheet } from './edit-gold-lot-sheet';
import { DeleteGoldLotDialog } from './delete-gold-lot-dialog';

function formatDateId(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function GoldLotRow({ lot, onOpen }: { lot: GoldLotClientData; onOpen: () => void }) {
  const form = [lot.vendorName, lot.goldForm].filter(Boolean).join(' · ');
  const heading = form
    ? `${form} · ${lot.remainingGramsDisplay} gr`
    : `${lot.remainingGramsDisplay} gr`;
  const isGain = lot.gainPct !== null && lot.gainPct >= 0;

  return (
    <button type="button" onClick={onOpen} className="block w-full text-left">
      <Card className="flex flex-col gap-1">
        <p className="text-text text-sm font-medium">
          {heading} · {formatDateId(lot.purchaseDate)}
        </p>
        <p className="text-text-muted text-xs">
          Beli Rp{(deserializeMoney(lot.purchasePricePerGram) / 100n).toLocaleString('id-ID')}/gr
        </p>
        {lot.notes && <p className="text-text-muted text-xs">{lot.notes}</p>}
        {lot.currentValue !== null && lot.gainPct !== null ? (
          <div className="flex items-center gap-2">
            <MoneyText amount={deserializeMoney(lot.currentValue)} tone="plain" size="sm" />
            {lot.valuationVendorName && (
              <span className="text-text-muted text-xs">
                {lot.isFallbackVendorPrice
                  ? `Harga ${lot.valuationVendorName}`
                  : lot.valuationVendorName}
              </span>
            )}
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
          <p className="text-text-muted text-xs">Nilai belum tersedia</p>
        )}
      </Card>
    </button>
  );
}

export function GoldLotList({
  lots,
  vendors,
}: {
  lots: GoldLotClientData[];
  vendors: GoldVendorOption[];
}) {
  const [selectedLot, setSelectedLot] = useState<GoldLotClientData | null>(null);
  const [editingLot, setEditingLot] = useState<GoldLotClientData | null>(null);
  const [deletingLot, setDeletingLot] = useState<GoldLotClientData | null>(null);

  return (
    <>
      <ul className="flex flex-col gap-2">
        {lots.map((lot) => (
          <li key={lot.id}>
            <GoldLotRow lot={lot} onOpen={() => setSelectedLot(lot)} />
          </li>
        ))}
      </ul>

      <GoldLotDetailSheet
        open={selectedLot !== null}
        onOpenChange={(open) => !open && setSelectedLot(null)}
        lot={selectedLot}
        onEdit={() => {
          setEditingLot(selectedLot);
          setSelectedLot(null);
        }}
        onDelete={() => {
          setDeletingLot(selectedLot);
          setSelectedLot(null);
        }}
      />
      <EditGoldLotSheet
        open={editingLot !== null}
        onOpenChange={(open) => !open && setEditingLot(null)}
        lot={editingLot}
        vendors={vendors}
      />
      <DeleteGoldLotDialog
        open={deletingLot !== null}
        onOpenChange={(open) => !open && setDeletingLot(null)}
        lot={deletingLot}
      />
    </>
  );
}
