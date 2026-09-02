'use client';

import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type InputType = 'text' | 'number' | 'money';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  type?: InputType;
  label: string;
  /** Sembunyikan label visual tapi tetap terbaca pembaca layar. */
  hideLabel?: boolean;
  error?: string;
}

const TYPE_PROPS: Record<InputType, Partial<InputHTMLAttributes<HTMLInputElement>>> = {
  text: { type: 'text' },
  number: { type: 'text', inputMode: 'numeric' },
  // Keypad kustom untuk input transaksi utama menyusul di modul finance;
  // ini fallback native yang tetap benar tanpa JS tambahan.
  money: { type: 'text', inputMode: 'decimal' },
};

/**
 * Font-size selalu ≥16px (`text-body`) — di bawah itu iOS Safari melakukan
 * zoom otomatis saat field difokuskan (docs/07 §5.2). Tidak dinegosiasikan
 * per ukuran seperti Button.
 */
export function Input({
  type = 'text',
  label,
  hideLabel = false,
  error,
  id,
  className,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className={cn('text-text text-sm font-medium', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <input
        id={inputId}
        className={cn(
          'rounded-input bg-surface text-body text-text h-11 border px-3',
          'placeholder:text-text-subtle',
          'focus-visible:outline-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
          error ? 'border-negative' : 'border-border',
          type === 'money' && 'font-money',
          className,
        )}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        {...TYPE_PROPS[type]}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-negative text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
