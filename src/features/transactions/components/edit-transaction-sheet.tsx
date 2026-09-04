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

interface EditTransactionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionClientData | null;
  sheetData: AddTransactionSheetData;
  onSaved: () => void;
}

/** A transfer's shape (2 wallets, no category) doesn't fit this form — editing one is out of tasks/08-transfers-self's scope (only void is). */
type EditableTransaction = TransactionClientData & { type: RecordableTransactionType };

function isEditable(transaction: TransactionClientData): transaction is EditableTransaction {
  return transaction.type !== 'transfer';
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
        {open && transaction && isEditable(transaction) && (
          <EditTransactionForm
            transaction={transaction}
            sheetData={sheetData}
            onDone={() => {
              onOpenChange(false);
              onSaved();
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

interface EditTransactionFormProps {
  transaction: EditableTransaction;
  sheetData: AddTransactionSheetData;
  onDone: () => void;
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

  // `TransactionEditor`'s tab value space includes 'transfer' (for the Add
  // sheet); this form passes `allowTransfer={false}` below so that tab never
  // renders, but the callback's declared type is still the wider union —
  // narrow it back here rather than widening `handleTypeChange` itself,
  // since every other line in this component only ever deals with
  // income/expense (editing a transfer is out of scope, see `isEditable` above).
  function handleEditorTypeChange(next: RecordableTransactionType | 'transfer') {
    if (next !== 'transfer') handleTypeChange(next);
  }

  function handleSave() {
    if (saveDisabled || categoryId === null) return;
    setError(null);

    startTransition(async () => {
      const result = await updateTransactionAction({
        transactionId: transaction.id,
        type,
        amount: serializeMoney(amount),
        categoryId,
        walletId,
        transactionDate: date,
        note,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      router.refresh();
      onDone();
    });
  }

  return (
    <TransactionEditor
      type={type}
      onTypeChange={handleEditorTypeChange}
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
