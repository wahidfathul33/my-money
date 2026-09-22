'use client';

/**
 * `/settings/data`'s account-deletion confirmation — docs/09-screen-specs.md
 * §18: "memerlukan pengetikan alamat email untuk konfirmasi, dan
 * menyatakan dengan jelas bahwa seluruh data finansial akan hilang
 * permanen." Same serious-destructive-action shape as
 * src/features/household/components/remove-member-dialog.tsx /
 * src/features/budgets/components/delete-budget-dialog.tsx (call the action
 * directly inside `useTransition`, handle the result inline — never
 * `useActionState` + a pending-flip effect, for the same race reason
 * `RemoveMemberDialog`'s own doc comment explains), specialized further:
 * the confirm button stays disabled until the typed text matches the
 * caller's OWN email EXACTLY (case-insensitive), not just non-empty.
 *
 * On success, `deleteAccountAction` itself calls `signOut({ redirectTo:
 * '/signin' })` server-side — there is no "close the dialog" step to reach,
 * the whole app navigates away.
 */
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { deleteAccountAction } from '../actions';

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
}

export function DeleteAccountDialog({ open, onOpenChange, email }: DeleteAccountDialogProps) {
  const [confirmEmail, setConfirmEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blockedByHousehold, setBlockedByHousehold] = useState<{ id: string; name: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const matches = confirmEmail.trim().toLowerCase() === email.trim().toLowerCase();

  function handleConfirm() {
    setError(null);
    setBlockedByHousehold(null);
    startTransition(async () => {
      const result = await deleteAccountAction({ confirmEmail });
      // A successful call never returns — `deleteAccountAction` redirects.
      // Reaching here at all means it failed.
      if (result.blockedByHousehold) {
        setBlockedByHousehold(result.blockedByHousehold);
      }
      setError(result.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setConfirmEmail('');
          setError(null);
          setBlockedByHousehold(null);
        }
      }}
    >
      <DialogContent variant="center" title="Hapus akun secara permanen?">
        <div className="flex flex-col gap-4">
          <p className="text-negative text-sm font-medium">
            Semua data finansial Anda — transaksi, dompet, aset, hutang, piutang, target tabungan —
            akan dihapus permanen dan segera. Tidak ada masa tenggang, tindakan ini tidak dapat
            dibatalkan.
          </p>

          <Input
            label={`Ketik "${email}" untuk konfirmasi`}
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />

          {blockedByHousehold && (
            <p role="alert" className="text-negative text-sm">
              Alihkan kepemilikan atau arsipkan{' '}
              <a href={`/household/${blockedByHousehold.id}/settings`} className="font-medium underline">
                {blockedByHousehold.name}
              </a>{' '}
              sebelum menghapus akun.
            </p>
          )}
          {error && !blockedByHousehold && (
            <p role="alert" className="text-negative text-sm">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => onOpenChange(false)} disabled={isPending}>
              Batal
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={!matches}
              loading={isPending}
              onClick={handleConfirm}
            >
              Hapus akun
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
