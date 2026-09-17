/**
 * Chart color resolution — reports charts render with SVG `fill`/`stroke`,
 * which need an actual CSS color value, not a Tailwind utility class the
 * way `src/features/net-worth/components/composition-bar.tsx`'s
 * `colorFor` (`bg-orange-500`) works for a plain `<div>`. Tailwind v4
 * exposes every default palette color as a `--color-{name}-{shade}` CSS
 * custom property globally (docs/07-design-system.md §4's semantic tokens
 * sit alongside these, not instead of them) — `categories.color`/
 * `wallets.color` already store bare palette names (`'orange'`, `'slate'`,
 * …, src/lib/db/seed/categories.ts), so resolving one to a chart-usable
 * color is just wrapping it in `var(--color-{name}-500)`.
 *
 * Kept in `src/components/charts/` (not `src/lib/finance/`) since it's
 * presentation, not domain math — pure and framework-free either way, so it
 * could move without touching its own logic if that ever mattered.
 */

/** `'orange'` → `"var(--color-orange-500)"`, usable directly as an SVG `fill`. */
export function categoryColorVar(color: string): string {
  return `var(--color-${color}-500)`;
}

/** Income/expense are ALWAYS the same two semantic tokens everywhere in the
 * app (docs/07 §4 "Aturan warna finansial") — reports charts follow that
 * rule too, never falling back to a category's own arbitrary color for
 * these two series. */
export const INCOME_COLOR = 'var(--color-positive)';
export const EXPENSE_COLOR = 'var(--color-negative)';
export const NEUTRAL_FLOW_COLOR = 'var(--color-neutral-flow)';
export const BRAND_COLOR = 'var(--color-brand)';

/** Fallback categorical sequence for series with no natural color of their
 * own (e.g. per-member bars, where a member has no "color" column) —
 * distinct, stable, and drawn from the same default Tailwind palette
 * `categoryColorVar` already resolves against, so a chart mixing both kinds
 * of series stays visually consistent. Capped at 6 entries — no chart in
 * this app ever shows more than `MAX_CHART_SERIES` series
 * (src/lib/finance/report-aggregation.ts) at once. */
export const CATEGORICAL_PALETTE = [
  categoryColorVar('sky'),
  categoryColorVar('amber'),
  categoryColorVar('emerald'),
  categoryColorVar('violet'),
  categoryColorVar('rose'),
  categoryColorVar('slate'),
];

export function paletteColorAt(index: number): string {
  return CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length]!;
}
