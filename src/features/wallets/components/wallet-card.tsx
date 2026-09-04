'use client';

import Link from 'next/link';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MoneyText } from '@/components/finance/money-text';
import { WALLET_COLOR_CLASS, WALLET_ICON_MAP, WALLET_TYPE_META } from '@/features/wallets/wallet-type-meta';
import { walletBalance, type WalletClientData } from '@/features/wallets/client-types';

interface WalletCardProps {
  wallet: WalletClientData;
  /** Renders a drag handle beside the row — used inside the reorderable
   * group list (wallet-group-list.tsx). Kept OUTSIDE the `<Link>` (a
   * `<button>` nested inside an `<a>` is invalid, interactive-in-interactive
   * markup) so the row stays a normal, navigable link either way. */
  dragHandleProps?: {
    onPointerDown: (e: React.PointerEvent) => void;
  };
  className?: string;
}

/**
 * `WalletCard` — name, type, balance, icon, color (docs/07 §14.3). Balance
 * uses `tone="plain"` deliberately: money-text.tsx's own doc comment calls
 * this out as the case it exists for — "saldo dompet netral", not
 * income/expense semantics.
 */
export function WalletCard({ wallet, dragHandleProps, className }: WalletCardProps) {
  const meta = WALLET_TYPE_META[wallet.type];
  const Icon = WALLET_ICON_MAP[wallet.icon] ?? meta.Icon;
  const colorClass = WALLET_COLOR_CLASS[wallet.color] ?? WALLET_COLOR_CLASS[meta.color];

  return (
    <div className={cn('list-row border-separator flex items-center border-b', className)}>
      {dragHandleProps && (
        <button
          type="button"
          aria-label={`Urutkan ulang ${wallet.name}`}
          className="pressable text-text-subtle flex size-11 shrink-0 touch-none items-center justify-center"
          onPointerDown={dragHandleProps.onPointerDown}
        >
          <GripVertical className="size-5" aria-hidden="true" />
        </button>
      )}
      <Link
        href={`/wallets/${wallet.id}`}
        className={cn(
          'pressable-tint flex min-w-0 flex-1 items-center gap-3 py-3',
          dragHandleProps ? 'pl-1 pr-3' : 'px-3',
        )}
      >
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full',
            colorClass,
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-text truncate text-body font-medium">{wallet.name}</span>
          <span className="text-text-muted text-sm">{meta.label}</span>
        </span>
        <MoneyText
          amount={walletBalance(wallet)}
          tone="plain"
          // Credit cards are DB-constrained to balance <= 0 (schema.ts's
          // `wallets_credit_card_balance_check`) and shown as an absolute
          // liability amount under "Liabilitas" — the sign is redundant
          // there. Every other wallet type has no such constraint; a
          // negative balance (overdrawn relative to what's recorded) is a
          // meaningful, must-be-visible state — hiding its sign would
          // silently show a user money they don't have.
          showSign={wallet.type !== 'credit_card'}
          size="md"
          className="shrink-0"
        />
      </Link>
    </div>
  );
}
