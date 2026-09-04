'use client';

/**
 * The "Dari → Ke anggota" row for member transfers — sibling of
 * ./transfer-form.tsx (self-transfers), rendered by
 * src/features/transactions/components/transaction-editor.tsx when the
 * "Ke anggota keluarga" segment is active. docs/09-screen-specs.md §2's
 * wireframe: "Dari 💳 BCA" / "Ke 👤 Istri › 🏦 BRI Istri", plus the note
 * telling the sender their action changes someone else's balance.
 */
import { ArrowRight } from 'lucide-react';
import { WalletPicker } from '@/features/transactions/components/wallet-picker';
import type { WalletOption } from '@/features/transactions/sheet-data';
import type { TransferTargetPerson } from '../target-queries';
import { TransferTargetPicker, type MemberTransferSelection } from './transfer-target-picker';

export interface MemberTransferFormProps {
  /** The CALLER's own active wallets — the source side ("Dari"). */
  wallets: WalletOption[];
  fromWalletId: string;
  onFromWalletChange: (id: string) => void;
  people: TransferTargetPerson[];
  selection: MemberTransferSelection | null;
  onSelectionChange: (selection: MemberTransferSelection) => void;
}

export function MemberTransferForm({
  wallets,
  fromWalletId,
  onFromWalletChange,
  people,
  selection,
  onSelectionChange,
}: MemberTransferFormProps) {
  const selectedPerson = people.find((p) => p.userId === selection?.counterpartyUserId);

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-text-muted mb-1 text-xs" aria-hidden="true">
            Dari
          </p>
          <WalletPicker wallets={wallets} value={fromWalletId} onChange={onFromWalletChange} triggerLabel="Dompet asal" />
        </div>
        <ArrowRight className="text-text-muted mb-3 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-text-muted mb-1 text-xs" aria-hidden="true">
            Ke
          </p>
          <TransferTargetPicker people={people} value={selection} onChange={onSelectionChange} />
        </div>
      </div>

      {/* spec.md UI: "Saldo {nama} langsung berubah. Ia akan melihatnya di Aktivitas." */}
      {selectedPerson && (
        <p className="text-text-muted text-xs">
          Saldo {selectedPerson.name ?? selectedPerson.email} langsung berubah. Ia akan melihatnya di Aktivitas.
        </p>
      )}
    </div>
  );
}
