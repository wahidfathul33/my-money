'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { archiveWalletAction, deleteWalletAction } from '../actions';

interface DeleteWalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletId: string;
  walletName: string;
  /** Determines the CTA: a wallet with ledger entries can only be archived
   * (docs/03 §6.3 — hard delete is never available once there's history);
   * an empty wallet may be hard-deleted. */
  hasEntries: boolean;
  /** Called after a successful delete (not archive) — the detail page
   * navigates back to /wallets since its own wallet no longer exists. */
  onDeleted?: () => void;
}

/**
 * docs/08-copywriting.md §5.8: destructive buttons use the verb itself
 * ("Arsipkan"/"Hapus"), never "OK"/"Ya"; a description only appears when
 * there's a consequence that isn't obvious from the title.
 */
export function DeleteWalletDialog({
  open,
  onOpenChange,
  walletId,
  walletName,
  hasEntries,
  onDeleted,
}: DeleteWalletDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveWalletAction(walletId);
      if (result.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteWalletAction(walletId);
      if (result.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      if (onDeleted) onDeleted();
      else router.push('/wallets');
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="center"
        title={hasEntries ? 'Dompet ini tidak bisa dihapus' : `Hapus ${walletName}?`}
      >
        <div className="flex flex-col gap-4">
          <p className="text-text-muted text-sm">
            {hasEntries
              ? `${walletName} punya riwayat transaksi. Arsipkan untuk menyembunyikannya dari daftar aktif — riwayatnya tetap ada.`
              : 'Dompet ini belum punya transaksi tercatat. Tindakan ini tidak dapat diurungkan.'}
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
            {hasEntries ? (
              <Button variant="primary" className="flex-1" loading={isPending} onClick={handleArchive}>
                Arsipkan
              </Button>
            ) : (
              <Button variant="danger" className="flex-1" loading={isPending} onClick={handleDelete}>
                Hapus
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
