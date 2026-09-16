/**
 * The bigger trend chart on `/wealth/net-worth` and
 * `/household/[id]/net-worth` — docs/09-screen-specs.md §8/§16. Same
 * hand-rolled-SVG approach as `Sparkline` (no chart library dependency),
 * scaled up with a filled area and optional coverage-change markers.
 *
 * `coverageChangeDates` (household only) — docs/09 §16: "Penanda pada
 * grafik tren menunjukkan titik di mana cakupan berubah ... Kenaikan Rp80
 * juta karena Istri mulai berbagi bukanlah pertumbuhan kekayaan, dan
 * grafik yang tidak menandainya akan menyiratkan sebaliknya." Data comes
 * from `contributing_count` between consecutive snapshots — computed by
 * the caller (the page), not this presentational component.
 *
 * Server-compatible: no interactivity, no `'use client'`.
 */
import type { Money } from '@/lib/finance/money';

export interface AreaChartPoint {
  date: string;
  netWorth: Money;
}

interface NetWorthAreaChartProps {
  points: AreaChartPoint[];
  /** `date`s (matching `points[].date`) where sharing coverage changed. */
  coverageChangeDates?: string[];
  width?: number;
  height?: number;
  className?: string;
}

export function NetWorthAreaChart({ points, coverageChangeDates = [], width = 320, height = 120, className }: NetWorthAreaChartProps) {
  if (points.length === 0) {
    return <p className="text-text-muted text-sm">Belum ada data tren.</p>;
  }

  const values = points.map((p) => Number(p.netWorth));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: points.length > 1 ? i * stepX : width / 2,
    y: height - ((Number(p.netWorth) - min) / range) * height,
    date: p.date,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
  const lastCoord = coords[coords.length - 1]!;
  const areaPath = `${linePath} L${lastCoord.x.toFixed(2)},${height} L0,${height} Z`;

  const markerSet = new Set(coverageChangeDates);
  const markers = coords.filter((c) => markerSet.has(c.date));

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Grafik tren kekayaan bersih">
        <path d={areaPath} className="fill-brand/15" />
        <path d={linePath} fill="none" strokeWidth={2} className="stroke-brand" />
        {markers.map((m) => (
          <circle key={m.date} cx={m.x} cy={m.y} r={4} className="fill-warning stroke-surface" strokeWidth={1.5} />
        ))}
      </svg>
      {markers.length > 0 && (
        <p className="text-text-muted mt-1 text-xs">
          ▲ Titik cakupan berubah — kenaikan/penurunan di sini bisa berarti anggota mulai/berhenti berbagi, bukan perubahan kekayaan
        </p>
      )}
    </div>
  );
}

/** Dates where `contributingCount` differs from the PREVIOUS point in the
 * (already date-ascending) series — the exact "titik perubahan cakupan"
 * docs/09 §16 asks the chart to mark. The first point never counts as a
 * "change" (there's nothing before it to compare against). */
export function coverageChangePoints(points: { date: string; contributingCount: number }[]): string[] {
  const changes: string[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.contributingCount !== points[i - 1]!.contributingCount) {
      changes.push(points[i]!.date);
    }
  }
  return changes;
}
