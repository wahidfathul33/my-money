'use client';

/**
 * "Pindahkan" — docs/03-domain-model.md §9.3's action table: "Pindahkan ke
 * dompet lain → Edit biasa atas transaksinya sendiri; entry berpindah
 * dompet." A plain wallet-picker sheet over the caller's OWN active wallets
 * (no eligibility filtering here — that predicate governs where an incoming
 * transfer may be recorded FROM SOMEONE ELSE, not what the receiver may do
 * with their own money afterward), same list shape as
 * src/features/transactions/components/wallet-picker.tsx.
 */
import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { Icon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { moveMemberTransferWalletAction } from '../actions';
import type { OwnWalletOption } from '../queries';

interface MoveWalletSheetProps {
  transactionId: string;
  currentWalletId: string | null;
  wallets: OwnWalletOption[];
  /** Omit when fully controlled (below) — Radix's `Dialog.Trigger` is
   * optional; a caller that drives `open`/`onOpenChange` itself needs no
   * trigger element of its own here. */
  trigger?: ReactNode;
  /** Uncontrolled by default (self-managed `open` state) — pass BOTH to
   * control it externally, e.g. so a caller can close an OUTER sheet
   * before opening this one (two simultaneously-open Radix Dialog Roots is
   * exactly the bug `src/features/household/components/owner-menu.tsx`'s
   * own doc comment warns against). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function MoveWalletSheet({
  transactionId,
  currentWalletId,
  wallets,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: MoveWalletSheetProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = setControlledOpen ?? setUncontrolledOpen;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function handleSelect(walletId: string) {
    if (walletId === currentWalletId) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await moveMemberTransferWalletAction({ transactionId, walletId });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setOpen(false);
      router.refresh();
      toast.show({ title: 'Dipindahkan', variant: 'success' });
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent title="Pindahkan ke dompet">
        {error && (
          <p role="alert" className="text-negative mb-2 text-sm">
            {error}
          </p>
        )}
        {wallets.length === 0 ? (
          <p className="text-text-muted py-8 text-center text-sm">Belum ada dompet aktif lain.</p>
        ) : (
          <ul className="flex flex-col">
            {wallets.map((wallet) => (
              <li key={wallet.id}>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleSelect(wallet.id)}
                  aria-pressed={wallet.id === currentWalletId}
                  className={cn(
                    'pressable-tint rounded-inner flex h-12 w-full items-center gap-3 px-2 text-left text-sm disabled:opacity-50',
                    wallet.id === currentWalletId ? 'text-brand-readable bg-brand-subtle' : 'text-text',
                  )}
                >
                  <Icon name={wallet.icon} className="size-5" aria-hidden="true" />
                  {wallet.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
