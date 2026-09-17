/**
 * `StatTile` — docs/07-design-system.md §14.3's catalog entry: "Label +
 * nominal + delta opsional". Built fresh for this task (didn't exist before
 * task 20) to back the dashboard's side-by-side "Kas" / "Bulan Ini" tiles
 * (docs/09-screen-specs.md §1).
 *
 * `value` is a `ReactNode`, not a `Money`, deliberately — "Kas" renders a
 * single `<MoneyText>`, but "Bulan Ini" renders a masuk/keluar PAIR
 * ("+12,5 / −8,3") that doesn't fit a single nominal. Keeping this
 * component dumb (label + arbitrary content + optional delta line) instead
 * of hardcoding a `Money` prop lets both tiles share one implementation
 * without one of them fighting the shape.
 *
 * Server-safe: no `'use client'`, no interactivity of its own — every prop
 * is already-rendered content, so this composes fine under a Server
 * Component (docs/09 §1's performance section: "Server Component untuk
 * seluruh bagian statis").
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface StatTileProps {
  label: string;
  /** The tile's primary content — typically a `<MoneyText>`, but any node
   * (e.g. a masuk/keluar pair) is allowed. */
  value: ReactNode;
  /** Optional secondary line under `value` — a delta, a breakdown, or a
   * muted caption. Omitted entirely renders nothing (no reserved space). */
  delta?: ReactNode;
  className?: string;
}

export function StatTile({ label, value, delta, className }: StatTileProps) {
  return (
    <div className={cn('rounded-card border-border bg-surface flex min-w-0 flex-1 flex-col gap-1 border p-4', className)}>
      <span className="text-text-muted text-sm">{label}</span>
      <div className="min-w-0">{value}</div>
      {delta && <div className="text-text-muted min-w-0 text-xs">{delta}</div>}
    </div>
  );
}
