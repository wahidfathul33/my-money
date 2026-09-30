'use client';

/**
 * `/wealth/assets/gold/prices` body — a search field + one card per
 * vendor/product row. Filters the already-fetched list in-memory rather than
 * round-tripping to the server per keystroke: this is a small reference
 * table (a handful of vendors x products), nothing like the transaction
 * history's server-paginated search (src/features/transactions/components/
 * transaction-list.tsx's `TransactionSearchButton`).
 */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import type { GoldMarketPriceClientData } from '../client-types';

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function matches(item: GoldMarketPriceClientData, query: string): boolean {
  const q = query.toLowerCase();
  return item.vendorName.toLowerCase().includes(q) || item.productName.toLowerCase().includes(q);
}

export function GoldMarketPricesClient({ items }: { items: GoldMarketPriceClientData[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    return trimmed === '' ? items : items.filter((item) => matches(item, trimmed));
  }, [items, query]);

  return (
    <div className="px-page-x flex flex-col gap-4 pb-24">
      <label className="border-border rounded-input flex h-11 items-center gap-2 border px-3">
        <Search className="text-text-muted size-4 shrink-0" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari vendor atau produk…"
          aria-label="Cari harga emas"
          className="text-body text-text placeholder:text-text-muted flex-1 bg-transparent outline-none"
        />
      </label>

      {items.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Harga belum tersedia"
          description="Harga emas akan muncul di sini setelah pembaruan harian pertama."
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="Tidak ada yang cocok" description="Coba kata kunci lain." />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((item) => (
            <li key={item.id}>
              <Card className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-text text-sm font-medium">{item.vendorName}</p>
                  <span className="text-text-muted text-xs">Diperbarui {formatUpdatedAt(item.asOf)}</span>
                </div>
                <p className="text-text-muted text-sm">{item.productName}</p>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-text-subtle text-xs">Beli</span>
                    <MoneyText amount={deserializeMoney(item.buyPrice)} tone="plain" size="sm" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-text-subtle text-xs">Buyback</span>
                    <MoneyText amount={deserializeMoney(item.buybackPrice)} tone="plain" size="sm" />
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
