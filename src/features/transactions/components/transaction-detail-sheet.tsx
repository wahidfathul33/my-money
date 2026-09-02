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
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { MoneyText } from '@/components/finance/money-text';
import { CategoryIcon } from '@/features/categories/components/category-icon';
import { signedTransactionAmount, type TransactionClientData } from '../client-types';
import { unvoidTransactionAction, voidTransactionAction } from '../actions';

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

  function handleDelete() {
    startTransition(async () => {
      const result = await voidTransactionAction(transaction.id);
      if (result.error) return;

      onClose();
      router.refresh();
      toast.show({
        title: 'Transaksi dihapus',
        variant: 'success',
        action: {
          label: 'Urungkan',
          onClick: () => {
            startTransition(async () => {
              await unvoidTransactionAction(transaction.id);
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
        {transaction.category ? (
          <CategoryIcon icon={transaction.category.icon} color={transaction.category.color} />
        ) : (
          <span className="bg-surface-raised size-10 shrink-0 rounded-full" />
        )}
        <div className="min-w-0">
          <p className="text-text truncate font-medium">{transaction.category?.name ?? 'Transaksi'}</p>
          <p className="text-text-muted truncate text-sm">{transaction.wallet?.name ?? '—'}</p>
        </div>
      </div>

      <MoneyText amount={signedTransactionAmount(transaction)} showSign size="display" />

      <div className="flex flex-col gap-1">
        <p className="text-text-muted text-sm">{LONG_DATE_FORMAT.format(transaction.transactionDate)}</p>
        {transaction.note && <p className="text-text text-sm">{transaction.note}</p>}
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onEdit} disabled={isPending}>
          <Pencil className="size-4" aria-hidden="true" />
          Edit
        </Button>
        <Button variant="danger" className="flex-1" loading={isPending} onClick={handleDelete}>
          <Trash2 className="size-4" aria-hidden="true" />
          Hapus
        </Button>
      </div>
    </div>
  );
}
