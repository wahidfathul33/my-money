import { GroupedBarChart } from '@/components/charts/grouped-bar-chart';
import { DataTable, type DataTableColumn } from '@/components/charts/data-table';
import { MoneyText } from '@/components/finance/money-text';
import type { HouseholdMonthlyTrend } from '../household-queries';

/** docs/01-product-analysis.md §2.9: "Tren pengeluaran household." */
export function HouseholdTrendSection({ data }: { data: HouseholdMonthlyTrend[] }) {
  const chartData = data.map((d) => ({
    label: d.label,
    income: Number(d.income) / 100,
    expense: Number(d.expense) / 100,
  }));

  const columns: DataTableColumn<HouseholdMonthlyTrend>[] = [
    { key: 'label', header: 'Bulan', render: (r) => r.label },
    {
      key: 'income',
      header: 'Pemasukan',
      align: 'right',
      render: (r) => <MoneyText amount={r.income} tone="positive" size="sm" />,
    },
    {
      key: 'expense',
      header: 'Pengeluaran',
      align: 'right',
      render: (r) => <MoneyText amount={r.expense} tone="negative" size="sm" />,
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-text text-sm font-semibold">Tren Keluarga</h2>
      <GroupedBarChart data={chartData} />
      <DataTable
        caption={`Data pemasukan dan pengeluaran keluarga, ${data.length} bulan terakhir`}
        columns={columns}
        rows={data}
        getRowKey={(r) => r.period}
      />
    </section>
  );
}
