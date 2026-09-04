import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { MoneyText } from '@/components/finance/money-text';
import { requireUserRecord } from '@/lib/auth/require-user';
import { getWallet, walletHasLedgerEntries } from '@/features/wallets/queries';
import { toWalletClientData } from '@/features/wallets/client-types';
import { WALLET_COLOR_CLASS, WALLET_ICON_MAP, WALLET_TYPE_META } from '@/features/wallets/wallet-type-meta';
import { WalletDetailActions } from '@/features/wallets/components/wallet-detail-actions';
import { cn } from '@/lib/utils';

const ENTRY_SOURCE_LABEL: Record<string, string> = {
  transaction: 'Transaksi',
  opening_balance: 'Saldo awal',
  adjustment: 'Penyesuaian saldo',
  savings_contribution: 'Kontribusi tabungan',
  savings_withdrawal: 'Penarikan tabungan',
  debt_disbursement: 'Pencairan hutang',
  debt_payment: 'Pembayaran hutang',
  receivable_disbursement: 'Pencairan piutang',
  receivable_payment: 'Pembayaran piutang',
  gold_purchase: 'Pembelian emas',
  gold_sale: 'Penjualan emas',
  deposit_placement: 'Penempatan deposito',
  deposit_withdrawal: 'Penarikan deposito',
  deposit_interest: 'Bunga deposito',
};

interface WalletDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function WalletDetailPage({ params }: WalletDetailPageProps) {
  const { id } = await params;
  const user = await requireUserRecord();

  const wallet = await getWallet(user.id, id);
  if (!wallet) notFound();

  const hasEntries = await walletHasLedgerEntries(user.id, id);
  const meta = WALLET_TYPE_META[wallet.type];
  const Icon = WALLET_ICON_MAP[wallet.icon] ?? meta.Icon;
  const colorClass = WALLET_COLOR_CLASS[wallet.color] ?? WALLET_COLOR_CLASS[meta.color];
  const isDefault = user.defaultWalletId === wallet.id;

  return (
    <>
      <PageHeader title={wallet.name} description={meta.label} />

      <div className="px-page-x flex flex-col gap-6 pb-8">
        <div className="bg-surface-raised rounded-card flex flex-col items-center gap-3 p-6 text-center">
          <span className={cn('flex size-14 items-center justify-center rounded-full', colorClass)}>
            <Icon className="size-7" aria-hidden="true" />
          </span>
          {/* showSign except for credit cards — see wallet-card.tsx's doc
              comment for why (DB-constrained <= 0, shown as a liability
              magnitude; every other type can legitimately go negative and
              that must stay visible). */}
          <MoneyText
            amount={wallet.balance}
            tone="plain"
            size="display"
            showSign={wallet.type !== 'credit_card'}
          />
          {isDefault && (
            <span className="rounded-chip bg-brand-subtle text-brand-readable px-3 py-1 text-xs font-medium">
              Dompet utama
            </span>
          )}
        </div>

        <WalletDetailActions
          wallet={toWalletClientData(wallet)}
          hasEntries={hasEntries}
          isDefault={isDefault}
          isArchived={wallet.isArchived}
        />

        <section className="flex flex-col gap-2">
          <h2 className="text-text text-heading font-semibold">Riwayat terbaru</h2>
          {wallet.recentEntries.length === 0 ? (
            <p className="text-text-muted px-1 text-sm">Belum ada catatan untuk dompet ini.</p>
          ) : (
            <div className="bg-surface rounded-card overflow-hidden">
              {wallet.recentEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="list-row border-separator flex items-center justify-between gap-3 border-b px-3 py-3 last:border-b-0"
                >
                  <div className="flex flex-col">
                    <span className="text-text text-body">
                      {ENTRY_SOURCE_LABEL[entry.source] ?? entry.source}
                    </span>
                    <span className="text-text-subtle text-xs">
                      {new Intl.DateTimeFormat('id-ID', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(entry.entryDate)}
                    </span>
                  </div>
                  <MoneyText amount={entry.amount} tone="auto" showSign />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
