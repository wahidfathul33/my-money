'use client';

/**
 * The household expenses list — todo.md: "struktur seperti riwayat
 * pribadi" (src/features/transactions/components/transaction-list.tsx), but
 * deliberately simpler: no swipe-to-delete (this isn't the payer's own edit
 * surface), no day grouping/subtotals (task 19 owns household aggregate
 * reporting), just a flat newest-first list with a "Muat lebih banyak"
 * button. Meta row is the PAYER's name, never a wallet
 * (spec.md "Halaman itu TIDAK menampilkan saldo dompet siapa pun" — there
 * is no wallet name/icon/balance anywhere in this component or the data it
 * receives).
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MoneyText } from '@/components/finance/money-text';
import { CategoryIcon } from '@/features/categories/components/category-icon';
import {
  parseHouseholdTransactionResponse,
  signedHouseholdTransactionAmount,
  type HouseholdTransactionClientItem,
} from '../household-transactions-client-types';

const TIME_FORMAT = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

interface HouseholdTransactionListProps {
  householdId: string;
  initialItems: HouseholdTransactionClientItem[];
  initialNextCursor: string | null;
  /** Active "Chip filter Anggota" selection — `undefined` for "Semua". */
  memberUserId?: string;
}

export function HouseholdTransactionList({
  householdId,
  initialItems,
  initialNextCursor,
  memberUserId,
}: HouseholdTransactionListProps) {
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ cursor: nextCursor, limit: '30' });
      if (memberUserId) params.set('member', memberUserId);
      const res = await fetch(`/api/households/${householdId}/transactions?${params.toString()}`);
      if (!res.ok) throw new Error(`request failed: ${res.status}`);
      const data = (await res.json()) as {
        items: Parameters<typeof parseHouseholdTransactionResponse>[0][];
        nextCursor: string | null;
      };
      setItems((prev) => [...prev, ...data.items.map(parseHouseholdTransactionResponse)]);
      setNextCursor(data.nextCursor);
    } catch {
      setError('Gagal memuat transaksi berikutnya.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col" data-testid="household-transaction-list">
      <ul className="divide-border flex flex-col divide-y">
        {items.map((item) => (
          <li key={item.id} data-testid="household-transaction-row" className="flex items-center gap-3 px-2 py-3">
            {item.category ? (
              <CategoryIcon icon={item.category.icon} color={item.category.color} />
            ) : (
              <span className="bg-surface-raised size-10 shrink-0 rounded-full" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-text truncate text-sm font-medium">{item.category?.name ?? 'Transaksi'}</p>
              <p className="text-text-muted truncate text-xs">
                {item.payerName} · {TIME_FORMAT.format(item.transactionDate)}
              </p>
            </div>
            <MoneyText amount={signedHouseholdTransactionAmount(item)} showSign size="sm" />
          </li>
        ))}
      </ul>

      {nextCursor && (
        <div className="flex flex-col items-center gap-2 py-4">
          {error && (
            <p role="alert" className="text-negative text-sm">
              {error}
            </p>
          )}
          <Button variant="secondary" size="sm" loading={loading} onClick={() => void loadMore()}>
            Muat lebih banyak
          </Button>
        </div>
      )}
    </div>
  );
}
