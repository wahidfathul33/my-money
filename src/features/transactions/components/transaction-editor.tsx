'use client';

/**
 * Shared, fully-controlled editor body — type tabs, amount display, keypad,
 * category picker, wallet/date/note meta row. Used by BOTH
 * `add-transaction-sheet.tsx` (create) and `edit-transaction-sheet.tsx`
 * (edit): the two differ only in which fields start pre-filled and which
 * Server Action `onSave` ultimately calls, not in how the fields behave —
 * factoring the fields out here keeps that behavior defined exactly once.
 */
import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { TransferForm } from '@/features/transfers/components/transfer-form';
import { HouseholdToggle, type HouseholdOption } from '@/features/sharing/components/household-toggle';
import { formatExpression } from '../amount-math';
import type { RecordableTransactionType } from '../queries';
import type { CategoryRow, CategoryWithChildren } from '../queries';
import type { WalletOption } from '../sheet-data';
import { AmountKeypad } from './amount-keypad';
import { CategoryPicker } from './category-picker';
import { DatePicker } from './date-picker';
import { WalletPicker } from './wallet-picker';

/** The tab bar's own value space — a superset of `RecordableTransactionType` used for actually recording a transaction (transfers get their own service, src/lib/services/transfers.ts). */
export type EditorTabType = RecordableTransactionType | 'transfer';

export interface TransactionEditorProps {
  type: EditorTabType;
  onTypeChange: (type: EditorTabType) => void;
  expression: string;
  onExpressionChange: (next: string) => void;
  categoryId: string | null;
  onCategoryChange: (id: string) => void;
  /** The single wallet for income/expense; the transfer's SOURCE wallet when `type === 'transfer'`. */
  walletId: string;
  onWalletChange: (id: string) => void;
  date: Date;
  onDateChange: (date: Date) => void;
  note: string;
  onNoteChange: (note: string) => void;
  wallets: WalletOption[];
  quickCategories: Record<RecordableTransactionType, CategoryRow[]>;
  fullCategories: Record<RecordableTransactionType, CategoryWithChildren[]>;
  error: string | null;
  saveDisabled: boolean;
  saving: boolean;
  onSave: () => void;
  /** Shows the "Transfer" tab and, when active, the Dari→Ke picker instead of the category row. Defaults to `false` — the edit sheet (transfers aren't editable, tasks/08-transfers-self/spec.md) never opts in. */
  allowTransfer?: boolean;
  /** The transfer's DESTINATION wallet — only meaningful (and only rendered) when `type === 'transfer'`. */
  toWalletId?: string;
  onToWalletChange?: (id: string) => void;
  /**
   * The caller's active household memberships — tasks/12-sharing-and-privacy
   * spec.md's 🏠 toggle. Defaults to `[]` so every EXISTING caller (and
   * every existing test) keeps compiling and rendering exactly as before:
   * an empty list renders nothing here at all, same as an account with no
   * household (todo.md "akun tanpa household melihat baris meta persis
   * seperti sebelumnya").
   */
  households?: HouseholdOption[];
  householdId?: string | null;
  onHouseholdChange?: (id: string | null) => void;
}

export function TransactionEditor({
  type,
  onTypeChange,
  expression,
  onExpressionChange,
  categoryId,
  onCategoryChange,
  walletId,
  onWalletChange,
  date,
  onDateChange,
  note,
  onNoteChange,
  wallets,
  quickCategories,
  fullCategories,
  error,
  saveDisabled,
  saving,
  onSave,
  allowTransfer = false,
  toWalletId = '',
  onToWalletChange,
  households = [],
  householdId = null,
  onHouseholdChange,
}: TransactionEditorProps) {
  // Lazy initializer — visible from the start when editing a transaction
  // that already has a note, without either caller (create/edit) having to
  // manage this bit itself.
  const [noteVisible, setNoteVisible] = useState(note !== '');

  if (wallets.length === 0) {
    return (
      <p className="text-text-muted py-8 text-center text-sm">
        Belum ada dompet aktif. Tambahkan dompet dulu untuk mulai mencatat.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={type} onValueChange={(v) => onTypeChange(v as EditorTabType)}>
        <TabsList variant="segmented" className="w-full">
          <TabsTrigger variant="segmented" value="expense">
            Pengeluaran
          </TabsTrigger>
          <TabsTrigger variant="segmented" value="income">
            Pemasukan
          </TabsTrigger>
          {allowTransfer && (
            <TabsTrigger variant="segmented" value="transfer">
              Transfer
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      <div className="flex flex-col items-center gap-1 py-1">
        <span className="text-text-muted text-sm">Rp</span>
        {/* status/aria-live — keypad taps have no other non-visual
            feedback, so the running total needs to reach screen readers too. */}
        <div
          role="status"
          aria-live="polite"
          aria-label="Jumlah"
          className="text-display font-money text-text tabular-nums font-semibold"
        >
          {formatExpression(expression)}
        </div>
      </div>

      {/* Transfer replaces the category row with a Dari→Ke wallet picker
          entirely (tasks/08-transfers-self/spec.md "Ganti baris kategori
          dengan pemilih asal → tujuan"; todo.md "Sembunyikan kategori
          sepenuhnya di mode transfer") — a transfer's `category_id` is
          always NULL (`tx_category_rule`), so there is no category to pick. */}
      {type === 'transfer' ? (
        <TransferForm
          wallets={wallets}
          fromWalletId={walletId}
          onFromWalletChange={onWalletChange}
          toWalletId={toWalletId}
          onToWalletChange={onToWalletChange ?? (() => {})}
        />
      ) : (
        <CategoryPicker
          quick={quickCategories[type]}
          full={fullCategories[type]}
          value={categoryId}
          onChange={onCategoryChange}
        />
      )}

      <div className="flex h-11 items-center gap-2">
        {/* The plain single-wallet picker only applies to income/expense —
            transfer's two wallets are both already selected in TransferForm
            above. */}
        {type !== 'transfer' && (
          <WalletPicker wallets={wallets} value={walletId} onChange={onWalletChange} />
        )}
        <DatePicker value={date} onChange={onDateChange} />
        {/* Household toggle (🏠) — tasks/12-sharing-and-privacy. Only
            mounted for a household member (`households` non-empty) on a
            recordable type — a transfer has no wired-up household-tagging
            path (src/lib/services/transfers.ts is untouched by this task;
            member-transfers are task 13's own territory), so showing an
            apparently-live toggle there that silently did nothing on Simpan
            would be worse than not offering one. This row's height stays
            h-11 regardless of what's in it, and Simpan lives in the keypad
            grid below, not this row, so this can never shift Simpan's
            position (tasks/07 spec.md "Catatan"). */}
        {type !== 'transfer' && households.length > 0 && (
          <HouseholdToggle
            households={households}
            value={householdId}
            onChange={(id) => onHouseholdChange?.(id)}
          />
        )}
        <button
          type="button"
          aria-label="Catatan"
          aria-pressed={noteVisible}
          onClick={() => setNoteVisible((v) => !v)}
          className={cn(
            'pressable-tint rounded-inner ml-auto flex size-11 items-center justify-center',
            note ? 'text-brand-readable' : 'text-text-muted',
          )}
        >
          <FileText className="size-4" aria-hidden="true" />
        </button>
      </div>

      {(noteVisible || note !== '') && (
        <Input
          label="Catatan (opsional)"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          maxLength={280}
        />
      )}

      {error && (
        <p role="alert" className="text-negative text-sm">
          {error}
        </p>
      )}

      <AmountKeypad
        expression={expression}
        onExpressionChange={onExpressionChange}
        onSave={onSave}
        saveDisabled={saveDisabled}
        saving={saving}
      />
    </div>
  );
}
