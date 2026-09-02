'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
  useRef,
  type ComponentPropsWithoutRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * Sheet & Dialog adalah komponen yang sama dengan varian presentasi
 * berbeda (docs/07 §"Primitif"): `bottom` naik dari bawah (mobile),
 * `center` muncul di tengah (desktop). Menyatukannya mencegah setiap form
 * ditulis dua kali.
 *
 * Masuk/keluar dianimasikan murni CSS lewat `@starting-style` +
 * `transition-behavior: allow-discrete` (lihat `.sheet-content` /
 * `.dialog-content` / `.overlay` di globals.css) — tidak ada state
 * "sedang menutup" yang dikelola di sini.
 */

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

type Variant = 'bottom' | 'side' | 'center';

interface SheetContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  variant?: Variant;
  title: string;
  /** Judul disembunyikan secara visual tapi tetap wajib untuk pembaca layar. */
  hideTitle?: boolean;
  description?: string;
  children: ReactNode;
}

const CONTENT_VARIANT_CLASS: Record<Variant, string> = {
  bottom:
    'sheet-content fixed inset-x-0 bottom-0 rounded-t-sheet material-glass sheet-scroll safe-bottom',
  side: 'dialog-content fixed inset-y-0 right-0 h-full w-full max-w-sm rounded-l-sheet bg-surface shadow-float',
  center:
    'dialog-content fixed left-1/2 top-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-card bg-surface shadow-float',
};

const DRAG_CLOSE_DISTANCE_RATIO = 0.25; // >25% tinggi sheet
const DRAG_CLOSE_VELOCITY = 0.5; // px/ms (~500px/s)

export function SheetContent({
  variant = 'bottom',
  title,
  hideTitle = false,
  description,
  children,
  className,
  ...props
}: SheetContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dragState = useRef<{ startY: number; startTime: number; height: number } | null>(null);

  // Tarik untuk menutup dari grabber/header saja — bukan dari konten yang
  // bisa di-scroll (docs/07 §14.2). Threshold: jarak > 25% tinggi sheet
  // ATAU kecepatan lepas > 500px/s.
  function handlePointerDown(e: ReactPointerEvent) {
    if (variant !== 'bottom' || !contentRef.current) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragState.current = {
      startY: e.clientY,
      startTime: performance.now(),
      height: contentRef.current.offsetHeight,
    };
    contentRef.current.style.transition = 'none';
  }

  function handlePointerMove(e: ReactPointerEvent) {
    if (!dragState.current || !contentRef.current) return;
    const delta = e.clientY - dragState.current.startY;
    // Tahanan saat menarik ke atas melewati posisi natural (redaman, bukan
    // berhenti mati).
    const translateY = delta < 0 ? delta * 0.35 : delta;
    contentRef.current.style.translate = `0 ${translateY}px`;
  }

  function handlePointerUp(e: ReactPointerEvent) {
    if (!dragState.current || !contentRef.current) return;
    const { startY, startTime, height } = dragState.current;
    const delta = e.clientY - startY;
    const elapsed = Math.max(1, performance.now() - startTime);
    const velocity = delta / elapsed;
    dragState.current = null;
    contentRef.current.style.transition = '';
    contentRef.current.style.translate = '';

    const pastThreshold =
      delta > height * DRAG_CLOSE_DISTANCE_RATIO || velocity > DRAG_CLOSE_VELOCITY;
    if (delta > 0 && pastThreshold) closeRef.current?.click();
  }

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="overlay bg-scrim fixed inset-0 z-40" />
      <DialogPrimitive.Content
        ref={contentRef}
        className={cn('z-50 outline-none', CONTENT_VARIANT_CLASS[variant], className)}
        {...props}
      >
        {/* Tersembunyi secara visual — target untuk .click() terprogram saat
            drag grabber melewati ambang tutup (di bawah). */}
        <DialogPrimitive.Close
          ref={closeRef}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
        {variant === 'bottom' && (
          <button
            type="button"
            aria-label="Tarik atau ketuk untuk menutup"
            className="flex h-11 w-full items-center justify-center"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <span className="bg-separator h-[5px] w-9 rounded-full" />
          </button>
        )}
        <div className="flex items-center justify-between px-4 pb-2">
          <DialogPrimitive.Title
            className={cn('text-heading text-text font-semibold', hideTitle && 'sr-only')}
          >
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            className="pressable text-text-muted -mr-2 flex size-11 items-center justify-center rounded-full"
            aria-label="Tutup"
          >
            <X className="size-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        </div>
        {description && (
          <DialogPrimitive.Description className="text-text-muted px-4 pb-2 text-sm">
            {description}
          </DialogPrimitive.Description>
        )}
        {!description && (
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        )}
        <div className="px-4 pb-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

// Alias semantik — dipakai saat komponen jelas berperan sebagai dialog
// desktop, bukan sheet mobile. Sama persis di baliknya (lihat komentar di atas).
export const Dialog = Sheet;
export const DialogTrigger = SheetTrigger;
export const DialogClose = SheetClose;
export const DialogContent = SheetContent;
