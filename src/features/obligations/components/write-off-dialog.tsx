'use client';

/**
 * `written_off` confirmation — spec.md acceptance criteria: "`written_off`
 * tersedia untuk yang tidak tertagih, dengan konfirmasi (mengubah net
 * worth)". Same shape as src/features/budgets/components/delete-budget-dialog.tsx,
 * but the copy's central point is different: this isn't a harmless delete,
 * it's a decision that immediately changes the caller's net worth (a debt
 * disappears from liabilities; a receivable disappears from the optional
 * asset total) — the dialog says so explicitly rather than leaving it as a
 * surprise the user discovers on the next visit to `/wealth/net-worth`.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/sheet';
import { writeOffDebtAction, writeOffReceivableAction } from '../actions';

interface WriteOffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'debt' | 'receivable';
  obligationId: string;
  /** Creditor/debtor name — names what's being written off in the dialog title. */
  name: string;
  onWrittenOff: () => void;
}

export function WriteOffDialog({ open, onOpenChange, kind, obligationId, name, onWrittenOff }: WriteOffDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const noun = kind === 'debt' ? 'hutang' : 'piutang';
  const effect =
    kind === 'debt'
      ? 'Liabilitas ini akan hilang dari kekayaan bersih Anda.'
      : 'Piutang ini akan hilang dari total piutang (dan dari aset, bila Anda menghitungnya sebagai aset).';

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const action = kind === 'debt' ? writeOffDebtAction : writeOffReceivableAction;
      const result = await action(obligationId);
      if (result.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      onWrittenOff();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="center" title={`Hapuskan ${noun} — ${name}?`}>
        <div className="flex flex-col gap-4">
          <p className="text-text-muted text-sm">
            Gunakan ini untuk {noun} yang tidak akan tertagih. Sisa yang belum terbayar tidak akan
            diminta/ditagih lagi, dan tidak bisa menerima pembayaran baru. {effect}
          </p>
          <p className="text-text-muted text-sm">Tindakan ini tidak membalikkan pembayaran yang sudah tercatat.</p>

          {error && (
            <p role="alert" className="text-negative text-sm">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button type="button" variant="danger" className="flex-1" loading={isPending} onClick={handleConfirm}>
              Hapuskan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
