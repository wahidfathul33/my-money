'use client';

/**
 * Withdrawal confirmation — shows pokok + bunga bersih yang akan diterima
 * (todo.md), with an early-withdrawal warning when applicable. Unlike
 * savings' withdraw-sheet.tsx, there's no amount to TYPE — the payout is
 * COMPUTED (principal + interest accrued to date), so this is a plain
 * confirmation dialog with a destination-wallet picker, not a keypad flow.
 *
 * The figure shown here is a PREVIEW using `new Date()` at render time;
 * the SERVER recomputes it independently using the actual submission
 * instant as `withdrawalDate` (src/lib/services/deposits.ts's
 * `withdrawDeposit`) — the two can differ by the few seconds/minutes
 * between opening this dialog and confirming, which is why the preview is
 * worded as an estimate too, not a locked-in guarantee.
 */
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { MoneyText } from '@/components/finance/money-text';
import { useToast } from '@/components/ui/toast';
import { accruedInterest, currentValue, daysRemaining } from '@/lib/finance/deposit';
import { deserializeMoney, formatIDR } from '@/lib/finance/money';
import { withdrawDepositAction } from '../actions';
import { toDepositSnapshot, type DepositDetailClientData } from '../client-types';
import type { WalletOption } from '@/features/transactions/sheet-data';

interface WithdrawDepositDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deposit: DepositDetailClientData;
  wallets: WalletOption[];
}

export function WithdrawDepositDialog(props: WithdrawDepositDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent variant="bottom" title={`Cairkan deposito ${props.deposit.bankName}`}>
        {open && <WithdrawDepositDialogForm {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function WithdrawDepositDialogForm({ onOpenChange, deposit, wallets }: WithdrawDepositDialogProps) {
  const router = useRouter();
  const toast = useToast();
  const [walletId, setWalletId] = useState<string>(deposit.walletId ?? wallets[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const snapshot = toDepositSnapshot(deposit);
  const now = new Date();
  const remaining = daysRemaining(snapshot, now);
  const netInterest = accruedInterest(snapshot, now);
  const principal = currentValue(snapshot);
  const totalEstimate = principal + netInterest;
  const isEarly = deposit.status === 'active' && remaining > 0;

  const walletOptions = wallets.map((w) => ({ value: w.id, label: w.name }));
  const saveDisabled = walletId === '' || isPending;

  function handleWithdraw() {
    if (saveDisabled) return;
    setError(null);
    startTransition(async () => {
      const result = await withdrawDepositAction({
        depositId: deposit.id,
        walletId,
        withdrawalDate: new Date(),
        idempotencyKey: idempotencyKeyRef.current,
      });
      if (result.error) {
        setError(result.error);
        return;
      }

      onOpenChange(false);
      router.refresh();
      toast.show({
        title: 'Deposito dicairkan',
        description: result.totalCredited
          ? `${formatIDR(deserializeMoney(result.totalCredited))} masuk ke dompet Anda`
          : undefined,
        variant: 'success',
      });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-surface-raised rounded-card flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <span className="text-text-muted text-sm">Pokok</span>
          <MoneyText amount={principal} tone="plain" size="sm" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-muted text-sm">Estimasi bunga bersih</span>
          <MoneyText amount={netInterest} tone="neutral" size="sm" />
        </div>
        <div className="border-border flex items-center justify-between border-t pt-2">
          <span className="text-text text-sm font-medium">Perkiraan diterima</span>
          <MoneyText amount={totalEstimate} tone="plain" size="md" />
        </div>
      </div>

      {isEarly && (
        <p className="bg-warning-subtle text-warning-readable rounded-inner p-3 text-sm">
          Ini pencairan sebelum jatuh tempo ({remaining} hari lagi). Estimasi di atas dihitung sampai hari ini —
          bank Anda mungkin memotong atau menghanguskan sebagian bunga untuk pencairan dini; aplikasi ini tidak
          menghitung penalti tersebut secara otomatis.
        </p>
      )}

      <Select label="Cairkan ke dompet" options={walletOptions} value={walletId} onValueChange={setWalletId} placeholder="Pilih dompet" />

      {error && (
        <p role="alert" className="text-negative text-sm">
          {error}
        </p>
      )}

      <Button onClick={handleWithdraw} loading={isPending} disabled={saveDisabled} className="w-full">
        Cairkan deposito
      </Button>
    </div>
  );
}
