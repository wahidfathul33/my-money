'use client';

/**
 * `/transactions` history — day-grouped, infinite-scrolled, filterable,
 * searchable. Rewrite of task 07's minimal flat list (this file's own
 * former header: "explicitly built as a placeholder for this task to
 * replace" — tasks/07-transactions-core/spec.md "Tidak termasuk: riwayat &
 * filter").
 *
 * No SWR/React Query in this codebase's dependencies (checked package.json)
 * — infinite scroll here is a small hand-rolled `IntersectionObserver` +
 * `fetch` against `GET /api/transactions`, batch 30
 * (tasks/09-transaction-history/todo.md).
 *
 * **Why `items`/`dayTotals` are local state seeded from props, not derived
 * from them:** the parent Server Component
 * (src/app/(app)/transactions/page.tsx) is keyed by the filter query
 * string, so a FILTER change remounts this component with fresh
 * `initial*` props — but a same-filter mutation (void/unvoid a row) does
 * NOT remount it, and `router.refresh()` alone can't update values a
 * `useState` initializer already consumed. Void/unvoid apply a precise
 * local delta to `items`/`dayTotals` instead (removed row, subtracted
 * amount / added back) — the same "cache + exact delta, never resummed
 * from scratch" discipline src/lib/finance/ledger.ts's `postEntries` uses
 * for `wallets.balance`, not a violation of spec.md's "jangan menjumlahkan
 * subtotal di klien" (that rule is about not DERIVING the total by summing
 * items; adjusting a server-provided baseline by one known amount is not
 * that).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, SearchX, X } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { deserializeMoney, serializeMoney } from '@/lib/finance/money';
import { toLocalDate } from '@/lib/date/timezone';
import type { HistoryCategoryInfo, HistoryWalletInfo } from '../history-queries';
import {
  historyItemAmount,
  parseHistoryItemResponse,
  toEditableTransactionClientData,
  type TransactionHistoryClientItem,
} from '../history-client-types';
import { apiFiltersToSearchParams, toApiFilters } from '../history-filters';
import { unvoidTransactionAction, voidTransactionAction } from '../actions';
import { unvoidTransferAction, voidTransferAction } from '@/features/transfers/actions';
import type { AddTransactionSheetData } from '../sheet-data';
import { hasActiveFilters, useHistoryFilters } from '../use-history-filters';
import { TransactionDayGroup, type DayTotal } from './day-group';
import { TransactionHistoryDetailSheet } from './detail-sheet';
import { EditTransactionSheet, type EditedTransactionFields } from './edit-transaction-sheet';

type DayTotalsBySerialized = Record<string, { income: string; expense: string }>;

// A transfer voids/unvoids through its own service (src/lib/services/transfers.ts
// — `voidTransaction`/`unvoidTransaction` explicitly refuse `type: 'transfer'`
// rows, see that module's doc comment), so every void/undo pair here
// dispatches on `transaction.type` rather than always calling the
// income/expense action.
function voidAction(type: TransactionHistoryClientItem['type']) {
  return type === 'transfer' ? voidTransferAction : voidTransactionAction;
}
function unvoidAction(type: TransactionHistoryClientItem['type']) {
  return type === 'transfer' ? unvoidTransferAction : unvoidTransactionAction;
}

interface TransactionListProps {
  initialItems: TransactionHistoryClientItem[];
  initialNextCursor: string | null;
  initialDayTotals: DayTotalsBySerialized;
  sheetData: AddTransactionSheetData;
}

const LOAD_LIMIT = 30;

export function TransactionList({
  initialItems,
  initialNextCursor,
  initialDayTotals,
  sheetData,
}: TransactionListProps) {
  const router = useRouter();
  const toast = useToast();
  const { filters } = useHistoryFilters();

  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [dayTotals, setDayTotals] = useState<DayTotalsBySerialized>(initialDayTotals);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<TransactionHistoryClientItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Lazy `useState` initializers, not `useMemo` — "now" is read exactly
  // once, on mount, matching the same pattern
  // components/add-transaction-sheet.tsx already uses for its own default
  // date (`useState<Date>(() => new Date())`). A `useMemo` factory calling
  // `new Date()`/`Date.now()` directly in the render body is flagged by
  // `react-hooks/purity` as an impure read that could tear across renders.
  const [today] = useState(() => toLocalDate(new Date()));
  const [yesterday] = useState(() => toLocalDate(new Date(Date.now() - 24 * 60 * 60 * 1000)));

  const grouped = useMemo(() => {
    const map = new Map<string, TransactionHistoryClientItem[]>();
    for (const item of items) {
      const date = toLocalDate(item.transactionDate);
      const list = map.get(date);
      if (list) list.push(item);
      else map.set(date, [item]);
    }
    return [...map.entries()];
  }, [items]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const params = apiFiltersToSearchParams(toApiFilters(filters));
      params.set('cursor', nextCursor);
      params.set('limit', String(LOAD_LIMIT));
      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) throw new Error(`request failed: ${res.status}`);
      const data = (await res.json()) as {
        items: Parameters<typeof parseHistoryItemResponse>[0][];
        nextCursor: string | null;
        dayTotals: DayTotalsBySerialized;
      };
      setItems((prev) => [...prev, ...data.items.map(parseHistoryItemResponse)]);
      setDayTotals((prev) => ({ ...prev, ...data.dayTotals }));
      setNextCursor(data.nextCursor);
    } catch {
      setLoadError('Gagal memuat transaksi berikutnya.');
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, filters]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMore already depends on nextCursor; re-running per nextCursor change is exactly what's needed to observe the new sentinel state.
  }, [nextCursor]);

  function openDetail(item: TransactionHistoryClientItem) {
    setSelected(item);
    setDetailOpen(true);
  }

  function adjustDayTotal(item: TransactionHistoryClientItem, sign: 1 | -1) {
    if (item.type === 'transfer') return; // never part of the income/expense subtotal
    const date = toLocalDate(item.transactionDate);
    setDayTotals((prev) => {
      const current = prev[date] ?? { income: '0', expense: '0' };
      const amount = historyItemAmount(item) * BigInt(sign);
      const income = deserializeMoney(current.income) + (item.type === 'income' ? amount : 0n);
      const expense = deserializeMoney(current.expense) + (item.type === 'expense' ? amount : 0n);
      return { ...prev, [date]: { income: serializeMoney(income), expense: serializeMoney(expense) } };
    });
  }

  function reinsertItem(item: TransactionHistoryClientItem) {
    setItems((prev) => {
      const idx = prev.findIndex(
        (i) =>
          i.transactionDate.getTime() < item.transactionDate.getTime() ||
          (i.transactionDate.getTime() === item.transactionDate.getTime() && i.id < item.id),
      );
      if (idx === -1) return [...prev, item];
      const next = [...prev];
      next.splice(idx, 0, item);
      return next;
    });
    adjustDayTotal(item, 1);
  }

  function resolveCategoryInfo(categoryId: string): HistoryCategoryInfo | null {
    const all = [...sheetData.fullCategories.expense, ...sheetData.fullCategories.income].flatMap((c) => [
      c,
      ...c.children,
    ]);
    const found = all.find((c) => c.id === categoryId);
    return found ? { id: found.id, name: found.name, icon: found.icon, color: found.color } : null;
  }

  function resolveWalletInfo(walletId: string): HistoryWalletInfo | null {
    const found = sheetData.wallets.find((w) => w.id === walletId);
    return found ? { id: found.id, name: found.name, icon: found.icon, color: found.color } : null;
  }

  /**
   * An edit doesn't remount this component (only a FILTER change does — see
   * this file's own header comment), so `items`/`dayTotals` need to be
   * patched in place with exactly what changed, the same "precise delta"
   * approach `quickDelete` already uses. Unlike a delete, an edit can touch
   * every field at once (amount, type, category, wallet, date) — including
   * moving the row to a different day group — so this recomputes the row's
   * day-total contribution at BOTH its old and new date rather than a
   * single ±1 delta.
   */
  function updateItemLocally(saved: EditedTransactionFields) {
    const oldItem = items.find((i) => i.id === saved.id);

    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === saved.id);
      if (idx === -1) return prev;
      const updated: TransactionHistoryClientItem = {
        ...prev[idx]!,
        type: saved.type,
        amount: saved.amount,
        transactionDate: saved.transactionDate,
        note: saved.note,
        category: resolveCategoryInfo(saved.categoryId),
        wallet: resolveWalletInfo(saved.walletId),
      };
      const withoutOld = [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      const insertIdx = withoutOld.findIndex(
        (i) =>
          i.transactionDate.getTime() < updated.transactionDate.getTime() ||
          (i.transactionDate.getTime() === updated.transactionDate.getTime() && i.id < updated.id),
      );
      if (insertIdx === -1) return [...withoutOld, updated];
      return [...withoutOld.slice(0, insertIdx), updated, ...withoutOld.slice(insertIdx)];
    });

    setDayTotals((prev) => {
      const next = { ...prev };
      if (oldItem && oldItem.type !== 'transfer') {
        const oldDate = toLocalDate(oldItem.transactionDate);
        const cur = next[oldDate] ?? { income: '0', expense: '0' };
        const oldAmount = historyItemAmount(oldItem);
        next[oldDate] = {
          income: serializeMoney(deserializeMoney(cur.income) - (oldItem.type === 'income' ? oldAmount : 0n)),
          expense: serializeMoney(deserializeMoney(cur.expense) - (oldItem.type === 'expense' ? oldAmount : 0n)),
        };
      }
      const newDate = toLocalDate(saved.transactionDate);
      const cur = next[newDate] ?? { income: '0', expense: '0' };
      const newAmount = deserializeMoney(saved.amount);
      next[newDate] = {
        income: serializeMoney(deserializeMoney(cur.income) + (saved.type === 'income' ? newAmount : 0n)),
        expense: serializeMoney(deserializeMoney(cur.expense) + (saved.type === 'expense' ? newAmount : 0n)),
      };
      return next;
    });
  }

  function quickDelete(item: TransactionHistoryClientItem) {
    // Optimistic: drop it from view immediately, undo re-inserts it.
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    adjustDayTotal(item, -1);

    // A transfer voids/unvoids through its own service
    // (src/lib/services/transfers.ts — voidTransaction/unvoidTransaction
    // explicitly refuse `type: 'transfer'` rows), so this dispatches on
    // `item.type` rather than always calling the income/expense action.
    voidAction(item.type)(item.id).then((result) => {
      if (result.error) {
        reinsertItem(item); // roll back the optimistic removal
        return;
      }
      router.refresh();
      toast.show({
        title: item.type === 'transfer' ? 'Transfer dihapus' : 'Transaksi dihapus',
        variant: 'success',
        action: {
          label: 'Urungkan',
          onClick: () => {
            reinsertItem(item);
            unvoidAction(item.type)(item.id).then((undoResult) => {
              if (undoResult.error) {
                // Extremely unlikely (the transaction was just voided by
                // us) — roll the optimistic re-insert back out rather than
                // show a phantom row.
                setItems((prev) => prev.filter((i) => i.id !== item.id));
                adjustDayTotal(item, -1);
              } else {
                router.refresh();
              }
            });
          },
        },
      });
    });
  }

  if (items.length === 0) {
    // Reached only via the rare "user deleted the last row still in view
    // client-side" path — the primary empty states (never had any / filter
    // matched nothing / empty period with a link elsewhere) are handled
    // server-side by page.tsx, which skips rendering this component
    // entirely in those cases. Same binding copy as the filter-empty case
    // there (docs/08-copywriting.md §5.5 "Filter kosong" row) since that's
    // the only one reachable from here with an active filter; unfiltered,
    // this degrades to a full `router.refresh()` moment away from page.tsx
    // re-deciding the right empty state.
    return (
      <EmptyState
        icon={SearchX}
        title={hasActiveFilters(filters) ? 'Tidak ada yang cocok' : 'Belum ada transaksi'}
        description={
          hasActiveFilters(filters)
            ? 'Coba ubah rentang tanggal atau kategorinya.'
            : 'Catat pemasukan atau pengeluaran pertama Anda.'
        }
      />
    );
  }

  return (
    <div className="flex flex-col" data-testid="transaction-list">
      {grouped.map(([date, dayItems]) => (
        <TransactionDayGroup
          key={date}
          date={date}
          today={today}
          yesterday={yesterday}
          items={dayItems}
          total={toDayTotal(dayTotals[date])}
          onOpenDetail={openDetail}
          onQuickDelete={quickDelete}
        />
      ))}

      {nextCursor && (
        <div ref={sentinelRef} className="flex justify-center py-6">
          {loadingMore && <Skeleton variant="list" rows={2} className="w-full px-4" />}
        </div>
      )}
      {loadError && (
        <div className="flex flex-col items-center gap-2 py-4">
          <p className="text-negative text-sm">{loadError}</p>
          <Button variant="secondary" size="sm" onClick={() => void loadMore()}>
            Coba lagi
          </Button>
        </div>
      )}

      <TransactionHistoryDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        item={selected}
        onEdit={() => {
          setDetailOpen(false);
          setEditOpen(true);
        }}
      />
      <EditTransactionSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        transaction={selected ? toEditableTransactionClientData(selected) : null}
        sheetData={sheetData}
        onSaved={updateItemLocally}
      />
    </div>
  );
}

function toDayTotal(raw: { income: string; expense: string } | undefined): DayTotal | undefined {
  if (!raw) return undefined;
  return { income: deserializeMoney(raw.income), expense: deserializeMoney(raw.expense) };
}

const SEARCH_DEBOUNCE_MS = 300;
const MIN_SEARCH_LENGTH = 2;

/**
 * Header search trigger + sheet — docs/09 §3 "Pencarian: buka field di
 * header ... debounce 300ms, minimal 2 karakter". Entirely self-contained:
 * reads/writes only the `q` URL param via `useHistoryFilters`, so it can be
 * rendered from `<PageHeader action={...}>` in page.tsx independently of
 * `<TransactionList>` — the list picks up the new `q` through the normal
 * filter-change remount, same as any other filter.
 */
export function TransactionSearchButton() {
  const { filters, update } = useHistoryFilters();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(filters.q ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(next: string) {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      update({ q: next.trim().length >= MIN_SEARCH_LENGTH ? next.trim() : null });
    }, SEARCH_DEBOUNCE_MS);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Cari transaksi"
        className="pressable text-text-muted flex size-11 items-center justify-center rounded-full"
      >
        <Search className="size-5" aria-hidden="true" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Cari transaksi">
          <label className="border-border rounded-input flex h-11 items-center gap-2 border px-3">
            <Search className="text-text-muted size-4 shrink-0" aria-hidden="true" />
            <input
              autoFocus
              type="search"
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="Cari catatan atau kategori…"
              className="text-body text-text placeholder:text-text-muted flex-1 bg-transparent outline-none"
            />
            {value && (
              <button
                type="button"
                aria-label="Bersihkan"
                onClick={() => handleChange('')}
                className="text-text-muted flex size-6 shrink-0 items-center justify-center"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </label>
          {value.trim().length > 0 && value.trim().length < MIN_SEARCH_LENGTH && (
            <p className="text-text-muted mt-2 text-xs">Ketik minimal {MIN_SEARCH_LENGTH} karakter.</p>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
