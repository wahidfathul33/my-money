'use client';

/**
 * `/wealth/assets/deposits` — card list + total pokok summary + create
 * entry point. Mirrors src/features/savings/components/savings-list-client.tsx's
 * shape (summary card + list + create sheet + empty state).
 */
import { useState } from 'react';
import { Landmark, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import type { WalletOption } from '@/features/transactions/sheet-data';
import type { DepositListItemClientData } from '../client-types';
import { DepositCard } from './deposit-card';
import { DepositFormSheet } from './deposit-form-sheet';

interface DepositsListClientProps {
  deposits: DepositListItemClientData[];
  totalPrincipal: string;
  wallets: WalletOption[];
  defaultWalletId: string | null;
}

export function DepositsListClient({ deposits, totalPrincipal, wallets, defaultWalletId }: DepositsListClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const isEmpty = deposits.length === 0;

  return (
    <div className="px-page-x flex flex-col gap-6 pb-8">
      {!isEmpty && (
        <>
          <div className="bg-surface-raised rounded-card p-4">
            <p className="text-text-muted text-sm">Total pokok deposito aktif</p>
            <MoneyText amount={deserializeMoney(totalPrincipal)} tone="plain" size="lg" />
          </div>

          <Button onClick={() => setCreateOpen(true)} className="self-start">
            <Plus className="size-4" aria-hidden="true" />
            Tambah deposito
          </Button>

          <div className="flex flex-col gap-2">
            {deposits.map((deposit) => (
              <DepositCard key={deposit.id} deposit={deposit} href={`/wealth/assets/deposits/${deposit.id}`} />
            ))}
          </div>
        </>
      )}

      {isEmpty && (
        <EmptyState
          icon={Landmark}
          title="Belum ada deposito"
          description="Catat deposito untuk melacak imbal hasil setelah pajak — tanpa mengklaim bunga yang belum diterima."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Tambah deposito
            </Button>
          }
        />
      )}

      <DepositFormSheet open={createOpen} onOpenChange={setCreateOpen} wallets={wallets} defaultWalletId={defaultWalletId} />
    </div>
  );
}
