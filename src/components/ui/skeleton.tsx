import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'text' | 'card' | 'list';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  /** Jumlah baris untuk variant="list". */
  rows?: number;
}

const VARIANT_CLASS: Record<Variant, string> = {
  text: 'h-4 w-full rounded-full',
  card: 'h-32 w-full rounded-card',
  list: '',
};

/** Pulse, bukan shimmer bergerak (docs/07 §8) — seukuran konten akhir. */
export function Skeleton({ variant = 'text', rows = 3, className, ...props }: SkeletonProps) {
  if (variant === 'list') {
    return (
      <div
        className={cn('flex flex-col gap-3', className)}
        role="status"
        aria-label="Memuat"
        {...props}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="rounded-inner bg-surface-raised animate-pulse"
            style={{ height: 56 }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn('bg-surface-raised animate-pulse', VARIANT_CLASS[variant], className)}
      role="status"
      aria-label="Memuat"
      {...props}
    />
  );
}
