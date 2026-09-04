'use client';

/**
 * A single transaction-history row — tap opens the detail sheet, swipe left
 * reveals a quick "Hapus" action (docs/09 §3 "Geser kiri pada item → aksi
 * Hapus cepat"). Rewritten for tasks/09-transaction-history (task 07's
 * version only knew income/expense — see that file's own former header,
 * "explicitly built as a placeholder for this task to replace").
 *
 * Drag mechanics unchanged from task 07's version: direct DOM style
 * manipulation during the drag (no React re-render per pixel), settling
 * into a `revealed` boolean via React state only once the gesture ends —
 * mirrors src/components/ui/sheet.tsx's own pointer-drag.
 *
 * **Transfer rows never reveal "Hapus".** `voidTransaction`
 * (src/lib/services/transactions.ts) explicitly refuses `type: 'transfer'`
 * rows — task 08 (transfers-self, in flight in a parallel worktree) owns
 * transfer deletion, not this task. Offering a swipe action that always
 * fails with "Transaksi tidak ditemukan" would be worse than not offering
 * one at all, so drag capture is disabled entirely for a transfer row.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { MoneyText } from '@/components/finance/money-text';
import { CategoryIcon } from '@/features/categories/components/category-icon';
import {
  historyItemAmount,
  signedHistoryAmount,
  type TransactionHistoryClientItem,
} from '../history-client-types';

const REVEAL_WIDTH = 88; // px — width of the Hapus button behind the row
const DRAG_OPEN_THRESHOLD = REVEAL_WIDTH / 2;
const DRAG_TAP_TOLERANCE = 4; // px — below this, treat the gesture as a tap, not a drag

const TIME_FORMAT = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });

interface TransactionRowProps {
  transaction: TransactionHistoryClientItem;
  onOpenDetail: () => void;
  onQuickDelete: () => void;
}

export function TransactionRow({ transaction, onOpenDetail, onQuickDelete }: TransactionRowProps) {
  const isTransfer = transaction.type === 'transfer';
  const [revealed, setRevealed] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startTranslate: number; dragging: boolean } | null>(null);

  function handlePointerDown(e: ReactPointerEvent) {
    if (isTransfer) return;
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
      {!isTransfer && (
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
      )}
      <div
        ref={rowRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={isTransfer ? onOpenDetail : undefined}
        style={{ transform: revealed ? `translateX(-${REVEAL_WIDTH}px)` : undefined }}
        className="bg-surface relative flex touch-pan-y items-center gap-3 px-2 py-3 transition-transform"
      >
        <RowLeading transaction={transaction} />
        <div className="min-w-0 flex-1">
          <p className="text-text truncate text-sm font-medium">
            <RowTitle transaction={transaction} />
          </p>
          <p className="text-text-muted truncate text-xs">
            <RowMeta transaction={transaction} />
          </p>
        </div>
        <RowAmount transaction={transaction} />
      </div>
    </div>
  );
}

function RowLeading({ transaction }: { transaction: TransactionHistoryClientItem }) {
  if (transaction.type === 'transfer') {
    return (
      <span className="bg-surface-raised text-text-muted flex size-10 shrink-0 items-center justify-center rounded-full">
        <ArrowLeftRight className="size-5" aria-hidden="true" />
      </span>
    );
  }
  return transaction.category ? (
    <CategoryIcon icon={transaction.category.icon} color={transaction.category.color} />
  ) : (
    <span className="bg-surface-raised size-10 shrink-0 rounded-full" />
  );
}

function RowTitle({ transaction }: { transaction: TransactionHistoryClientItem }) {
  if (transaction.type === 'transfer') return 'Transfer';
  return transaction.category?.name ?? 'Transaksi';
}

/** "BCA → GoPay" — docs/09 §3 "netral, format 'BCA → GoPay', tanpa tanda". Falls back to the counterparty's name for a member-transfer's own side, and to a bare "→"/"←" when even that isn't known (defensive — task 08 is self-transfer only, so this branch isn't reachable yet in practice). */
function RowMeta({ transaction }: { transaction: TransactionHistoryClientItem }) {
  if (transaction.type === 'transfer') {
    const fromLabel = transaction.transferFrom?.name ?? transaction.counterpartyName;
    const toLabel = transaction.transferTo?.name ?? transaction.counterpartyName;
    return (
      <>
        {fromLabel ?? '—'} → {toLabel ?? '—'} · {TIME_FORMAT.format(transaction.transactionDate)}
      </>
    );
  }
  return (
    <>
      {transaction.wallet?.name ?? '—'} · {TIME_FORMAT.format(transaction.transactionDate)}
    </>
  );
}

function RowAmount({ transaction }: { transaction: TransactionHistoryClientItem }) {
  if (transaction.type === 'transfer') {
    return <MoneyText amount={historyItemAmount(transaction)} tone="neutral" size="sm" />;
  }
  return <MoneyText amount={signedHistoryAmount(transaction)} showSign size="sm" />;
}
