'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compactIDR, truncateLabel } from '../compact-number';
import { paletteColorAt } from '../colors';
import type { HorizontalBarChartDatum } from '../horizontal-bar-chart';

interface Props {
  data: HorizontalBarChartDatum[];
  height: number;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: HorizontalBarChartDatum }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]!.payload;
  return (
    <div className="bg-surface-raised border-border shadow-float rounded-inner border px-3 py-2 text-xs">
      <p className="text-text font-medium">{item.label}</p>
      <p className="text-text-muted">Rp{item.value.toLocaleString('id-ID')}</p>
    </div>
  );
}

/**
 * Horizontal bars, sorted descending — spec.md/docs §9: "Bar horizontal,
 * bukan pie. Pada 360px, pie dengan 5 irisan dan legenda tidak terbaca."
 * `data` is expected PRE-sorted (descending) and pre-merged (max 6 rows via
 * `mergeTailIntoOther`) by the caller — this component only renders.
 */
export default function HorizontalBarChartImpl({ data, height }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => compactIDR(v)}
          tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
        />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={84}
          tickFormatter={(v: string) => truncateLabel(v, 11)}
          tick={{ fontSize: 11, fill: 'var(--color-text)' }}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-surface-raised)' }} />
        <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={18}>
          {data.map((entry, index) => (
            <Cell key={entry.key} fill={entry.color ?? paletteColorAt(index)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
