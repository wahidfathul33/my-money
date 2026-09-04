'use client';

/**
 * The household expenses list — todo.md: "struktur seperti riwayat
 * pribadi" (src/features/transactions/components/transaction-list.tsx).
 * Deliberately simpler in ONE way: a flat newest-first list with a "Muat
 * lebih banyak" button rather than day-grouped headers with per-day
 * subtotals — docs/09-screen-specs.md §13's mockup shows day grouping
 * ("Kemarin −2.850.000"), which this task's final report discloses as a
 * simplification (task 19 owns household aggregate reporting; a flat list
 * still satisfies every one of spec.md's acceptance criteria for this
 * page). Everything else matches §13 exactly: meta row is
 * "PayerName · WalletName" (never a balance — `HouseholdTransactionWalletInfo`,
 * src/features/sharing/household-transactions-queries.ts, has no
 * `balance` field to even accidentally render).
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
      // `memberId` — docs/06-api-contracts.md §6's documented param name for this route.
      if (memberUserId) params.set('memberId', memberUserId);
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
              {/* docs/09-screen-specs.md §13's exact meta row: "Wahid · BCA" —
                  payer name, then wallet name. Never the wallet's balance;
                  `item.wallet` has no such field to render even by mistake. */}
              <p className="text-text-muted truncate text-xs">
                {item.payerName} · {item.wallet?.name ?? '—'}
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
