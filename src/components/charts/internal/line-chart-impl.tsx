'use client';

import { CartesianGrid, Line, LineChart as RLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compactIDR } from '../compact-number';
import { BRAND_COLOR } from '../colors';
import type { LineChartDatum } from '../line-chart';

interface Props {
  data: LineChartDatum[];
  height: number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-surface-raised border-border shadow-float rounded-inner border px-3 py-2 text-xs">
      <p className="text-text mb-1 font-medium">{label}</p>
      <p className="text-text-muted">Rp{payload[0]!.value.toLocaleString('id-ID')}</p>
    </div>
  );
}

/** Cumulative-value line — cash flow's running balance, savings growth's
 * running total (todo.md's `LineChart`, used for both). X-axis ticks come
 * pre-shortened from the caller (day-of-month numbers or short month
 * labels) — this component never rotates them. */
export default function LineChartImpl({ data, height }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RLineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-separator)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
          tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v: number) => compactIDR(v)}
          tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-border)' }} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={BRAND_COLOR}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </RLineChart>
    </ResponsiveContainer>
  );
}
