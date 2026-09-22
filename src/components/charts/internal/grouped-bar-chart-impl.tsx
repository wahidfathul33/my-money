'use client';

/**
 * Real Recharts implementation — imported ONLY via
 * `../grouped-bar-chart.tsx`'s `dynamic(..., { ssr: false })`, never
 * directly. See that file's doc comment for why the split exists.
 */
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EXPENSE_COLOR, INCOME_COLOR } from '../colors';
import { compactIDR } from '../compact-number';
import type { GroupedBarChartDatum } from '../grouped-bar-chart';

interface Props {
  data: GroupedBarChartDatum[];
  height: number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-surface-raised border-border shadow-float rounded-inner border px-3 py-2 text-xs">
      <p className="text-text mb-1 font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: Rp{p.value.toLocaleString('id-ID')}
        </p>
      ))}
    </div>
  );
}

export default function GroupedBarChartImpl({ data, height }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
        <CartesianGrid vertical={false} stroke="var(--color-separator)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v: number) => compactIDR(v)}
          tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-surface-raised)' }} />
        <Legend
          verticalAlign="top"
          height={28}
          iconType="circle"
          iconSize={8}
          formatter={(value: string) => <span className="text-text-muted text-xs">{value}</span>}
        />
        <Bar dataKey="income" name="Pemasukan" fill={INCOME_COLOR} radius={[3, 3, 0, 0]} maxBarSize={20} />
        <Bar dataKey="expense" name="Pengeluaran" fill={EXPENSE_COLOR} radius={[3, 3, 0, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}
