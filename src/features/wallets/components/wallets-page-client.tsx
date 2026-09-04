'use client';

import { useState, useTransition } from 'react';
import { Plus, Wallet as WalletIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import { restoreWalletAction } from '../actions';
import { WalletGroupList } from './wallet-group-list';
import { WalletFormSheet } from './wallet-form-sheet';
import type { WalletClientData } from '../client-types';
import type { WalletType } from '../wallet-type-meta';

export interface WalletGroupClient {
  type: WalletType;
  label: string;
  wallets: WalletClientData[];
  total: string;
}

interface WalletsPageClientProps {
  groups: WalletGroupClient[];
  archived: WalletClientData[];
  totalCash: string;
  totalCreditCardLiability: string;
}

function ArchivedRow({ wallet }: { wallet: WalletClientData }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRestore() {
    setError(null);
    startTransition(async () => {
      const result = await restoreWalletAction(wallet.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="list-row border-separator flex items-center justify-between gap-3 border-b px-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="text-text-muted truncate text-body">{wallet.name}</span>
        {error && <span className="text-negative block text-xs">{error}</span>}
      </span>
      <Button variant="secondary" size="sm" loading={isPending} onClick={handleRestore}>
        Pulihkan
      </Button>
    </div>
  );
}

/**
 * `/wallets` — grouped list with per-group totals, "Total Kas" (excludes
 * credit cards) and "Total Liabilitas" summary, create/reorder/archive
 * entry points (tasks/05-wallets/spec.md acceptance criteria).
 */
export function WalletsPageClient({
  groups,
  archived,
  totalCash,
  totalCreditCardLiability,
}: WalletsPageClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const hasLiabilities = deserializeMoney(totalCreditCardLiability) > 0n;
  const isEmpty = groups.length === 0 && archived.length === 0;

  return (
    <div className="px-page-x flex flex-col gap-6 pb-8">
      {!isEmpty && (
        <>
          <div className="flex gap-3">
            <div className="bg-surface-raised rounded-card flex-1 p-4">
              <p className="text-text-muted text-sm">Total Kas</p>
              {/* showSign: excludes credit cards (see totalCash's own doc
                  comment in queries.ts), so unlike Total Liabilitas below
                  this can genuinely go negative — that must stay visible. */}
              <MoneyText amount={deserializeMoney(totalCash)} tone="plain" size="lg" showSign />
            </div>
            {hasLiabilities && (
              <div className="bg-surface-raised rounded-card flex-1 p-4">
                <p className="text-text-muted text-sm">Total Liabilitas</p>
                <MoneyText amount={deserializeMoney(totalCreditCardLiability)} tone="plain" size="lg" />
              </div>
            )}
          </div>

          <Button onClick={() => setCreateOpen(true)} className="self-start">
            <Plus className="size-4" aria-hidden="true" />
            Tambah dompet
          </Button>
        </>
      )}

      {isEmpty && (
        <EmptyState
          icon={WalletIcon}
          title="Belum ada dompet"
          description="Tambahkan rekening, e-wallet, atau uang tunai untuk mulai mencatat."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Tambah dompet
            </Button>
          }
        />
      )}

      {groups.map((group) => (
        <section key={group.type} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-text text-heading font-semibold">{group.label}</h2>
            {/* credit_card's raw sum is always <= 0 by DB constraint, so its
                magnitude alone already reads correctly as a liability total
                (same convention as Total Liabilitas above) — every other
                group has no such constraint and needs its sign visible. */}
            <MoneyText
              amount={deserializeMoney(group.total)}
              tone="plain"
              size="sm"
              showSign={group.type !== 'credit_card'}
            />
          </div>
          <div className="bg-surface rounded-card overflow-hidden">
            <WalletGroupList wallets={group.wallets} />
          </div>
        </section>
      ))}

      {archived.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-text-muted text-heading font-semibold">Diarsipkan</h2>
          <div className="bg-surface rounded-card overflow-hidden">
            {archived.map((wallet) => (
              <ArchivedRow key={wallet.id} wallet={wallet} />
            ))}
          </div>
        </section>
      )}

      <WalletFormSheet open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
