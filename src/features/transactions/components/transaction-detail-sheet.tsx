'use client';

/**
 * Tap-a-list-item detail sheet — Edit / Hapus, docs/09 §3 "Tap item → sheet
 * detail dengan aksi Edit / Hapus". Hapus has NO confirmation dialog
 * (docs/08 §5.8: reversible actions get toast+"Urungkan", not a dialog —
 * void is reversible via `unvoidTransactionAction`) and applies
 * immediately, matching tasks/07 todo.md "Hapus langsung diterapkan + undo
 * (tanpa dialog)".
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { MoneyText } from '@/components/finance/money-text';
import { CategoryIcon } from '@/features/categories/components/category-icon';
import { signedTransactionAmount, transactionAmount, type TransactionClientData } from '../client-types';
import { unvoidTransactionAction, voidTransactionAction } from '../actions';
import { unvoidTransferAction, voidTransferAction } from '@/features/transfers/actions';

const LONG_DATE_FORMAT = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

interface TransactionDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionClientData | null;
  onEdit: () => void;
}

export function TransactionDetailSheet({
  open,
  onOpenChange,
  transaction,
  onEdit,
}: TransactionDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Detail transaksi">
        {open && transaction && (
          <DetailContent
            transaction={transaction}
            onEdit={onEdit}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

interface DetailContentProps {
  transaction: TransactionClientData;
  onEdit: () => void;
  onClose: () => void;
}

function DetailContent({ transaction, onEdit, onClose }: DetailContentProps) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const isTransfer = transaction.type === 'transfer';

  function handleDelete() {
    startTransition(async () => {
      const result = isTransfer
        ? await voidTransferAction(transaction.id)
        : await voidTransactionAction(transaction.id);
      if (result.error) return;

      onClose();
      router.refresh();
      toast.show({
        title: isTransfer ? 'Transfer dihapus' : 'Transaksi dihapus',
        variant: 'success',
        action: {
          label: 'Urungkan',
          onClick: () => {
            startTransition(async () => {
              if (isTransfer) await unvoidTransferAction(transaction.id);
              else await unvoidTransactionAction(transaction.id);
              router.refresh();
            });
          },
        },
      });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {isTransfer ? (
          <span className="bg-surface-raised text-text-muted flex size-10 shrink-0 items-center justify-center rounded-full">
            <ArrowLeftRight className="size-4" aria-hidden="true" />
          </span>
        ) : transaction.category ? (
          <CategoryIcon icon={transaction.category.icon} color={transaction.category.color} />
        ) : (
          <span className="bg-surface-raised size-10 shrink-0 rounded-full" />
        )}
        <div className="min-w-0">
          <p className="text-text truncate font-medium">
            {isTransfer
              ? `${transaction.transfer!.fromWallet.name} → ${transaction.transfer!.toWallet.name}`
              : (transaction.category?.name ?? 'Transaksi')}
          </p>
          <p className="text-text-muted truncate text-sm">
            {isTransfer ? 'Transfer' : (transaction.wallet?.name ?? '—')}
          </p>
        </div>
      </div>

      {isTransfer ? (
        <MoneyText amount={transactionAmount(transaction)} tone="neutral" size="display" />
      ) : (
        <MoneyText amount={signedTransactionAmount(transaction)} showSign size="display" />
      )}

      <div className="flex flex-col gap-1">
        <p className="text-text-muted text-sm">{LONG_DATE_FORMAT.format(transaction.transactionDate)}</p>
        {transaction.note && <p className="text-text text-sm">{transaction.note}</p>}
      </div>

      <div className="flex gap-2">
        {/* Editing a transfer is out of scope (tasks/08-transfers-self/spec.md
            only requires void) — only Hapus is offered. */}
        {!isTransfer && (
          <Button variant="secondary" className="flex-1" onClick={onEdit} disabled={isPending}>
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </Button>
        )}
        <Button variant="danger" className="flex-1" loading={isPending} onClick={handleDelete}>
          <Trash2 className="size-4" aria-hidden="true" />
          Hapus
        </Button>
      </div>
    </div>
  );
}
