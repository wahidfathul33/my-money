import { ChartNoAxesColumn } from 'lucide-react';
import { StackedBar } from '@/components/charts/stacked-bar';
import { categoryColorVar, paletteColorAt } from '@/components/charts/colors';
import { DataTable, type DataTableColumn } from '@/components/charts/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { MoneyText } from '@/components/finance/money-text';
import { mergeTailIntoOther } from '@/lib/finance/report-aggregation';
import type { HouseholdCategoryRow } from '../household-queries';

/**
 * docs/06-api-contracts.md §6: "byCategory memuat dua bentuk baris.
 * Kategori bawaan dikelompokkan lewat systemKey — eksak, lintas anggota.
 * Kategori kustom tampil sebagai barisnya sendiri disertai ownerName."
 * `<DataTable>` below shows EVERY row unmerged (the API contract's own
 * "tidak ada yang dilebur" rule) — only the chart above it applies the
 * mobile 6-series cap (src/lib/finance/report-aggregation.ts's
 * `mergeTailIntoOther`), same split as the personal expense-by-category
 * section.
 */
export function HouseholdCategorySection({ items, periodLabel }: { items: HouseholdCategoryRow[]; periodLabel: string }) {
  if (items.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-text text-sm font-semibold">Pengeluaran per Kategori</h2>
        <EmptyState
          icon={ChartNoAxesColumn}
          title="Belum ada pengeluaran keluarga"
          description={`Belum ada transaksi keluarga tercatat untuk ${periodLabel}.`}
        />
      </section>
    );
  }

  const rowKey = (row: HouseholdCategoryRow) => (row.kind === 'system' ? `system:${row.systemKey}` : `custom:${row.categoryId}`);
  const seriesItems = items.map((row) => ({ key: rowKey(row), label: row.label, amount: row.amount }));
  const merged = mergeTailIntoOther(seriesItems);
  const colorByKey = new Map(
    items.map((row) => [rowKey(row), row.kind === 'system' ? categoryColorVar(row.color) : undefined]),
  );
  const chartData = merged.map((m, index) => ({
    key: m.key,
    label: m.label,
    value: Number(m.amount) / 100,
    color: colorByKey.get(m.key) ?? paletteColorAt(index),
  }));

  const columns: DataTableColumn<HouseholdCategoryRow>[] = [
    { key: 'label', header: 'Kategori', render: (r) => r.label },
    { key: 'owner', header: 'Pemilik', render: (r) => (r.kind === 'custom' ? r.ownerName : '—') },
    { key: 'share', header: '%', align: 'right', render: (r) => `${r.share.toFixed(1)}%` },
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
      <StackedBar series={chartData} />
      <DataTable
        caption={`Data pengeluaran keluarga per kategori, ${periodLabel}`}
        columns={columns}
        rows={items}
        getRowKey={rowKey}
      />
    </section>
  );
}
