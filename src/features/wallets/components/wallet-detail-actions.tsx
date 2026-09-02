'use client';

import { useState, useTransition } from 'react';
import { Archive, ArchiveRestore, Pencil, Star, Wallet as WalletIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { archiveWalletAction, restoreWalletAction, setDefaultWalletAction } from '../actions';
import { WalletFormSheet } from './wallet-form-sheet';
import { BalanceAdjustmentSheet } from './balance-adjustment-sheet';
import { DeleteWalletDialog } from './delete-wallet-dialog';
import type { WalletClientData } from '../client-types';

interface WalletDetailActionsProps {
  wallet: WalletClientData;
  hasEntries: boolean;
  isDefault: boolean;
  isArchived: boolean;
}

/**
 * Action row for `/wallets/[id]` — edit, adjust balance, set default,
 * archive/restore, delete (tasks/05-wallets/todo.md UI). Owns every sheet's
 * open state so only one can be open at a time.
 */
export function WalletDetailActions({ wallet, hasEntries, isDefault, isArchived }: WalletDetailActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSetDefault() {
    setError(null);
    startTransition(async () => {
      const result = await setDefaultWalletAction(wallet.id);
      if (result.error) setError(result.error);
    });
  }

  function handleArchiveToggle() {
    setError(null);
    startTransition(async () => {
      const result = isArchived
        ? await restoreWalletAction(wallet.id)
        : await archiveWalletAction(wallet.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" aria-hidden="true" />
          Ubah
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setAdjustOpen(true)}>
          <WalletIcon className="size-4" aria-hidden="true" />
          Sesuaikan saldo
        </Button>
        {!isArchived && !isDefault && (
          <Button variant="secondary" size="sm" loading={isPending} onClick={handleSetDefault}>
            <Star className="size-4" aria-hidden="true" />
            Jadikan utama
          </Button>
        )}
        <Button variant="secondary" size="sm" loading={isPending} onClick={handleArchiveToggle}>
          {isArchived ? (
            <ArchiveRestore className="size-4" aria-hidden="true" />
          ) : (
            <Archive className="size-4" aria-hidden="true" />
          )}
          {isArchived ? 'Pulihkan' : 'Arsipkan'}
        </Button>
        <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
          Hapus
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-negative text-sm">
          {error}
        </p>
      )}

      <WalletFormSheet open={editOpen} onOpenChange={setEditOpen} wallet={wallet} />
      <BalanceAdjustmentSheet open={adjustOpen} onOpenChange={setAdjustOpen} wallet={wallet} />
      <DeleteWalletDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        walletId={wallet.id}
        walletName={wallet.name}
        hasEntries={hasEntries}
      />
    </div>
  );
}
