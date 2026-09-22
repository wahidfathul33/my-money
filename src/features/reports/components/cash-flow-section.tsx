import { LineChart } from '@/components/charts/line-chart';
import { DataTable, type DataTableColumn } from '@/components/charts/data-table';
import { MoneyText } from '@/components/finance/money-text';
import type { CashFlowPoint } from '../queries';

/** docs/09-screen-specs.md §9 §4: "Arus kas — line chart saldo kumulatif." */
export function CashFlowSection({ points, periodLabel }: { points: CashFlowPoint[]; periodLabel: string }) {
  const chartData = points.map((p) => ({ label: p.date.slice(8, 10), value: Number(p.cumulative) / 100 }));

  const columns: DataTableColumn<CashFlowPoint>[] = [
    { key: 'date', header: 'Tanggal', render: (r) => r.date },
    {
      key: 'net',
      header: 'Bersih',
      align: 'right',
      render: (r) => <MoneyText amount={r.net} tone="auto" showSign size="sm" />,
    },
    {
      key: 'cumulative',
      header: 'Kumulatif',
      align: 'right',
      render: (r) => <MoneyText amount={r.cumulative} tone="plain" size="sm" />,
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-text text-sm font-semibold">Arus Kas</h2>
      <LineChart data={chartData} />
      <DataTable caption={`Data arus kas harian, ${periodLabel}`} columns={columns} rows={points} getRowKey={(r) => r.date} />
    </section>
  );
}
