'use client';

/**
 * Tap-a-row detail sheet for one "Kepemilikan" lot — same shape as
 * src/features/transactions/components/detail-sheet.tsx's
 * `TransactionHistoryDetailSheet` ("Detail transaksi" → Edit/Hapus row).
 * Edit/delete themselves stay owned by the parent
 * (`gold-lot-list.tsx`, exactly like that file's own "Edit itself stays
 * owned by the parent" note) — this component only calls `onEdit`/`onDelete`.
 *
 * Unlike a transaction's Hapus (an instant void + "Urungkan" undo toast),
 * gold-lot delete is a hard row delete with no undo — so `onDelete` here
 * opens a confirmation dialog rather than deleting directly.
 */
import { Gem, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import { cn } from '@/lib/utils';
import type { GoldLotClientData } from '../client-types';

const LONG_DATE_FORMAT = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatDateId(isoDate: string): string {
  return LONG_DATE_FORMAT.format(new Date(`${isoDate}T00:00:00.000Z`));
}

interface GoldLotDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lot: GoldLotClientData | null;
  onEdit: () => void;
  onDelete: () => void;
}

export function GoldLotDetailSheet({
  open,
  onOpenChange,
  lot,
  onEdit,
  onDelete,
}: GoldLotDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Detail kepemilikan emas">
        {open && lot && <DetailContent lot={lot} onEdit={onEdit} onDelete={onDelete} />}
      </SheetContent>
    </Sheet>
  );
}

function DetailContent({
  lot,
  onEdit,
  onDelete,
}: {
  lot: GoldLotClientData;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const form = [lot.vendorName, lot.goldForm].filter(Boolean).join(' · ');
  const isGain = lot.gainPct !== null && lot.gainPct >= 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="bg-surface-raised text-text-muted flex size-10 shrink-0 items-center justify-center rounded-full">
          <Gem className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-text truncate font-medium">{form || 'Emas fisik'}</p>
          <p className="text-text-muted truncate text-sm">{lot.remainingGramsDisplay} gram</p>
        </div>
      </div>

      {lot.currentValue !== null ? (
        <div className="flex items-center gap-2">
          <MoneyText amount={deserializeMoney(lot.currentValue)} tone="plain" size="display" />
          {lot.valuationVendorName && (
            <span className="text-text-muted text-xs">
              {lot.isFallbackVendorPrice
                ? `Harga ${lot.valuationVendorName}`
                : lot.valuationVendorName}
            </span>
          )}
          {lot.gainPct !== null && (
            <span
              className={cn(
                'text-sm font-medium',
                isGain ? 'text-positive-readable' : 'text-negative',
              )}
            >
              {isGain ? '+' : ''}
              {lot.gainPct.toFixed(1)}%
            </span>
          )}
        </div>
      ) : (
        <p className="text-text-muted text-body">Nilai belum tersedia</p>
      )}

      <div className="flex flex-col gap-1">
        <p className="text-text-muted text-sm">
          Beli Rp{(deserializeMoney(lot.purchasePricePerGram) / 100n).toLocaleString('id-ID')}/gr ·{' '}
          {formatDateId(lot.purchaseDate)}
        </p>
        {lot.notes && <p className="text-text text-sm">{lot.notes}</p>}
      </div>

      {lot.canEdit ? (
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onEdit}>
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </Button>
          <Button variant="danger" className="flex-1" onClick={onDelete}>
            <Trash2 className="size-4" aria-hidden="true" />
            Hapus
          </Button>
        </div>
      ) : (
        <p className="text-text-muted text-xs">
          Tidak bisa diubah atau dihapus karena sebagian sudah terjual.
        </p>
      )}
    </div>
  );
}
