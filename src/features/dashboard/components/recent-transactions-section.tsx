/**
 * "Transaksi Terakhir" — docs/09-screen-specs.md §1: exactly 5 items,
 * newest first, as confirmation "pencatatan saya masuk" (docs/01-product-analysis.md
 * §4 priority #8). A deliberately minimal, Server-rendered row — NOT
 * `src/features/transactions/components/transaction-row.tsx` (swipe-to-
 * delete + bulk-select machinery the dashboard has no use for and would
 * only cost bundle size for, per AGENTS.md's "'use client' hanya pada
 * sparkline & interaksi genuinely interaktif"). Tapping any row, or the
 * section itself, goes to `/transactions` — there's no per-row detail sheet
 * here.
 */
import { ArrowLeftRight } from 'lucide-react';
import { MoneyText } from '@/components/finance/money-text';
import { CategoryIcon } from '@/features/categories/components/category-icon';
import type { TransactionListItem } from '@/features/transactions/queries';
import type { Money } from '@/lib/finance/money';
import { SectionHeader } from './section-header';

const TIME_FORMAT = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });

function signedAmount(item: TransactionListItem): Money {
  if (item.type === 'transfer') return item.amount;
  return item.type === 'income' ? item.amount : -item.amount;
}

function title(item: TransactionListItem): string {
  if (item.type === 'transfer') return 'Transfer';
  return item.category?.name ?? 'Transaksi';
}

function meta(item: TransactionListItem): string {
  const time = TIME_FORMAT.format(item.transactionDate);
  if (item.type === 'transfer' && item.transfer) {
    return `${item.transfer.fromWallet.name} → ${item.transfer.toWallet.name} · ${time}`;
  }
  return `${item.wallet?.name ?? '—'} · ${time}`;
}

interface RecentTransactionsSectionProps {
  transactions: TransactionListItem[];
}

export function RecentTransactionsSection({ transactions }: RecentTransactionsSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Transaksi Terakhir" href="/transactions" />
      <div className="flex flex-col">
        {transactions.map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-2">
            {item.type === 'transfer' ? (
              <span className="bg-surface-raised text-text-muted flex size-10 shrink-0 items-center justify-center rounded-full">
                <ArrowLeftRight className="size-5" aria-hidden="true" />
              </span>
            ) : item.category ? (
              <CategoryIcon icon={item.category.icon} color={item.category.color} />
            ) : (
              <span className="bg-surface-raised size-10 shrink-0 rounded-full" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-text truncate text-sm font-medium">{title(item)}</p>
              <p className="text-text-muted truncate text-xs">{meta(item)}</p>
            </div>
            {item.type === 'transfer' ? (
              <MoneyText amount={item.amount} tone="neutral" size="sm" />
            ) : (
              <MoneyText amount={signedAmount(item)} showSign size="sm" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
