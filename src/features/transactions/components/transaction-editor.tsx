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
import { formatExpression } from '../amount-math';
import type { RecordableTransactionType } from '../queries';
import type { CategoryRow, CategoryWithChildren } from '../queries';
import type { WalletOption } from '../sheet-data';
import { AmountKeypad } from './amount-keypad';
import { CategoryPicker } from './category-picker';
import { DatePicker } from './date-picker';
import { WalletPicker } from './wallet-picker';

export interface TransactionEditorProps {
  type: RecordableTransactionType;
  onTypeChange: (type: RecordableTransactionType) => void;
  expression: string;
  onExpressionChange: (next: string) => void;
  categoryId: string | null;
  onCategoryChange: (id: string) => void;
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
      <Tabs value={type} onValueChange={(v) => onTypeChange(v as RecordableTransactionType)}>
        <TabsList variant="segmented" className="w-full">
          <TabsTrigger variant="segmented" value="expense">
            Pengeluaran
          </TabsTrigger>
          <TabsTrigger variant="segmented" value="income">
            Pemasukan
          </TabsTrigger>
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

      <CategoryPicker
        quick={quickCategories[type]}
        full={fullCategories[type]}
        value={categoryId}
        onChange={onCategoryChange}
      />

      <div className="flex h-11 items-center gap-2">
        <WalletPicker wallets={wallets} value={walletId} onChange={onWalletChange} />
        <DatePicker value={date} onChange={onDateChange} />
        {/* Household toggle (🏠) lands in task 12 — this row's height is
            fixed (h-11) regardless of what's in it, and Simpan lives in the
            keypad grid below, not this row, so adding the toggle later
            can't shift Simpan's position (tasks/07 spec.md "Catatan"). */}
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
