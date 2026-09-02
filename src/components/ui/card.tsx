import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'flat' | 'raised';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
}

const VARIANT_CLASS: Record<Variant, string> = {
  flat: 'bg-surface border border-border',
  raised: 'bg-surface-raised shadow-raised',
};

/**
 * Radius `--radius-card`. Kontrol di dalamnya (tombol, chip) harus memakai
 * `--radius-inner` agar konsentris — lihat docs/07 §6.1.
 */
export function Card({ variant = 'flat', className, ...props }: CardProps) {
  return (
    <div className={cn('rounded-card p-card', VARIANT_CLASS[variant], className)} {...props} />
  );
}
