import { GroupedBarChart } from '@/components/charts/grouped-bar-chart';
import { DataTable, type DataTableColumn } from '@/components/charts/data-table';
import { MoneyText } from '@/components/finance/money-text';
import type { MonthlyIncomeExpense } from '../queries';

/** docs/09-screen-specs.md §9 §1: "Income vs Expense — bar chart
 * berkelompok, 6 bulan terakhir." */
export function IncomeExpenseSection({ data }: { data: MonthlyIncomeExpense[] }) {
  const chartData = data.map((d) => ({
    label: d.label,
    income: Number(d.income) / 100,
    expense: Number(d.expense) / 100,
  }));

  const columns: DataTableColumn<MonthlyIncomeExpense>[] = [
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
      <h2 className="text-text text-sm font-semibold">Pemasukan vs Pengeluaran</h2>
      <GroupedBarChart data={chartData} />
      <DataTable
        caption={`Data pemasukan dan pengeluaran, ${data.length} bulan terakhir`}
        columns={columns}
        rows={data}
        getRowKey={(r) => r.period}
      />
    </section>
  );
}
