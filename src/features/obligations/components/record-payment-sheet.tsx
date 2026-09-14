'use client';

/**
 * Payment sheet — amount keypad (defaulted to the full remaining amount,
 * per todo.md: "nominal (default = sisa)", editable down for a partial
 * payment/cicilan) + wallet picker + payment date. Same structural
 * reference as src/features/savings/components/contribute-sheet.tsx: the
 * inner form is only mounted while `open` is true, so every open gets a
 * FRESH `idempotencyKey`.
 */
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { AmountKeypad } from '@/features/transactions/components/amount-keypad';
import { WalletPicker } from '@/features/transactions/components/wallet-picker';
import { evaluateExpression, formatExpression, moneyToExpression } from '@/features/transactions/amount-math';
import { deserializeMoney, serializeMoney } from '@/lib/finance/money';
import type { WalletOption } from '@/features/transactions/sheet-data';
import { recordDebtPaymentAction, recordReceivablePaymentAction } from '../actions';

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface RecordPaymentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'debt' | 'receivable';
  obligationId: string;
  name: string;
  /** Serialized `Money` — seeds the keypad so a full settlement is the
   * default, one tap away. */
  remainingAmount: string;
  wallets: WalletOption[];
  defaultWalletId: string | null;
}

export function RecordPaymentSheet(props: RecordPaymentSheetProps) {
  const { open, onOpenChange, kind, name } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        variant="bottom"
        title={`Catat pembayaran ${kind === 'debt' ? 'hutang' : 'piutang'} — ${name}`}
      >
        {open && <RecordPaymentSheetForm {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function RecordPaymentSheetForm({
  onOpenChange,
  kind,
  obligationId,
  remainingAmount,
  wallets,
  defaultWalletId,
}: RecordPaymentSheetProps) {
  const router = useRouter();
  const toast = useToast();
  const [expression, setExpression] = useState(() => moneyToExpression(deserializeMoney(remainingAmount)));
  const [walletId, setWalletId] = useState<string>(defaultWalletId ?? wallets[0]?.id ?? '');
  const [paymentDate, setPaymentDate] = useState(todayDateStr());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const amount = evaluateExpression(expression);
  const saveDisabled = amount <= 0n || walletId === '' || isPending;

  function handleSave() {
    if (saveDisabled) return;
    setError(null);
    startTransition(async () => {
      const input = {
        amount: serializeMoney(amount),
        walletId,
        paymentDate,
        note: null,
        idempotencyKey: idempotencyKeyRef.current,
      };
      const result =
        kind === 'debt'
          ? await recordDebtPaymentAction({ debtId: obligationId, ...input })
          : await recordReceivablePaymentAction({ receivableId: obligationId, ...input });

      if (result.error) {
        setError(result.error);
        return;
      }

      onOpenChange(false);
      router.refresh();
      toast.show({ title: 'Pembayaran tersimpan', variant: 'success' });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <WalletPicker wallets={wallets} value={walletId} onChange={setWalletId} triggerLabel="Dompet" />
        <label className="flex items-center gap-2">
          <span className="sr-only">Tanggal pembayaran</span>
          <input
            type="date"
            value={paymentDate}
            max={todayDateStr()}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="rounded-input border-border bg-surface text-text h-11 border px-3 text-sm"
          />
        </label>
      </div>

      <p role="status" aria-label="Jumlah" className="font-money text-hero text-text py-2 text-center">
        {formatExpression(expression)}
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
