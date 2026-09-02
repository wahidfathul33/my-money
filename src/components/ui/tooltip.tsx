'use client';

import { useId, useRef, type ReactNode, type ToggleEvent as ReactToggleEvent } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: string;
  children: ReactNode;
  className?: string;
}

/**
 * Popover API nativ (`popover` + `popovertarget`) — bukan Radix
 * Popper/Portal. Elemen ditaruh di *top layer* browser lewat UA
 * stylesheet, jadi tidak ada `z-index` yang perlu dikelola dan tidak ada
 * masalah `overflow: hidden` dari induknya (docs/07 §8.1, §2).
 *
 * CSS Anchor Positioning (`anchor-name`/`position-anchor`) sengaja TIDAK
 * dipakai — baru didukung satu mesin, melanggar §2. Posisi dihitung lewat
 * `getBoundingClientRect` (JS biasa, tersedia di kedua mesin) saat popover
 * terbuka, bukan lewat CSS yang timpang.
 */
export function Tooltip({ content, children, className }: TooltipProps) {
  const id = useId();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function handleToggle(e: ReactToggleEvent<HTMLDivElement>) {
    if (e.newState !== 'open' || !anchorRef.current || !popoverRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    popoverRef.current.style.left = `${rect.left + rect.width / 2}px`;
    popoverRef.current.style.top = `${rect.top - 8}px`;
  }

  return (
    <span className="inline-flex">
      {/* aria-label wajib: children sering ikon aria-hidden (tanpa nama
          teks), jadi tombolnya sendiri butuh nama aksesibel — isi tooltip
          adalah kandidat paling wajar untuk itu. */}
      <button
        ref={anchorRef}
        type="button"
        popoverTarget={id}
        className="inline-flex"
        aria-label={content}
        aria-describedby={id}
      >
        {children}
      </button>
      <div
        ref={popoverRef}
        id={id}
        role="tooltip"
        popover="auto"
        onToggle={handleToggle}
        className={cn(
          'rounded-inner bg-text text-bg shadow-float fixed m-0 -translate-x-1/2 -translate-y-full px-2.5 py-1.5 text-xs',
          className,
        )}
      >
        {content}
      </div>
    </span>
  );
}
