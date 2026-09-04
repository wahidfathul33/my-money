'use client';

/**
 * Withdrawal sheet — the reverse of contribute-sheet.tsx, with the one rule
 * spec.md is explicit about: "hanya menampilkan kontribusi milik sendiri."
 * `available` (the caller's OWN net-funded amount on this goal — see
 * src/features/savings/queries.ts's `getOwnFundedAmount`) is shown up
 * front and enforced client-side; the server (src/lib/services/savings.ts's
 * `withdraw`) enforces the SAME limit independently, so this is a UX
 * courtesy, not the actual security boundary.
 */
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { MoneyText } from '@/components/finance/money-text';
import { AmountKeypad } from '@/features/transactions/components/amount-keypad';
import { WalletPicker } from '@/features/transactions/components/wallet-picker';
import { evaluateExpression, formatExpression } from '@/features/transactions/amount-math';
import { deserializeMoney, serializeMoney } from '@/lib/finance/money';
import { withdrawAction } from '../actions';
import type { WalletOption } from '@/features/transactions/sheet-data';

interface WithdrawSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalId: string;
  goalName: string;
  goalHouseholdId: string | null;
  /** The caller's OWN net-funded amount on this goal (serialized). */
  available: string;
  wallets: WalletOption[];
  defaultWalletId: string | null;
}

export function WithdrawSheet(props: WithdrawSheetProps) {
  const { open, onOpenChange } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent variant="bottom" title={`Tarik dari ${props.goalName}`}>
        {open && <WithdrawSheetForm {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function WithdrawSheetForm({
  onOpenChange,
  goalId,
  goalHouseholdId,
  available,
  wallets,
  defaultWalletId,
}: WithdrawSheetProps) {
  const router = useRouter();
  const toast = useToast();
  const [expression, setExpression] = useState('');
  const [walletId, setWalletId] = useState<string>(defaultWalletId ?? wallets[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const availableAmount = deserializeMoney(available);
  const amount = evaluateExpression(expression);
  const saveDisabled = amount <= 0n || amount > availableAmount || walletId === '' || isPending;

  function handleSave() {
    if (saveDisabled) return;
    setError(null);
    startTransition(async () => {
      const result = await withdrawAction({
        goalId,
        goalHouseholdId,
        walletId,
        amount: serializeMoney(amount),
        withdrawalDate: new Date(),
        note: null,
        idempotencyKey: idempotencyKeyRef.current,
      });
      if (result.error) {
        setError(result.error);
        return;
      }

      onOpenChange(false);
      router.refresh();
      toast.show({ title: 'Penarikan tersimpan', variant: 'success' });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {availableAmount <= 0n ? (
        <p className="text-text-muted text-center text-sm">
          Anda belum memiliki kontribusi pada goal ini untuk ditarik.
        </p>
      ) : (
        <>
          <p className="text-text-muted text-center text-sm">
            Kontribusi Anda pada goal ini: <MoneyText amount={availableAmount} tone="plain" size="sm" />
          </p>

          <WalletPicker wallets={wallets} value={walletId} onChange={setWalletId} triggerLabel="Dompet tujuan" />

          <p role="status" aria-label="Jumlah" className="font-money text-hero text-text py-2 text-center">
            {formatExpression(expression)}
          </p>

          {amount > availableAmount && (
            <p className="text-negative text-center text-sm">Melebihi kontribusi Anda pada goal ini</p>
          )}
          {error && (
            <p role="alert" className="text-negative text-center text-sm">
              {error}
            </p>
          )}

          <AmountKeypad
            expression={expression}
            onExpressionChange={setExpression}
            onSave={handleSave}
            saveDisabled={saveDisabled}
            saving={isPending}
          />
        </>
      )}
    </div>
  );
}
