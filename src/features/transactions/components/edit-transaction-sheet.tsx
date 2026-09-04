'use client';

/**
 * Edit sheet — pre-fills `./transaction-editor.tsx` with the existing
 * transaction's values and calls `updateTransactionAction` instead of
 * `createTransactionAction`. No idempotency key (edits aren't retried the
 * same way a first save is) and no "Buang input?" discard confirmation
 * (tasks/07 spec.md only requires that for the create flow — an edit form
 * that's abandoned mid-change just leaves the original record untouched,
 * nothing typed is lost from the user's point of view).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { serializeMoney } from '@/lib/finance/money';
import { evaluateExpression, moneyToExpression } from '../amount-math';
import { transactionAmount, type TransactionClientData } from '../client-types';
import { updateTransactionAction } from '../actions';
import type { RecordableTransactionType } from '../queries';
import type { AddTransactionSheetData } from '../sheet-data';
import { TransactionEditor } from './transaction-editor';

/** The fields a successful edit changed — passed back to `onSaved` so a caller holding its OWN local copy of this transaction (src/features/transactions/components/transaction-list.tsx's `items` state, seeded from server props and not automatically refreshed by `router.refresh()`) can update it in place instead of showing stale values until the next full reload. */
export interface EditedTransactionFields {
  id: string;
  type: RecordableTransactionType;
  amount: string;
  categoryId: string;
  walletId: string;
  transactionDate: Date;
  note: string | null;
}

interface EditTransactionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionClientData | null;
  sheetData: AddTransactionSheetData;
  onSaved: (saved: EditedTransactionFields) => void;
}

export function EditTransactionSheet({
  open,
  onOpenChange,
  transaction,
  sheetData,
  onSaved,
}: EditTransactionSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Edit transaksi">
        {open && transaction && (
          <EditTransactionForm
            transaction={transaction}
            sheetData={sheetData}
            onDone={(saved) => {
              onOpenChange(false);
              onSaved(saved);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

interface EditTransactionFormProps {
  transaction: TransactionClientData;
  sheetData: AddTransactionSheetData;
  onDone: (saved: EditedTransactionFields) => void;
}

function EditTransactionForm({ transaction, sheetData, onDone }: EditTransactionFormProps) {
  const router = useRouter();
  const [type, setType] = useState<RecordableTransactionType>(transaction.type);
  const [expression, setExpression] = useState(() => moneyToExpression(transactionAmount(transaction)));
  const [categoryId, setCategoryId] = useState<string | null>(transaction.category?.id ?? null);
  const [walletId, setWalletId] = useState<string>(
    transaction.wallet?.id ?? sheetData.wallets[0]?.id ?? '',
  );
  const [date, setDate] = useState<Date>(transaction.transactionDate);
  const [note, setNote] = useState(transaction.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const amount = evaluateExpression(expression);
  const saveDisabled = amount <= 0n || categoryId === null || walletId === '' || isPending;

  function handleTypeChange(next: RecordableTransactionType) {
    setType(next);
    setCategoryId(null);
  }

  function handleSave() {
    if (saveDisabled || categoryId === null) return;
    setError(null);

    startTransition(async () => {
      const serializedAmount = serializeMoney(amount);
      const trimmedNote = note.trim() === '' ? null : note;
      const result = await updateTransactionAction({
        transactionId: transaction.id,
        type,
        amount: serializedAmount,
        categoryId,
        walletId,
        transactionDate: date,
        note: trimmedNote,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      router.refresh();
      onDone({
        id: transaction.id,
        type,
        amount: serializedAmount,
        categoryId,
        walletId,
        transactionDate: date,
        note: trimmedNote,
      });
    });
  }

  return (
    <TransactionEditor
      type={type}
      onTypeChange={handleTypeChange}
      expression={expression}
      onExpressionChange={setExpression}
      categoryId={categoryId}
      onCategoryChange={setCategoryId}
      walletId={walletId}
      onWalletChange={setWalletId}
      date={date}
      onDateChange={setDate}
      note={note}
      onNoteChange={setNote}
      wallets={sheetData.wallets}
      quickCategories={sheetData.quickCategories}
      fullCategories={sheetData.fullCategories}
      error={error}
      saveDisabled={saveDisabled}
      saving={isPending}
      onSave={handleSave}
    />
  );
}
