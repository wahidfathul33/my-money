'use client';

/**
 * The "Dari → Ke" wallet picker that replaces the category row when the Add
 * Transaction sheet's Transfer tab is active
 * (tasks/08-transfers-self/spec.md "Ganti baris kategori dengan pemilih
 * asal → tujuan"). Rendered by src/features/transactions/components/transaction-editor.tsx
 * — the shared editor owns the tab switch and amount keypad; this owns only
 * the two wallet pickers.
 *
 * The destination list excludes whatever's currently selected as the source
 * (spec.md "Validasi menolak: dompet asal = tujuan") so an invalid pair
 * can't be constructed through the UI at all, on top of the service/schema
 * also rejecting it server-side. `wallets` is always
 * `AddTransactionSheetData.wallets` (src/features/transactions/sheet-data.ts),
 * already limited to the caller's active wallets — archived wallets never
 * reach either picker (todo.md "Dompet diarsipkan tidak muncul di kedua
 * pemilih").
 */
import { ArrowRight } from 'lucide-react';
import { WalletPicker } from '@/features/transactions/components/wallet-picker';
import type { WalletOption } from '@/features/transactions/sheet-data';

export interface TransferFormProps {
  wallets: WalletOption[];
  fromWalletId: string;
  onFromWalletChange: (id: string) => void;
  toWalletId: string;
  onToWalletChange: (id: string) => void;
}

export function TransferForm({
  wallets,
  fromWalletId,
  onFromWalletChange,
  toWalletId,
  onToWalletChange,
}: TransferFormProps) {
  const toOptions = wallets.filter((w) => w.id !== fromWalletId);

  return (
    <div className="flex items-end gap-2 py-1">
      <div className="min-w-0 flex-1">
        <p className="text-text-muted mb-1 text-xs" aria-hidden="true">
          Dari
        </p>
        <WalletPicker
          wallets={wallets}
          value={fromWalletId}
          onChange={onFromWalletChange}
          triggerLabel="Dompet asal"
        />
      </div>
      <ArrowRight className="text-text-muted mb-3 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-text-muted mb-1 text-xs" aria-hidden="true">
          Ke
        </p>
        <WalletPicker
          wallets={toOptions}
          value={toWalletId}
          onChange={onToWalletChange}
          triggerLabel="Dompet tujuan"
        />
      </div>
    </div>
  );
}
