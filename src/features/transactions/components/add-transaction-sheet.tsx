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
import { createSelfTransferAction, voidTransferAction } from '@/features/transfers/actions';
import { evaluateExpression } from '../amount-math';
import { createTransactionAction, voidTransactionAction } from '../actions';
import type { AddTransactionSheetData } from '../sheet-data';
import { TransactionEditor, type EditorTabType } from './transaction-editor';

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
  const [type, setType] = useState<EditorTabType>('expense');
  const [expression, setExpression] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string>(defaultWalletId ?? wallets[0]?.id ?? '');
  // Transfer's destination wallet — defaults to the first ACTIVE wallet
  // that isn't already the source, so a user with 2+ wallets can hit Simpan
  // on the Transfer tab without touching either picker first.
  const [toWalletId, setToWalletId] = useState<string>(
    () => wallets.find((w) => w.id !== (defaultWalletId ?? wallets[0]?.id))?.id ?? '',
  );
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
  const saveDisabled =
    amount <= 0n ||
    walletId === '' ||
    isPending ||
    (type === 'transfer' ? toWalletId === '' || toWalletId === walletId : categoryId === null);

  function handleTypeChange(next: EditorTabType) {
    setType(next);
    // Categories are type-specific — docs/03 §8.4 "category.type cocok" — a
    // chip valid for Pengeluaran is never valid for Pemasukan. Irrelevant
    // for Transfer (category is always NULL there), but harmless to clear.
    setCategoryId(null);
  }

  // Keeps the destination picker from silently matching the source when the
  // source changes underneath it — spec.md "Validasi menolak: dompet asal =
  // tujuan" is enforced server-side too, but the UI shouldn't let the two
  // pickers drift into an invalid pair in the first place.
  function handleFromWalletChange(id: string) {
    setWalletId(id);
    if (id === toWalletId) {
      setToWalletId(wallets.find((w) => w.id !== id)?.id ?? '');
    }
  }

  function handleSave() {
    if (saveDisabled) return;
    if (type !== 'transfer' && categoryId === null) return;
    setError(null);

    startTransition(async () => {
      const result =
        type === 'transfer'
          ? await createSelfTransferAction({
              fromWalletId: walletId,
              toWalletId,
              amount: serializeMoney(amount),
              transactionDate: date,
              note,
              idempotencyKey: idempotencyKeyRef.current,
            })
          : await createTransactionAction({
              type,
              amount: serializeMoney(amount),
              categoryId: categoryId!,
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
      const isTransfer = type === 'transfer';
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
              if (isTransfer) await voidTransferAction(newTransactionId);
              else await voidTransactionAction(newTransactionId);
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
      onWalletChange={handleFromWalletChange}
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
      allowTransfer
      toWalletId={toWalletId}
      onToWalletChange={setToWalletId}
    />
  );
}
