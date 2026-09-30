'use client';

/**
 * Delete confirmation for one "Kepemilikan" lot — same shape as
 * src/features/obligations/components/write-off-dialog.tsx (`Dialog`/
 * `DialogContent` `variant="center"`, secondary "Batal" + danger confirm).
 * Only reachable for a lot where `GoldLotClientData.canEdit` is `true` —
 * see src/lib/services/gold.ts's `assertLotUntouchedBySale`.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { deleteGoldLotAction } from '../actions';
import type { GoldLotClientData } from '../client-types';

interface DeleteGoldLotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lot: GoldLotClientData | null;
}

export function DeleteGoldLotDialog({ open, onOpenChange, lot }: DeleteGoldLotDialogProps) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    if (!lot) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteGoldLotAction({ lotId: lot.id });
      if (result.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
      toast.show({ title: 'Kepemilikan emas dihapus', variant: 'success' });
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="center"
        title={lot ? `Hapus ${lot.weightGramsDisplay} gr · ${lot.purchaseDate}?` : 'Hapus kepemilikan emas?'}
      >
        <div className="flex flex-col gap-4">
          <p className="text-text-muted text-sm">
            Saldo dompet yang terpakai untuk membeli emas ini akan dikembalikan. Tindakan ini tidak bisa dibatalkan.
          </p>

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
              Hapus
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
