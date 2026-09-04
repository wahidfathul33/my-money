'use client';

/**
 * A single transaction list row — tap opens the detail sheet, swipe left
 * reveals a quick "Hapus" action (docs/09 §3 "Geser kiri pada item →
 * aksi Hapus cepat"). Drag mechanics mirror
 * src/components/ui/sheet.tsx's own pointer-drag: direct DOM style
 * manipulation during the drag (no React re-render per pixel), settling
 * into a `revealed` boolean via React state only once the gesture ends.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { MoneyText } from '@/components/finance/money-text';
import { CategoryIcon } from '@/features/categories/components/category-icon';
import { signedTransactionAmount, transactionAmount, type TransactionClientData } from '../client-types';

const REVEAL_WIDTH = 88; // px — width of the Hapus button behind the row
const DRAG_OPEN_THRESHOLD = REVEAL_WIDTH / 2;
const DRAG_TAP_TOLERANCE = 4; // px — below this, treat the gesture as a tap, not a drag

const TIME_FORMAT = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });

interface TransactionRowProps {
  transaction: TransactionClientData;
  onOpenDetail: () => void;
  onQuickDelete: () => void;
}

export function TransactionRow({ transaction, onOpenDetail, onQuickDelete }: TransactionRowProps) {
  const [revealed, setRevealed] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startTranslate: number; dragging: boolean } | null>(null);

  function handlePointerDown(e: ReactPointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startTranslate: revealed ? -REVEAL_WIDTH : 0,
      dragging: false,
    };
    if (rowRef.current) rowRef.current.style.transition = 'none';
  }

  function handlePointerMove(e: ReactPointerEvent) {
    if (!dragState.current || !rowRef.current) return;
    const delta = e.clientX - dragState.current.startX;
    if (Math.abs(delta) > DRAG_TAP_TOLERANCE) dragState.current.dragging = true;
    const next = Math.min(0, Math.max(-REVEAL_WIDTH, dragState.current.startTranslate + delta));
    rowRef.current.style.transform = `translateX(${next}px)`;
  }

  function handlePointerUp(e: ReactPointerEvent) {
    if (!dragState.current || !rowRef.current) return;
    const { startX, startTranslate, dragging } = dragState.current;
    dragState.current = null;
    rowRef.current.style.transition = '';
    rowRef.current.style.transform = '';

    if (!dragging) {
      // A tap: close the revealed action if open, otherwise open detail.
      if (revealed) setRevealed(false);
      else onOpenDetail();
      return;
    }

    const delta = e.clientX - startX;
    const finalTranslate = Math.min(0, Math.max(-REVEAL_WIDTH, startTranslate + delta));
    setRevealed(Math.abs(finalTranslate) > DRAG_OPEN_THRESHOLD);
  }

  return (
    <div className="relative overflow-hidden">
      <button
        type="button"
        onClick={() => {
          setRevealed(false);
          onQuickDelete();
        }}
        aria-label={`Hapus ${transaction.category?.name ?? 'transaksi'}`}
        className="fill-negative-solid text-on-brand absolute inset-y-0 right-0 flex w-[88px] items-center justify-center text-sm font-medium"
      >
        Hapus
      </button>
      <div
        ref={rowRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ transform: revealed ? `translateX(-${REVEAL_WIDTH}px)` : undefined }}
        className="bg-surface relative flex touch-pan-y items-center gap-3 px-2 py-3 transition-transform"
      >
        {/* Transfer gets its own neutral treatment throughout this row — no
            category, no +/− sign, `--color-neutral-flow` via
            `tone="neutral"` (docs/07 §4 "Transfer bukan untung maupun rugi",
            tasks/08-transfers-self/spec.md). */}
        {transaction.type === 'transfer' ? (
          <span className="bg-surface-raised text-text-muted flex size-10 shrink-0 items-center justify-center rounded-full">
            <ArrowLeftRight className="size-4" aria-hidden="true" />
          </span>
        ) : transaction.category ? (
          <CategoryIcon icon={transaction.category.icon} color={transaction.category.color} />
        ) : (
          <span className="bg-surface-raised size-10 shrink-0 rounded-full" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-text truncate text-sm font-medium">
            {transaction.type === 'transfer'
              ? `${transaction.transfer!.fromWallet.name} → ${transaction.transfer!.toWallet.name}`
              : (transaction.category?.name ?? 'Transaksi')}
          </p>
          <p className="text-text-muted truncate text-xs">
            {transaction.type === 'transfer' ? 'Transfer' : (transaction.wallet?.name ?? '—')} ·{' '}
            {TIME_FORMAT.format(transaction.transactionDate)}
          </p>
        </div>
        {transaction.type === 'transfer' ? (
          <MoneyText amount={transactionAmount(transaction)} tone="neutral" size="sm" />
        ) : (
          <MoneyText amount={signedTransactionAmount(transaction)} showSign size="sm" />
        )}
      </div>
    </div>
  );
}
