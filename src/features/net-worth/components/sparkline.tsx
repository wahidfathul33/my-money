/**
 * A tiny inline trend line for `NetWorthHero` — no chart library dependency
 * (none exists in this project's package.json), a hand-rolled SVG
 * `polyline` same as the rest of this app's custom chart primitives
 * (src/components/ui/progress.tsx's `ProgressRing`). Server-compatible: no
 * interactivity, so no `'use client'` needed.
 */
export function buildSparklinePoints(values: number[], width: number, height: number): string {
  if (values.length === 0) return '';
  if (values.length === 1) return `0,${(height / 2).toFixed(2)} ${width},${(height / 2).toFixed(2)}`;

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ values, width = 280, height = 40, className }: SparklineProps) {
  const points = buildSparklinePoints(values, width, height);
  const trendUp = values.length < 2 || values[values.length - 1]! >= values[0]!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden="true"
      className={className}
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        // Raw --color-positive/--color-negative tokens, NOT the
        // `text-positive-readable` utility class money-text.tsx uses — that
        // one exists specifically to fix TEXT contrast at certain
        // sizes/weights (see globals.css), a concern that doesn't apply to
        // a plain SVG stroke, and no `stroke-positive-readable` utility is
        // generated for it anyway (it's a hand-written class, not a
        // `@theme` color token).
        className={trendUp ? 'stroke-positive' : 'stroke-negative'}
      />
    </svg>
  );
}
