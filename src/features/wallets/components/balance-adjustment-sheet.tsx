'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MoneyText } from '@/components/finance/money-text';
import { fromRupiah } from '@/lib/finance/money';
import { adjustWalletBalanceAction, type ActionState } from '../actions';
import { walletBalance, type WalletClientData } from '../client-types';

const initialState: ActionState = { error: null };

interface BalanceAdjustmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: WalletClientData;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full">
      Simpan penyesuaian
    </Button>
  );
}

/**
 * Balance adjustment — never overwrites (docs/03 §6 "Aturan Penting"). Shows
 * the delta that will be recorded as an `adjustment` ledger entry BEFORE
 * submit (tasks/05-wallets/todo.md: "menampilkan selisih yang akan dicatat"),
 * so the correction is transparent rather than a silent balance overwrite.
 */
export function BalanceAdjustmentSheet({ open, onOpenChange, wallet }: BalanceAdjustmentSheetProps) {
  const [state, formAction, isPending] = useActionState(adjustWalletBalanceAction, initialState);
  const [raw, setRaw] = useState('');

  const wasPending = useRef(isPending);
  useEffect(() => {
    if (wasPending.current && !isPending && state.error === null) {
      onOpenChange(false);
    }
    wasPending.current = isPending;
  }, [isPending, state.error, onOpenChange]);

  // Reset during render (not an Effect) when the sheet opens fresh — see
  // the identical pattern + rationale in wallet-form-sheet.tsx.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setRaw('');
  }

  const currentBalance = walletBalance(wallet);
  let delta: bigint | null = null;
  try {
    delta = raw.trim() === '' ? 0n : fromRupiah(raw) - currentBalance;
  } catch {
    delta = null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        variant="bottom"
        title="Sesuaikan saldo"
        description="Selisihnya dicatat sebagai penyesuaian, bukan menimpa riwayat."
      >
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="walletId" value={wallet.id} />

          <div className="flex items-center justify-between">
            <span className="text-text-muted text-sm">Saldo tercatat</span>
            <MoneyText
              amount={currentBalance}
              tone="plain"
              showSign={wallet.type !== 'credit_card'}
            />
          </div>

          <Input
            label="Saldo sebenarnya (Rp)"
            name="actualBalance"
            type="money"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="0"
            autoFocus
          />

          {delta !== null && (
            <div className="bg-surface-raised rounded-inner flex items-center justify-between p-3">
              <span className="text-text-muted text-sm">Penyesuaian yang dicatat</span>
              <MoneyText amount={delta} tone="auto" showSign />
            </div>
          )}

          {state.error && (
            <p role="alert" className="text-negative text-sm">
              {state.error}
            </p>
          )}

          <SubmitButton />
        </form>
      </SheetContent>
    </Sheet>
  );
}
