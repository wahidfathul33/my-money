'use client';

/**
 * Contribution sheet — amount keypad + source wallet picker, mirroring
 * src/features/transactions/components/add-transaction-sheet.tsx's shape
 * (a contribution is structurally a transfer OUT of a wallet, see
 * src/lib/services/savings.ts's file header). The inner form is only
 * mounted while `open` is true (same technique, same file's doc comment) —
 * every open gets a FRESH `idempotencyKey`, so a re-opened sheet never
 * risks resubmitting the previous contribution's key.
 *
 * The net-worth-neutral note here is the ONE required copy line from
 * todo.md: "Kekayaan bersih Anda tidak berubah — dana dipindahkan, bukan
 * dibelanjakan."
 */
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { AmountKeypad } from '@/features/transactions/components/amount-keypad';
import { WalletPicker } from '@/features/transactions/components/wallet-picker';
import { evaluateExpression, formatExpression } from '@/features/transactions/amount-math';
import { deserializeMoney, serializeMoney } from '@/lib/finance/money';
import { calculateGoalProgress } from '@/lib/finance/savings';
import { contributeAction } from '../actions';
import type { WalletOption } from '@/features/transactions/sheet-data';

interface ContributeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalId: string;
  goalName: string;
  goalHouseholdId: string | null;
  /** Pre-contribution amounts (serialized) — used purely client-side to
   * detect "this contribution crosses the target" so the one-time
   * completion celebration (todo.md) can fire immediately on success,
   * without a second round trip. */
  targetAmount: string;
  currentAmount: string;
  wasCompleted: boolean;
  wallets: WalletOption[];
  defaultWalletId: string | null;
  onCompleted?: () => void;
}

export function ContributeSheet(props: ContributeSheetProps) {
  const { open, onOpenChange } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent variant="bottom" title={`Kontribusi ke ${props.goalName}`}>
        {open && <ContributeSheetForm {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function ContributeSheetForm({
  onOpenChange,
  goalId,
  goalHouseholdId,
  targetAmount,
  currentAmount,
  wasCompleted,
  wallets,
  defaultWalletId,
  onCompleted,
}: ContributeSheetProps) {
  const router = useRouter();
  const toast = useToast();
  const [expression, setExpression] = useState('');
  const [walletId, setWalletId] = useState<string>(defaultWalletId ?? wallets[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const amount = evaluateExpression(expression);
  const saveDisabled = amount <= 0n || walletId === '' || isPending;

  function handleSave() {
    if (saveDisabled) return;
    setError(null);
    startTransition(async () => {
      const result = await contributeAction({
        goalId,
        goalHouseholdId,
        walletId,
        amount: serializeMoney(amount),
        contributionDate: new Date(),
        note: null,
        idempotencyKey: idempotencyKeyRef.current,
      });
      if (result.error) {
        setError(result.error);
        return;
      }

      onOpenChange(false);
      router.refresh();
      toast.show({ title: 'Kontribusi tersimpan', variant: 'success' });

      const nowCompleted = calculateGoalProgress({
        targetAmount: deserializeMoney(targetAmount),
        currentAmount: deserializeMoney(currentAmount) + amount,
        targetDate: null,
      }).isCompleted;
      if (!wasCompleted && nowCompleted) onCompleted?.();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <WalletPicker wallets={wallets} value={walletId} onChange={setWalletId} triggerLabel="Dompet sumber" />

      <p role="status" aria-label="Jumlah" className="font-money text-hero text-text py-2 text-center">
        {formatExpression(expression)}
      </p>

      <p className="text-text-muted text-center text-xs">
        Kekayaan bersih Anda tidak berubah — dana dipindahkan, bukan dibelanjakan.
      </p>

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
    </div>
  );
}
