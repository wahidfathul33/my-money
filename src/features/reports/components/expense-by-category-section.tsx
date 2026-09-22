import { ChartNoAxesColumn } from 'lucide-react';
import { HorizontalBarChart } from '@/components/charts/horizontal-bar-chart';
import { categoryColorVar } from '@/components/charts/colors';
import { DataTable, type DataTableColumn } from '@/components/charts/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { MoneyText } from '@/components/finance/money-text';
import { findDominantCategory, mergeTailIntoOther, sharePercent } from '@/lib/finance/report-aggregation';
import type { CategoryExpenseItem } from '../queries';

/** docs/09-screen-specs.md §9 §2: "Pengeluaran per kategori — bar
 * horizontal terurut menurun, dengan persentase. Bukan pie." */
export function ExpenseByCategorySection({ items, periodLabel }: { items: CategoryExpenseItem[]; periodLabel: string }) {
  if (items.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-text text-sm font-semibold">Pengeluaran per Kategori</h2>
        <EmptyState
          icon={ChartNoAxesColumn}
          title="Belum ada pengeluaran"
          description={`Belum ada transaksi pengeluaran tercatat untuk ${periodLabel}.`}
        />
      </section>
    );
  }

  const total = items.reduce((sum, i) => sum + i.amount, 0n);
  const seriesItems = items.map((i) => ({ key: i.categoryId, label: i.name, amount: i.amount }));
  const dominant = findDominantCategory(seriesItems, total);

  const merged = mergeTailIntoOther(seriesItems);
  const colorByKey = new Map(items.map((i) => [i.categoryId, categoryColorVar(i.color)]));
  const chartData = merged.map((m) => ({
    key: m.key,
    label: m.label,
    value: Number(m.amount) / 100,
    color: colorByKey.get(m.key),
  }));

  const columns: DataTableColumn<CategoryExpenseItem>[] = [
    { key: 'name', header: 'Kategori', render: (r) => r.name },
    { key: 'share', header: '%', align: 'right', render: (r) => `${sharePercent(r.amount, total).toFixed(1)}%` },
    {
      key: 'amount',
      header: 'Nominal',
      align: 'right',
      render: (r) => <MoneyText amount={r.amount} tone="plain" size="sm" />,
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-text text-sm font-semibold">Pengeluaran per Kategori</h2>
      {dominant && (
        <p className="text-text-muted text-xs">
          Didominasi {dominant.item.label} ({dominant.percent.toFixed(0)}%)
        </p>
      )}
      <HorizontalBarChart data={chartData} height={Math.max(160, merged.length * 36)} />
      <DataTable
        caption={`Data pengeluaran per kategori, ${periodLabel}`}
        columns={columns}
        rows={items}
        getRowKey={(r) => r.categoryId}
      />
    </section>
  );
}
