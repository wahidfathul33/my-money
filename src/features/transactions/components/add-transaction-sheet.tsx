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
import { createMemberTransferAction, createSelfTransferAction, voidTransferAction } from '@/features/transfers/actions';
import { ConfirmMemberTransfer } from '@/features/transfers/components/confirm-member-transfer';
import type { MemberTransferSelection } from '@/features/transfers/components/transfer-target-picker';
import { getLastHouseholdChoice, setLastHouseholdChoice } from '@/features/sharing/last-household-choice';
import { evaluateExpression } from '../amount-math';
import { createTransactionAction, voidTransactionAction } from '../actions';
import type { AddTransactionSheetData } from '../sheet-data';
import { TransactionEditor, type EditorTabType, type TransferMode } from './transaction-editor';

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
  hasHousehold,
  memberTransferPeople,
  households,
  onHasInputChange,
  onDone,
}: AddTransactionSheetFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<EditorTabType>('expense');
  const [expression, setExpression] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string>(defaultWalletId ?? wallets[0]?.id ?? '');
  // The 🏠 toggle — tasks/12-sharing-and-privacy. Defaults to "not tagged";
  // `handleCategoryChange` below applies the remembered per-category choice
  // (spec.md "Pilihan household terakhir diingat per kategori") the moment
  // a category is picked.
  const [householdId, setHouseholdId] = useState<string | null>(null);
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

  // tasks/13-transfers-member — the "Ke anggota keluarga" half of the
  // Transfer tab. `memberSelection` carries the counterparty + household +
  // destination wallet together (src/features/transfers/components/transfer-target-picker.tsx)
  // since a member-transfer's `toWalletId` alone doesn't determine WHICH
  // household governs it the way a self-transfer's does.
  const [transferMode, setTransferMode] = useState<TransferMode>('own');
  const [memberSelection, setMemberSelection] = useState<MemberTransferSelection | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    onHasInputChange(expression !== '');
  }, [expression, onHasInputChange]);

  const amount = evaluateExpression(expression);
  const isMemberTransfer = type === 'transfer' && transferMode === 'member';
  const saveDisabled =
    amount <= 0n ||
    walletId === '' ||
    isPending ||
    (type === 'transfer'
      ? isMemberTransfer
        ? memberSelection === null
        : toWalletId === '' || toWalletId === walletId
      : categoryId === null);

  function handleTypeChange(next: EditorTabType) {
    setType(next);
    // Categories are type-specific — docs/03 §8.4 "category.type cocok" — a
    // chip valid for Pengeluaran is never valid for Pemasukan. Irrelevant
    // for Transfer (category is always NULL there), but harmless to clear.
    setCategoryId(null);
  }

  /**
   * tasks/12-sharing-and-privacy spec.md: "Pilihan household terakhir
   * diingat per kategori" — the moment a category is picked, prefill the
   * 🏠 toggle from whatever household was last used for THAT category
   * (src/features/sharing/last-household-choice.ts), falling back to "not
   * tagged" the first time, or if the remembered household isn't one of
   * the caller's active memberships anymore (they may have left it since).
   */
  function handleCategoryChange(id: string) {
    setCategoryId(id);
    const remembered = getLastHouseholdChoice(id);
    const stillActive = remembered !== null && households.some((h) => h.id === remembered);
    setHouseholdId(stillActive ? remembered : null);
  }

  function handleHouseholdChange(id: string | null) {
    setHouseholdId(id);
    if (categoryId) setLastHouseholdChoice(categoryId, id);
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

  /** Shared by both save paths below — the toast/undo contract is identical
   * whether the new row is an income/expense, a self-transfer, or (via
   * `voidTransferAction`, generalized by task 13 to also sever a member
   * transfer's two-way link when either side is voided) a member transfer. */
  function finishSave(newTransactionId: string, kind: 'record' | 'self-transfer' | 'member-transfer') {
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
            if (kind === 'record') await voidTransactionAction(newTransactionId);
            else await voidTransferAction(newTransactionId);
            router.refresh();
          });
        },
      },
    });
  }

  function handleSave() {
    if (saveDisabled) return;
    if (type !== 'transfer' && categoryId === null) return;

    // A member transfer confirms first — docs/10-ux-states.md §5.2, spec.md:
    // its effect lands on someone ELSE's ledger. Everything else (self-
    // transfer, income, expense) saves immediately, matching every other
    // reversible action in this app.
    if (isMemberTransfer) {
      setError(null);
      setConfirmError(null);
      setConfirmOpen(true);
      return;
    }

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
              householdId,
            });

      if (result.error || !result.transactionId) {
        setError(result.error ?? 'Gagal menyimpan. Data Anda tidak berubah — coba lagi.');
        return;
      }

      finishSave(result.transactionId, type === 'transfer' ? 'self-transfer' : 'record');
    });
  }

  function handleConfirmMemberTransfer() {
    if (!memberSelection) return;

    startTransition(async () => {
      const result = await createMemberTransferAction({
        householdId: memberSelection.householdId,
        fromWalletId: walletId,
        counterpartyUserId: memberSelection.counterpartyUserId,
        toWalletId: memberSelection.toWalletId,
        amount: serializeMoney(amount),
        transactionDate: date,
        note,
        idempotencyKey: idempotencyKeyRef.current,
      });

      if (result.error || !result.transactionId) {
        setConfirmError(result.error ?? 'Gagal menyimpan. Data Anda tidak berubah — coba lagi.');
        return;
      }

      setConfirmOpen(false);
      finishSave(result.transactionId, 'member-transfer');
    });
  }

  const selectedCounterparty = memberTransferPeople.find(
    (person) => person.userId === memberSelection?.counterpartyUserId,
  );
  const selectedTargetWallet = selectedCounterparty?.wallets.find(
    (wallet) => wallet.id === memberSelection?.toWalletId,
  );
  const selectedFromWallet = wallets.find((w) => w.id === walletId);

  return (
    <>
      <TransactionEditor
        type={type}
        onTypeChange={handleTypeChange}
        expression={expression}
        onExpressionChange={setExpression}
        categoryId={categoryId}
        onCategoryChange={handleCategoryChange}
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
        hasHousehold={hasHousehold}
        memberTransferPeople={memberTransferPeople}
        transferMode={transferMode}
        onTransferModeChange={setTransferMode}
        memberSelection={memberSelection}
        onMemberSelectionChange={setMemberSelection}
        households={households}
        householdId={householdId}
        onHouseholdChange={handleHouseholdChange}
      />

      {isMemberTransfer && selectedCounterparty && selectedTargetWallet && selectedFromWallet && (
        <ConfirmMemberTransfer
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          amount={amount}
          fromWalletName={selectedFromWallet.name}
          toWalletName={selectedTargetWallet.name}
          counterpartyName={selectedCounterparty.name ?? selectedCounterparty.email}
          onConfirm={handleConfirmMemberTransfer}
          pending={isPending}
          error={confirmError}
        />
      )}
    </>
  );
}
