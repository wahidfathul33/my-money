'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createWalletAction, updateWalletAction, type ActionState } from '../actions';
import {
  WALLET_COLOR_OPTIONS,
  WALLET_ICON_OPTIONS,
  WALLET_TYPE_META,
  WALLET_TYPE_ORDER,
  type WalletType,
} from '../wallet-type-meta';
import type { WalletClientData } from '../client-types';

const TYPE_OPTIONS = WALLET_TYPE_ORDER.map((type) => ({
  value: type,
  label: WALLET_TYPE_META[type].label,
}));

const initialState: ActionState = { error: null };

interface WalletFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present => edit mode (name/icon/color only, type locked). Absent =>
   * create mode (name/type/opening balance, icon/color derived from type
   * but still adjustable). */
  wallet?: WalletClientData;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full">
      {label}
    </Button>
  );
}

export function WalletFormSheet({ open, onOpenChange, wallet }: WalletFormSheetProps) {
  const isEdit = Boolean(wallet);
  const action = isEdit ? updateWalletAction : createWalletAction;
  const [state, formAction, isPending] = useActionState(action, initialState);

  const [type, setType] = useState<WalletType>(wallet?.type ?? 'cash');
  const [icon, setIcon] = useState(wallet?.icon ?? WALLET_TYPE_META[type].icon);
  const [color, setColor] = useState(wallet?.color ?? WALLET_TYPE_META[type].color);

  const wasPending = useRef(isPending);
  useEffect(() => {
    if (wasPending.current && !isPending && state.error === null) {
      onOpenChange(false);
    }
    wasPending.current = isPending;
  }, [isPending, state.error, onOpenChange]);

  // Reset local form state whenever the sheet opens fresh (new wallet, or
  // re-opening create after a previous submit) rather than carrying over
  // whatever was left from the last time it was open. Done during render
  // (React's documented "adjusting state when a prop changes" pattern),
  // not inside an Effect — an Effect here would setState synchronously
  // after the initial render, costing an extra, visible render pass.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setType(wallet?.type ?? 'cash');
      setIcon(wallet?.icon ?? WALLET_TYPE_META[wallet?.type ?? 'cash'].icon);
      setColor(wallet?.color ?? WALLET_TYPE_META[wallet?.type ?? 'cash'].color);
    }
  }

  function handleTypeChange(next: string) {
    const nextType = next as WalletType;
    setType(nextType);
    // Re-suggest icon/color for the new type — the user can still override
    // either afterward via the chip grids below.
    setIcon(WALLET_TYPE_META[nextType].icon);
    setColor(WALLET_TYPE_META[nextType].color);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        variant="bottom"
        title={isEdit ? 'Ubah dompet' : 'Tambah dompet'}
        description={
          isEdit ? undefined : 'Kartu kredit dicatat sebagai liabilitas — saldonya tidak boleh positif.'
        }
      >
        {/*
         * No height cap of its own — the outer `.sheet-scroll`
         * (globals.css) already caps the WHOLE sheet at `max-height: 85dvh`
         * with real `overflow-y: auto`, so grabber + title + description +
         * this form scroll together as one unit past that point. An
         * earlier version of this form additionally self-capped at
         * `max-h-[50vh]` to work around content becoming unreachable below
         * the fold — re-verified via Playwright on both a 393×851 and a
         * 375×667 mobile viewport that this no longer reproduces (the
         * button past the fold on the smaller viewport is still reachable
         * via scroll and passes an actionability check), so the extra cap
         * was just costing an unnecessary scrollbar on every larger screen.
         */}
        <form action={formAction} className="flex flex-col gap-4 pb-1">
          {isEdit && <input type="hidden" name="walletId" value={wallet!.id} />}
          <input type="hidden" name="icon" value={icon} />
          <input type="hidden" name="color" value={color} />

          <Input label="Nama dompet" name="name" defaultValue={wallet?.name} required maxLength={60} />

          {!isEdit && (
            <>
              <input type="hidden" name="type" value={type} />
              <Select
                label="Jenis dompet"
                options={TYPE_OPTIONS}
                value={type}
                onValueChange={handleTypeChange}
              />
              <Input label="Saldo awal (Rp)" name="openingBalance" type="money" defaultValue="0" />
            </>
          )}

          {isEdit && (
            <p className="text-text-muted text-sm">
              Jenis: <span className="text-text font-medium">{WALLET_TYPE_META[wallet!.type].label}</span>
            </p>
          )}

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-text text-sm font-medium">Ikon</legend>
            <div className="grid grid-cols-4 gap-2">
              {WALLET_ICON_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={icon === option.value}
                  aria-label={option.label}
                  onClick={() => setIcon(option.value)}
                  className={cn(
                    'pressable-tint flex h-11 items-center justify-center rounded-full border',
                    icon === option.value
                      ? 'border-brand bg-brand-subtle text-brand-readable'
                      : 'border-border text-text-muted',
                  )}
                >
                  <option.Icon className="size-5" aria-hidden="true" />
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-text text-sm font-medium">Warna</legend>
            <div className="grid grid-cols-4 gap-2">
              {WALLET_COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={color === option.value}
                  aria-label={option.label}
                  onClick={() => setColor(option.value)}
                  className={cn(
                    'pressable-tint flex h-11 items-center justify-center rounded-full border',
                    color === option.value ? 'border-brand' : 'border-transparent',
                  )}
                >
                  <span className={cn('size-6 rounded-full', option.swatchClass)} />
                </button>
              ))}
            </div>
          </fieldset>

          {state.error && (
            <p role="alert" className="text-negative text-sm">
              {state.error}
            </p>
          )}

          <SubmitButton label={isEdit ? 'Simpan perubahan' : 'Tambah dompet'} />
        </form>
      </SheetContent>
    </Sheet>
  );
}
