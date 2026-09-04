'use client';

/**
 * Confirmation dialog for deleting a budget — same shape as
 * src/features/wallets/components/delete-wallet-dialog.tsx, minus the
 * archive-instead branch: a budget has no history of its own to preserve
 * (it's a cap, not a ledger), so delete is always available, unconditionally.
 */
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/sheet';
import { deleteBudgetAction } from '../actions';

interface DeleteBudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  categoryLabel: string;
  /** Present only for a household budget — extra revalidation target. */
  householdId?: string;
  /** Called after a successful delete — closes the parent edit sheet too. */
  onDeleted: () => void;
}

export function DeleteBudgetDialog({
  open,
  onOpenChange,
  budgetId,
  categoryLabel,
  householdId,
  onDeleted,
}: DeleteBudgetDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteBudgetAction(budgetId, householdId);
      if (result.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      onDeleted();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="center" title={`Hapus anggaran ${categoryLabel}?`}>
        <div className="flex flex-col gap-4">
          <p className="text-text-muted text-sm">
            Anggaran periode ini akan dihapus. Riwayat transaksi Anda tidak terpengaruh.
          </p>

          {error && (
            <p role="alert" className="text-negative text-sm">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button variant="danger" className="flex-1" loading={isPending} onClick={handleDelete}>
              Hapus
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
