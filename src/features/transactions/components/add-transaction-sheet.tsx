'use client';

/**
 * The Add Transaction sheet — docs/09-screen-specs.md §2, the "3-tap" flow
 * tasks/07-transactions-core/spec.md calls the most important interaction
 * in the app: FAB → type amount → tap a category chip → tap Simpan.
 *
 * `<AddTransactionSheet>` owns the open/close lifecycle (including the
 * "Buang input?" discard confirmation) and is used by BOTH `<BottomNav>`
 * (mobile FAB, `variant="bottom"`) and `<Sidebar>` (desktop "+ Tambah",
 * `variant="center"`) with the SAME server-fetched `AddTransactionSheetData`
 * — one component, two presentations, matching src/components/ui/sheet.tsx's
 * own "Sheet & Dialog are the same component" pattern.
 *
 * The actual field UI (tabs/keypad/pickers) lives in `./transaction-editor.tsx`,
 * shared with `./edit-transaction-sheet.tsx` — this component only owns
 * create-specific state and the `createTransactionAction` call.
 *
 * `<AddTransactionSheetForm>` is only mounted while `open` is true (the same
 * technique src/features/categories/components/category-sheet.tsx uses) —
 * every open therefore mounts a FRESH form, which is what makes the
 * `idempotencyKey` regenerate "every time the sheet is reopened"
 * (tasks/07 spec.md) fall out of a plain `useState(() => crypto.randomUUID())`
 * initializer for free, with no reset-in-effect needed.
 */
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { serializeMoney } from '@/lib/finance/money';
import { evaluateExpression } from '../amount-math';
import { createTransactionAction, voidTransactionAction } from '../actions';
import type { RecordableTransactionType } from '../queries';
import type { AddTransactionSheetData } from '../sheet-data';
import { TransactionEditor } from './transaction-editor';

interface AddTransactionSheetProps extends AddTransactionSheetData {
  trigger: ReactNode;
  variant?: 'bottom' | 'center';
}

export function AddTransactionSheet({ trigger, variant = 'bottom', ...data }: AddTransactionSheetProps) {
  const [open, setOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  // A ref, not state — this only needs to be read at close time, and
  // updating it must never itself trigger a re-render (it changes on every
  // keystroke).
  const hasInputRef = useRef(false);

  function handleOpenChange(next: boolean) {
    if (!next && hasInputRef.current) {
      setDiscardOpen(true);
      return;
    }
    setOpen(next);
  }

  function confirmDiscard() {
    hasInputRef.current = false;
    setDiscardOpen(false);
    setOpen(false);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent variant={variant} title="Tambah transaksi">
          {open && (
            <AddTransactionSheetForm
              {...data}
              onHasInputChange={(hasInput) => {
                hasInputRef.current = hasInput;
              }}
              onDone={() => {
                hasInputRef.current = false;
                setOpen(false);
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Reversible action (Simpan → toast+Urungkan) doesn't get a dialog
          (docs/08 §5.8), but discarding unsaved TYPED input is destructive
          and invisible once gone — it keeps its confirmation. */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent variant="center" title="Buang input?">
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDiscardOpen(false)}>
              Batal
            </Button>
            <Button variant="danger" className="flex-1" onClick={confirmDiscard}>
              Buang
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface AddTransactionSheetFormProps extends AddTransactionSheetData {
  onHasInputChange: (hasInput: boolean) => void;
  onDone: () => void;
}

function AddTransactionSheetForm({
  wallets,
  defaultWalletId,
  quickCategories,
  fullCategories,
  onHasInputChange,
  onDone,
}: AddTransactionSheetFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<RecordableTransactionType>('expense');
  const [expression, setExpression] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string>(defaultWalletId ?? wallets[0]?.id ?? '');
  const [date, setDate] = useState<Date>(() => new Date());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Generated once per mount — this component only mounts while the sheet
  // is open (see AddTransactionSheet above), so "regenerated every time the
  // sheet is reopened" (tasks/07 spec.md) is automatic.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    onHasInputChange(expression !== '');
  }, [expression, onHasInputChange]);

  const amount = evaluateExpression(expression);
  const saveDisabled = amount <= 0n || categoryId === null || walletId === '' || isPending;

  function handleTypeChange(next: RecordableTransactionType) {
    setType(next);
    // Categories are type-specific — docs/03 §8.4 "category.type cocok" — a
    // chip valid for Pengeluaran is never valid for Pemasukan.
    setCategoryId(null);
  }

  function handleSave() {
    if (saveDisabled || categoryId === null) return;
    setError(null);

    startTransition(async () => {
      const result = await createTransactionAction({
        type,
        amount: serializeMoney(amount),
        categoryId,
        walletId,
        transactionDate: date,
        note,
        idempotencyKey: idempotencyKeyRef.current,
      });

      if (result.error || !result.transactionId) {
        setError(result.error ?? 'Gagal menyimpan. Data Anda tidak berubah — coba lagi.');
        return;
      }

      const newTransactionId = result.transactionId;
      onHasInputChange(false);
      onDone();
      router.refresh();
      toast.show({
        title: 'Tersimpan',
        variant: 'success',
        action: {
          label: 'Urungkan',
          onClick: () => {
            startTransition(async () => {
              await voidTransactionAction(newTransactionId);
              router.refresh();
            });
          },
        },
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
      wallets={wallets}
      quickCategories={quickCategories}
      fullCategories={fullCategories}
      error={error}
      saveDisabled={saveDisabled}
      saving={isPending}
      onSave={handleSave}
    />
  );
}
