'use client';

import * as ProgressPrimitive from '@radix-ui/react-progress';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface LinearProgressProps {
  value: number;
  max?: number;
  label: string;
  className?: string;
}

/**
 * Linear — indikator dianimasikan lewat `transform: scaleX()`, bukan
 * `width`. Menganimasikan `width` memicu layout setiap frame; §12 dari
 * docs/07 melarangnya secara eksplisit (hanya `transform`/`opacity`/`filter`).
 */
export function Progress({ value, max = 100, label, className }: LinearProgressProps) {
  const ratio = Math.min(1, Math.max(0, value / max));
  return (
    <ProgressPrimitive.Root
      value={value}
      max={max}
      aria-label={label}
      className={cn('bg-surface-raised h-2 w-full overflow-hidden rounded-full', className)}
    >
      <ProgressPrimitive.Indicator
        className="bg-brand h-full w-full origin-left rounded-full transition-transform duration-300 ease-out"
        style={{ transform: `scaleX(${ratio})` }}
      />
    </ProgressPrimitive.Root>
  );
}

interface RingProgressProps {
  value: number;
  max?: number;
  label: string;
  size?: number;
  className?: string;
}

/**
 * Ring untuk target tabungan/goal — `conic-gradient` didorong oleh custom
 * property `--progress-value` yang didaftarkan lewat `@property` (lihat
 * `.ring-progress` di globals.css). Ini teknik yang disebut eksplisit di
 * docs/07 §2 untuk progress/sparkline: transisi custom property dianimasikan
 * mesin sebagai paint, bukan layout — jadi tidak melanggar larangan
 * menganimasikan `width`/`height`.
 */
export function ProgressRing({ value, max = 100, label, size = 64, className }: RingProgressProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value / max)) * 100);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('ring-progress', className)}
      style={{ '--progress-value': pct, width: size, height: size } as CSSProperties}
    >
      <span className="font-money text-text relative text-sm font-semibold">{pct}%</span>
    </div>
  );
}
