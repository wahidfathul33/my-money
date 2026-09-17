'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { paletteColorAt } from '../colors';
import type { StackedBarDatum } from '../stacked-bar';

interface Props {
  series: StackedBarDatum[];
  height: number;
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadEntry[] }) {
  if (!active || !payload || payload.length === 0) return null;
  // Recharts includes every stacked series in `payload` regardless of which
  // segment the pointer is over — showing the whole breakdown on any hover/
  // tap is more useful for a composition bar than isolating one segment.
  return (
    <div className="bg-surface-raised border-border shadow-float rounded-inner border px-3 py-2 text-xs">
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: Rp{p.value.toLocaleString('id-ID')}
        </p>
      ))}
    </div>
  );
}

/**
 * A single 100%-width horizontal stacked bar — todo.md's `StackedBar`,
 * "komposisi". Visually the same idea as
 * src/features/net-worth/components/composition-bar.tsx's hand-rolled
 * `<div>` version, but built on Recharts for this feature's charts (one
 * category, "Total", with every series stacked on it) — no axes are
 * rendered since a single-row proportion bar has nothing for an axis to
 * label; the paired `<DataTable>` carries the exact per-segment figures.
 */
export default function StackedBarImpl({ series, height }: Props) {
  const row: Record<string, number | string> = { name: 'Total' };
  for (const s of series) row[s.key] = s.value;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={[row]} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" hide />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-surface-raised)' }} />
        {series.map((s, index) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="composition"
            fill={s.color ?? paletteColorAt(index)}
            radius={index === series.length - 1 ? [0, 4, 4, 0] : index === 0 ? [4, 0, 0, 4] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
