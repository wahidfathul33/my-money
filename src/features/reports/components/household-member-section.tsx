import { HorizontalBarChart } from '@/components/charts/horizontal-bar-chart';
import { paletteColorAt } from '@/components/charts/colors';
import { DataTable, type DataTableColumn } from '@/components/charts/data-table';
import { MoneyText } from '@/components/finance/money-text';
import type { HouseholdMemberActivity } from '../household-queries';

/** docs/01-product-analysis.md §2.9: "Laporan household: per anggota — siapa
 * membayar berapa." Presents the fact, not a judgment (docs/01 §5's risk
 * table: "Laporan menampilkan fakta, bukan penilaian"). */
export function HouseholdMemberSection({ items, periodLabel }: { items: HouseholdMemberActivity[]; periodLabel: string }) {
  if (items.length === 0) return null;

  const sorted = [...items].sort((a, b) => (b.expensePaid === a.expensePaid ? 0 : b.expensePaid > a.expensePaid ? 1 : -1));
  const chartData = sorted.map((m, index) => ({
    key: m.userId,
    label: m.name,
    value: Number(m.expensePaid) / 100,
    color: paletteColorAt(index),
  }));

  const columns: DataTableColumn<HouseholdMemberActivity>[] = [
    { key: 'name', header: 'Anggota', render: (r) => r.name },
    {
      key: 'expensePaid',
      header: 'Pengeluaran',
      align: 'right',
      render: (r) => <MoneyText amount={r.expensePaid} tone="plain" size="sm" />,
    },
    {
      key: 'incomeContributed',
      header: 'Pemasukan',
      align: 'right',
      render: (r) => <MoneyText amount={r.incomeContributed} tone="plain" size="sm" />,
    },
    {
      key: 'savingsContributed',
      header: 'Tabungan',
      align: 'right',
      render: (r) => <MoneyText amount={r.savingsContributed} tone="plain" size="sm" />,
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-text text-sm font-semibold">Per Anggota</h2>
      <HorizontalBarChart data={chartData} height={Math.max(160, sorted.length * 36)} />
      <DataTable
        caption={`Data per anggota keluarga, ${periodLabel}`}
        columns={columns}
        rows={items}
        getRowKey={(r) => r.userId}
      />
    </section>
  );
}
