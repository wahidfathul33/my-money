/**
 * Composition — a STACKED HORIZONTAL BAR, never a pie chart.
 * docs/09-screen-specs.md §8: "Stacked bar dipilih ketimbang pie: pada
 * lebar 360px, pie chart dengan 5 irisan dan legenda tidak terbaca,
 * sementara bar horizontal ditambah daftar berlabel terbaca sempurna."
 *
 * Every row is a `Link` to its source module — spec.md's "penelusuran"
 * requirement ("total → komposisi → modul → transaksi asal"). No
 * interactivity beyond navigation, so this stays a plain Server-compatible
 * component (no `'use client'`), same as
 * src/features/budgets/components/budget-bar.tsx without an `onClick`.
 */
import Link from 'next/link';
import { MoneyText } from '@/components/finance/money-text';
import type { Money } from '@/lib/finance/money';
import { cn } from '@/lib/utils';

export interface CompositionBarItem {
  key: string;
  label: string;
  amount: Money;
  href: string;
}

interface CompositionBarProps {
  items: CompositionBarItem[];
  /** `bg-*` class per item key — distinct, stable colors so the bar segment
   * and its legend row are visibly the same category. */
  colorFor: (key: string) => string;
  emptyLabel: string;
  className?: string;
}

/** Basis points (0–10 000) of `amount` within `total` — integer bigint
 * math, same "no float division on money" discipline as
 * src/lib/finance/budget.ts's `calculateBudgetStatus`. Used both for the
 * bar segment's `flex-grow` (any positive number works as a ratio; basis
 * points keeps every item's contribution safely inside `Number`'s exact
 * range even for very large rupiah totals) and the displayed percentage. */
function shareBasisPoints(amount: Money, total: Money): number {
  if (total <= 0n) return 0;
  return Number((amount * 10_000n) / total);
}

export function CompositionBar({ items, colorFor, emptyLabel, className }: CompositionBarProps) {
  const total = items.reduce((sum, item) => sum + item.amount, 0n);

  if (items.length === 0 || total <= 0n) {
    return <p className={cn('text-text-muted text-sm', className)}>{emptyLabel}</p>;
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        role="img"
        aria-label={`Komposisi: ${items.map((i) => `${i.label} ${(shareBasisPoints(i.amount, total) / 100).toFixed(0)}%`).join(', ')}`}
        className="flex h-3 w-full overflow-hidden rounded-full"
      >
        {items.map((item) => (
          <div key={item.key} className={colorFor(item.key)} style={{ flexGrow: shareBasisPoints(item.amount, total) || 1 }} />
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const bp = shareBasisPoints(item.amount, total);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className="pressable-tint flex min-h-11 items-center gap-3 rounded-lg px-1 py-1"
                aria-label={`Lihat ${item.label}`}
              >
                <span className={cn('size-2.5 shrink-0 rounded-full', colorFor(item.key))} aria-hidden="true" />
                <span className="text-text min-w-0 flex-1 truncate text-sm">{item.label}</span>
                <span className="text-text-muted shrink-0 text-sm tabular-nums">{(bp / 100).toFixed(0)}%</span>
                <MoneyText amount={item.amount} tone="plain" size="sm" className="shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const ASSET_COLORS: Record<string, string> = {
  deposits: 'bg-sky-500',
  gold: 'bg-amber-500',
  savings: 'bg-emerald-500',
  cash: 'bg-violet-500',
  otherAssets: 'bg-slate-500',
  receivables: 'bg-cyan-500',
};

const LIABILITY_COLORS: Record<string, string> = {
  debts: 'bg-rose-500',
  creditCards: 'bg-orange-500',
  cashOverdraft: 'bg-red-500',
};

export function assetColorFor(key: string): string {
  return ASSET_COLORS[key] ?? 'bg-slate-500';
}

export function liabilityColorFor(key: string): string {
  return LIABILITY_COLORS[key] ?? 'bg-rose-500';
}
