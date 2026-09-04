'use client';

/**
 * Confirmation dialog for recording a member transfer — docs/10-ux-states.md
 * §5.2. One of the few reversible actions that STILL asks for confirmation
 * (§5's table: "Mencatat transfer ke anggota | Ya | Dialog menyatakan bahwa
 * saldo penerima langsung berubah") — because its effect lands on someone
 * ELSE's ledger, and that's worth stating plainly exactly once, not because
 * it can't be undone (it can, via "Hapus" on their Activity card).
 *
 * Purely presentational: `onConfirm` is provided by
 * src/features/transactions/components/add-transaction-sheet.tsx, which
 * owns the actual `createMemberTransferAction` call and its pending/error
 * state — this component only renders what spec.md's copy requires.
 */
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/sheet';
import { formatIDR, type Money } from '@/lib/finance/money';

export interface ConfirmMemberTransferProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: Money;
  fromWalletName: string;
  toWalletName: string;
  counterpartyName: string;
  onConfirm: () => void;
  pending: boolean;
  error: string | null;
}

export function ConfirmMemberTransfer({
  open,
  onOpenChange,
  amount,
  fromWalletName,
  toWalletName,
  counterpartyName,
  onConfirm,
  pending,
  error,
}: ConfirmMemberTransferProps) {
  return (
    <Dialog open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <DialogContent variant="center" title={`Catat transfer ${formatIDR(amount)} ke ${toWalletName} ${counterpartyName}?`}>
        <div className="flex flex-col gap-4">
          <ul className="text-text flex flex-col gap-1.5 text-sm">
            <li>• Saldo {fromWalletName} Anda berkurang</li>
            <li>
              • Saldo {toWalletName} {counterpartyName} bertambah, seketika
            </li>
            <li>
              • {counterpartyName} melihatnya di Aktivitas dan dapat memindahkan atau menghapusnya
            </li>
          </ul>

          <p className="text-text-muted text-sm">Catat hanya kalau uangnya memang sudah Anda kirim.</p>

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
              disabled={pending}
            >
              Batal
            </Button>
            <Button className="flex-1" loading={pending} onClick={onConfirm}>
              Catat
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
