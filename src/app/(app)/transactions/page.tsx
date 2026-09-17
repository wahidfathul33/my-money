import { Receipt, SearchX } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { MoneyText } from '@/components/finance/money-text';
import { requireUser } from '@/lib/auth/require-user';
import { serializeMoney } from '@/lib/finance/money';
import { hasActiveFilters, parseHistoryFilters, toApiFilters } from '@/features/transactions/history-filters';
import {
  dayTotalsRangeForItems,
  getDayTotals,
  getMostRecentTransactionPeriod,
  getPeriodSummary,
  listTransactionsPage,
} from '@/features/transactions/history-queries';
import { toHistoryClientItem } from '@/features/transactions/history-client-types';
import { getAddTransactionSheetData } from '@/features/transactions/sheet-data';
import { AddTransactionSheet } from '@/features/transactions/components/add-transaction-sheet';
import { listCategories } from '@/features/transactions/queries';
import { PeriodPicker, formatPeriodLabel } from '@/features/transactions/components/period-picker';
import { FilterBar, type FilterBarCategoryOption } from '@/features/transactions/components/filter-bar';
import { TransactionList, TransactionSearchButton } from '@/features/transactions/components/transaction-list';
import { getUserPreferences } from '@/features/settings/queries';

/**
 * `/transactions` — the checkpoint tasks/09-transaction-history/spec.md
 * calls "the single most important checkpoint in the first half of the
 * roadmap": day-grouped, server-aggregated history with a month picker,
 * URL-driven filters, trigram search, and cursor-keyset infinite scroll.
 *
 * Server Component for the FIRST page only (docs/06-api-contracts.md §1
 * "Baca data awal halaman → Server Component") — every subsequent page is
 * `GET /api/transactions` from `<TransactionList>`. Filters live entirely
 * in `searchParams` (docs/02 §6), so this component re-runs, server-side,
 * on every filter change; `<TransactionList key={...}>` below is keyed by
 * the same query string so it remounts with fresh `initial*` props exactly
 * when the filters actually changed.
 */

interface TransactionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const user = await requireUser();
  const rawParams = await searchParams;
  // tasks/22-settings-sharing-pwa: the caller's own timezone
  // (`/settings/preferences`) drives every date grouping on this page —
  // fetched first since it feeds the default-period fallback below.
  const preferences = await getUserPreferences(user.id);
  const tz = preferences.timezone;
  const filters = parseHistoryFilters(rawParams, tz);
  const apiFilters = toApiFilters(filters);

  const [{ items, nextCursor }, periodSummary, mostRecentPeriod, sheetData, expenseCategories, incomeCategories] =
    await Promise.all([
      listTransactionsPage(user.id, { filters: apiFilters, tz }),
      getPeriodSummary(user.id, filters.period, tz),
      getMostRecentTransactionPeriod(user.id, tz),
      getAddTransactionSheetData(user.id),
      listCategories(user.id, 'expense'),
      listCategories(user.id, 'income'),
    ]);

  const range = dayTotalsRangeForItems(items, tz);
  const dayTotalsRaw = range ? await getDayTotals(user.id, range, apiFilters, tz) : {};
  const dayTotals = Object.fromEntries(
    Object.entries(dayTotalsRaw).map(([date, total]) => [
      date,
      { income: serializeMoney(total.income), expense: serializeMoney(total.expense) },
    ]),
  );

  const categoryOptions: FilterBarCategoryOption[] = [...expenseCategories, ...incomeCategories].flatMap((c) => [
    { id: c.id, name: c.name, icon: c.icon, color: c.color, type: c.type },
    ...c.children.map((child) => ({ id: child.id, name: child.name, icon: child.icon, color: child.color, type: child.type })),
  ]);

  // Query string identity — remounts <TransactionList> exactly when a
  // filter changed, never on an unrelated re-render.
  const listKey = new URLSearchParams(
    Object.entries(rawParams).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0]! : v]])),
  ).toString();

  return (
    <>
      <PageHeader title="Transaksi" action={<TransactionSearchButton />} />

      <div className="flex flex-col gap-3 pb-3">
        <div className="px-page-x">
          <PeriodPicker />
        </div>
        <p className="px-page-x text-text-muted text-sm">
          Masuk <MoneyText amount={periodSummary.income} tone="plain" size="sm" className="font-medium" /> · Keluar{' '}
          <MoneyText amount={periodSummary.expense} tone="plain" size="sm" className="font-medium" />
        </p>
        <FilterBar wallets={sheetData.wallets} categories={categoryOptions} />
      </div>

      {mostRecentPeriod === null ? (
        // Binding copy — docs/08-copywriting.md §5.5's empty-state table,
        // "Transaksi" row exactly (docs/09's own header: illustrative text
        // elsewhere is superseded by 08 wherever the two differ).
        <EmptyState
          icon={Receipt}
          title="Belum ada transaksi"
          description="Catat pemasukan atau pengeluaran pertama Anda."
          action={
            <AddTransactionSheet
              {...sheetData}
              variant="bottom"
              trigger={
                <button
                  type="button"
                  className="pressable-tint rounded-input border-border bg-surface-raised text-text inline-flex h-11 items-center justify-center border px-4 text-body font-medium"
                >
                  Tambah transaksi
                </button>
              }
            />
          }
        />
      ) : items.length === 0 ? (
        hasActiveFilters(filters) ? (
          // Binding copy — docs/08-copywriting.md §5.5, "Filter kosong" row.
          <EmptyState
            icon={SearchX}
            title="Tidak ada yang cocok"
            description="Coba ubah rentang tanggal atau kategorinya."
            action={
              <Button variant="secondary" asChild>
                <Link href="/transactions">Reset filter</Link>
              </Button>
            }
          />
        ) : (
          // Not in docs/08's table (that one only covers "never had any" /
          // "filter matched nothing") — this third empty state is this
          // task's own addition: todo.md "Periode kosong tapi ada di bulan
          // lain → tautan ke periode terakhir yang ada".
          <EmptyState
            icon={Receipt}
            title={`Tidak ada transaksi di ${formatPeriodLabel(filters.period)}`}
            description={`Transaksi terakhir Anda ada di ${formatPeriodLabel(mostRecentPeriod)}.`}
            action={
              <Button variant="secondary" asChild>
                <Link href={`/transactions?period=${mostRecentPeriod}`}>
                  Lihat {formatPeriodLabel(mostRecentPeriod)}
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <TransactionList
          key={listKey}
          initialItems={items.map(toHistoryClientItem)}
          initialNextCursor={nextCursor}
          initialDayTotals={dayTotals}
          sheetData={sheetData}
          tz={tz}
        />
      )}
    </>
  );
}
