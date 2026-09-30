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
 * it owns which lot is being edited/deleted so only one
 * `EditGoldLotSheet`/`DeleteGoldLotDialog` pair is ever mounted for the
 * whole list, the same "one sheet instance, driven by whichever row was
 * tapped" shape src/features/assets/gold/components/sell-gold-sheet.tsx
 * uses internally.
 *
 * Edit/delete buttons only render when `lot.canEdit` — see
 * src/lib/services/gold.ts's `assertLotUntouchedBySale` for why a lot that
 * has ever had grams sold from it can't be touched.
 */
import { useState } from 'react';
import { Pencil, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import { cn } from '@/lib/utils';
import type { GoldLotClientData } from '../client-types';
import type { GoldVendorOption } from '../market-queries';
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

function GoldLotRow({
  lot,
  onEdit,
  onDelete,
}: {
  lot: GoldLotClientData;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const form = [lot.vendorName, lot.goldForm].filter(Boolean).join(' · ');
  const heading = form ? `${form} · ${lot.remainingGramsDisplay} gr` : `${lot.remainingGramsDisplay} gr`;
  const isGain = lot.gainPct !== null && lot.gainPct >= 0;

  return (
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

      {lot.canEdit && (
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="size-4" aria-hidden="true" />
            Ubah
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="size-4" aria-hidden="true" />
            Hapus
          </Button>
        </div>
      )}
    </Card>
  );
}

export function GoldLotList({ lots, vendors }: { lots: GoldLotClientData[]; vendors: GoldVendorOption[] }) {
  const [editingLot, setEditingLot] = useState<GoldLotClientData | null>(null);
  const [deletingLot, setDeletingLot] = useState<GoldLotClientData | null>(null);

  return (
    <>
      <ul className="flex flex-col gap-2">
        {lots.map((lot) => (
          <li key={lot.id}>
            <GoldLotRow lot={lot} onEdit={() => setEditingLot(lot)} onDelete={() => setDeletingLot(lot)} />
          </li>
        ))}
      </ul>

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
