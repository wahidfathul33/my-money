'use client';

/**
 * Tap-a-row detail sheet for `/transactions` history — docs/09 §3 "Tap item
 * → sheet detail dengan aksi Edit / Hapus". Supersedes task 07's
 * `TransactionDetailSheet` (`components/transaction-detail-sheet.tsx`,
 * removed — this task's own list is the only place it was used, per that
 * file's own header: "explicitly built as a placeholder for this task to
 * replace"). Built against `TransactionHistoryClientItem` instead of
 * `TransactionClientData` so it can render a `transfer` row too: neutral
 * amount, "A → B" meta line, and only "Hapus" — `updateTransaction`
 * (src/lib/services/transactions.ts) refuses `type: 'transfer'` rows, so
 * Edit stays hidden for those, but void/unvoid go through transfers' own
 * service (src/lib/services/transfers.ts) instead.
 *
 * Edit itself stays owned by the parent (`<TransactionList>`), exactly like
 * task 07's `TransactionDetailSheet` + `TransactionList` split — this
 * component only calls `onEdit()`.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { MoneyText } from '@/components/finance/money-text';
import { CategoryIcon } from '@/features/categories/components/category-icon';
import {
  historyItemAmount,
  signedHistoryAmount,
  type TransactionHistoryClientItem,
} from '../history-client-types';
import { unvoidTransactionAction, voidTransactionAction } from '../actions';
import { unvoidTransferAction, voidTransferAction } from '@/features/transfers/actions';

const LONG_DATE_FORMAT = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

interface TransactionHistoryDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: TransactionHistoryClientItem | null;
  onEdit: () => void;
}

export function TransactionHistoryDetailSheet({
  open,
  onOpenChange,
  item,
  onEdit,
}: TransactionHistoryDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Detail transaksi">
        {open && item && (
          <DetailContent item={item} onEdit={onEdit} onClose={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

interface DetailContentProps {
  item: TransactionHistoryClientItem;
  onEdit: () => void;
  onClose: () => void;
}

function DetailContent({ item, onEdit, onClose }: DetailContentProps) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const isTransfer = item.type === 'transfer';

  function handleDelete() {
    startTransition(async () => {
      const result = isTransfer
        ? await voidTransferAction(item.id)
        : await voidTransactionAction(item.id);
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
              if (isTransfer) await unvoidTransferAction(item.id);
              else await unvoidTransactionAction(item.id);
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
            <ArrowLeftRight className="size-5" aria-hidden="true" />
          </span>
        ) : item.category ? (
          <CategoryIcon icon={item.category.icon} color={item.category.color} />
        ) : (
          <span className="bg-surface-raised size-10 shrink-0 rounded-full" />
        )}
        <div className="min-w-0">
          <p className="text-text truncate font-medium">{isTransfer ? 'Transfer' : (item.category?.name ?? 'Transaksi')}</p>
          <p className="text-text-muted truncate text-sm">
            {isTransfer
              ? `${item.transferFrom?.name ?? item.counterpartyName ?? '—'} → ${item.transferTo?.name ?? item.counterpartyName ?? '—'}`
              : (item.wallet?.name ?? '—')}
          </p>
        </div>
      </div>

      {isTransfer ? (
        <MoneyText amount={historyItemAmount(item)} tone="neutral" size="display" />
      ) : (
        <MoneyText amount={signedHistoryAmount(item)} showSign size="display" />
      )}

      <div className="flex flex-col gap-1">
        <p className="text-text-muted text-sm">{LONG_DATE_FORMAT.format(item.transactionDate)}</p>
        {item.note && <p className="text-text text-sm">{item.note}</p>}
      </div>

      <div className="flex gap-2">
        {/* Editing a transfer is out of scope (tasks/08-transfers-self/spec.md
            only requires void) — only Hapus is offered for those. */}
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
