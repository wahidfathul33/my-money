'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { WalletCard } from './wallet-card';
import { reorderWalletsAction } from '../actions';
import type { WalletClientData } from '../client-types';

interface WalletGroupListProps {
  wallets: WalletClientData[];
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const copy = list.slice();
  const [moved] = copy.splice(from, 1);
  if (moved === undefined) return copy;
  copy.splice(to, 0, moved);
  return copy;
}

/**
 * One group's reorderable wallet list — press-and-hold the grip handle then
 * drag (works for both touch long-press and mouse, via Pointer Events, same
 * approach as SheetContent's own drag-to-close in src/components/ui/sheet.tsx)
 * to reorder (tasks/05-wallets/spec.md: "urutan dompet dapat diubah — tekan-lama
 * di mobile — dan bertahan"). Persists via `reorderWalletsAction` on release;
 * the local `items` state is optimistic so the row doesn't snap back while
 * the request is in flight.
 */
export function WalletGroupList({ wallets }: WalletGroupListProps) {
  const [items, setItems] = useState(wallets);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragId = useRef<string | null>(null);
  const startOrder = useRef<WalletClientData[]>(wallets);
  const isDragging = useRef(false);

  // Re-sync from the server's order after a successful revalidation —
  // skipped mid-drag so an in-flight reorder isn't visually reset.
  useEffect(() => {
    if (!isDragging.current) setItems(wallets);
  }, [wallets]);

  function handlePointerDown(id: string) {
    return (e: ReactPointerEvent) => {
      (e.target as Element).setPointerCapture(e.pointerId);
      isDragging.current = true;
      dragId.current = id;
      startOrder.current = items;
    };
  }

  function handlePointerMove(e: ReactPointerEvent) {
    if (!dragId.current) return;
    const draggedIndex = items.findIndex((w) => w.id === dragId.current);
    if (draggedIndex === -1) return;

    // Find which row the pointer is currently over by comparing its Y
    // position against each row's own bounding rect — simpler and more
    // robust than accumulating deltas, since row heights can vary slightly.
    let targetIndex = draggedIndex;
    for (const [index, wallet] of items.entries()) {
      const el = rowRefs.current.get(wallet.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (e.clientY < midpoint) {
        targetIndex = index;
        break;
      }
      targetIndex = index;
    }

    if (targetIndex !== draggedIndex) {
      setItems((prev) => arrayMove(prev, draggedIndex, targetIndex));
    }
  }

  function handlePointerUp() {
    if (!dragId.current) return;
    dragId.current = null;
    isDragging.current = false;

    const changed = items.some((w, i) => w.id !== startOrder.current[i]?.id);
    if (changed) {
      void reorderWalletsAction(items.map((w) => w.id));
    }
  }

  return (
    <div onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
      {items.map((wallet) => (
        <div
          key={wallet.id}
          ref={(el) => {
            if (el) rowRefs.current.set(wallet.id, el);
            else rowRefs.current.delete(wallet.id);
          }}
        >
          <WalletCard wallet={wallet} dragHandleProps={{ onPointerDown: handlePointerDown(wallet.id) }} />
        </div>
      ))}
    </div>
  );
}
