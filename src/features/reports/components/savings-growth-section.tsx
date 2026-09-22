import { LineChart } from '@/components/charts/line-chart';
import { DataTable, type DataTableColumn } from '@/components/charts/data-table';
import { MoneyText } from '@/components/finance/money-text';
import type { SavingsGrowthPoint } from '../queries';

/** docs/09-screen-specs.md §9 §5: "Pertumbuhan tabungan — total tabungan
 * dari waktu ke waktu." The final point always equals net worth's own
 * savings figure — see src/features/reports/queries.ts's `getSavingsGrowth`
 * doc comment. */
export function SavingsGrowthSection({ points }: { points: SavingsGrowthPoint[] }) {
  const chartData = points.map((p) => ({ label: p.label, value: Number(p.cumulative) / 100 }));

  const columns: DataTableColumn<SavingsGrowthPoint>[] = [
    { key: 'label', header: 'Bulan', render: (r) => r.label },
    {
      key: 'contribution',
      header: 'Kontribusi',
      align: 'right',
      render: (r) => <MoneyText amount={r.contribution} tone="auto" showSign size="sm" />,
    },
    {
      key: 'cumulative',
      header: 'Total',
      align: 'right',
      render: (r) => <MoneyText amount={r.cumulative} tone="plain" size="sm" />,
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-text text-sm font-semibold">Pertumbuhan Tabungan</h2>
      <LineChart data={chartData} />
      <DataTable
        caption={`Data pertumbuhan tabungan, ${points.length} bulan terakhir`}
        columns={columns}
        rows={points}
        getRowKey={(r) => r.period}
      />
    </section>
  );
}
