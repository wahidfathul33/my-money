'use client';

import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Render sebagai child (mis. `<a>`) lewat Radix Slot, bukan `<button>`. */
  asChild?: boolean;
  children?: ReactNode;
}

// Peta varian sebagai konstanta modul — bukan ternary di JSX.
//
// primary/danger memakai fill yang SUDAH diturunkan lebih gelap dari token
// mentahnya, bukan `bg-brand`/`bg-negative` langsung: teks putih di atas
// `--color-brand`/`--color-negative` apa adanya gagal kontras AA (di mode
// gelap khususnya, ~2.4-2.8:1) — lihat
// src/app/__tests__/contrast.test.ts ("defek kontras yang sudah
// diketahui"). `bg-brand-hover` (token yang sudah ada, 52% L di kedua
// mode) menyelesaikannya untuk brand; `.fill-negative-solid`
// (globals.css) melakukan hal yang sama lewat color-mix untuk negative,
// karena tidak ada token "negative-hover" di docs/07.
const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-brand-hover text-on-brand hover:opacity-90',
  secondary: 'pressable-tint bg-surface-raised text-text border border-border hover:opacity-90',
  ghost: 'pressable-tint bg-transparent text-text hover:bg-surface-raised',
  danger: 'fill-negative-solid text-on-brand hover:opacity-90',
};

// Tinggi minimum tetap 44px (target sentuh, §9 "tanpa kecuali") di setiap
// ukuran — hanya padding/tipografi yang berbeda untuk kepadatan visual.
const SIZE_CLASS: Record<Size, string> = {
  sm: 'h-11 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-body gap-2',
  lg: 'h-12 px-6 text-body font-semibold gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  asChild = false,
  className,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  const isDisabled = disabled || loading;

  return (
    <Comp
      className={cn(
        'pressable rounded-input inline-flex items-center justify-center font-medium',
        'transition-[scale,background-color,opacity] disabled:pointer-events-none disabled:opacity-50',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {/* Radix Slot requires exactly one element child to clone props onto —
          an array (even with a falsy `loading && ...` sibling) breaks it. */}
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {children}
        </>
      )}
    </Comp>
  );
}
