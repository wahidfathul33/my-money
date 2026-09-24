'use client';

import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'selectable' | 'filter';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  selected?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  selectable: '',
  filter: '',
};

/** Kapsul (`--radius-chip`). Target sentuh tetap ≥44px meski visualnya ramping. */
export function Chip({ variant = 'selectable', selected = false, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      role={variant === 'filter' ? 'checkbox' : undefined}
      aria-checked={variant === 'filter' ? selected : undefined}
      aria-pressed={variant === 'selectable' ? selected : undefined}
      className={cn(
        'pressable rounded-chip inline-flex h-11 min-w-11 items-center justify-center border px-4 text-sm font-medium',
        'transition-colors disabled:pointer-events-none disabled:opacity-50',
        selected
          ? // text-brand-readable, bukan text-brand mentah — lihat komentar
            // di globals.css: --color-brand gagal AA di atas
            // --color-brand-subtle pada mode terang.
            'border-brand bg-brand-subtle text-brand-readable'
          : 'border-border bg-surface text-text-muted hover:bg-surface-raised',
        VARIANT_CLASS[variant],
        className,
      )}
      {...props}
    />
  );
}
