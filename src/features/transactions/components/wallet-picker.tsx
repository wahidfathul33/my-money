'use client';

/**
 * Wallet selector for the meta row — docs/09 §2: "💳 BCA" tap target that
 * opens a sheet listing the caller's active wallets. Deliberately no
 * balance shown (`WalletOption` from ../sheet-data has no `balance` field
 * at all — RSC can't carry `bigint` across the Server → Client boundary,
 * and the wireframe doesn't call for one here anyway).
 */
import { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Icon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import type { WalletOption } from '../sheet-data';

interface WalletPickerProps {
  wallets: WalletOption[];
  value: string;
  onChange: (walletId: string) => void;
}

export function WalletPicker({ wallets, value, onChange }: WalletPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = wallets.find((w) => w.id === value);

  function select(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable-tint rounded-inner text-text flex h-11 items-center gap-1.5 px-2 text-sm font-medium"
      >
        <Icon name={selected?.icon ?? 'wallet'} className="text-text-muted size-4" />
        {selected?.name ?? 'Pilih dompet'}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Pilih dompet">
          <ul className="flex flex-col">
            {wallets.map((wallet) => (
              <li key={wallet.id}>
                <button
                  type="button"
                  onClick={() => select(wallet.id)}
                  aria-pressed={wallet.id === value}
                  className={cn(
                    'pressable-tint rounded-inner flex h-12 w-full items-center gap-3 px-2 text-left text-sm',
                    wallet.id === value ? 'text-brand-readable bg-brand-subtle' : 'text-text',
                  )}
                >
                  <Icon name={wallet.icon} className="size-5" aria-hidden="true" />
                  {wallet.name}
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
