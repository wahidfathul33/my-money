'use client';

/**
 * List-row card — bank · pokok · suku bunga · jatuh tempo · sisa hari ·
 * estimasi bunga bersih (docs/09-screen-specs.md §6, todo.md). Mirrors
 * src/features/savings/components/goal-card.tsx's shape (icon circle +
 * content column + trailing figure, wrapped in a `<Link>` to the detail
 * page) — deposits have no per-item color/icon field, so a fixed
 * `Landmark` (bank) icon replaces goal-card's `<Icon name={goal.icon}>`.
 *
 * `accruedInterest`/`currentValue`/`daysRemaining` are called HERE, on the
 * client, with `new Date()` — see queries.ts's file header for why this
 * feature computes display-only figures client-side rather than
 * server-side, same as goal-card.tsx's `calculateGoalProgress` call.
 */
import Link from 'next/link';
import { Landmark } from 'lucide-react';
import { MoneyText } from '@/components/finance/money-text';
import { cn } from '@/lib/utils';
import { accruedInterest, daysRemaining } from '@/lib/finance/deposit';
import { toDepositSnapshot, type DepositListItemClientData } from '../client-types';
import { daysRemainingLabel, formatDateIndo, formatRatePercent, interestEstimateLabel } from '../display';

interface DepositCardProps {
  deposit: DepositListItemClientData;
  href: string;
}

export function DepositCard({ deposit, href }: DepositCardProps) {
  const snapshot = toDepositSnapshot(deposit);
  const now = new Date();
  const remaining = daysRemaining(snapshot, now);
  const estimate = accruedInterest(snapshot, now);
  const dueSoon = deposit.status === 'active' && remaining <= 7;

  return (
    <Link href={href} className="pressable-tint bg-surface rounded-card flex items-center gap-3 p-4">
      <span className="bg-brand-subtle text-brand-readable flex size-11 shrink-0 items-center justify-center rounded-full">
        <Landmark className="size-5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="text-text truncate text-body font-medium">{deposit.bankName}</span>
          {deposit.rolledFromId && (
            <span className="bg-surface-raised text-text-muted shrink-0 rounded-full px-2 py-0.5 text-xs">ARO</span>
          )}
          {deposit.status === 'matured' && (
            <span className="bg-warning-subtle text-warning-readable shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">
              Jatuh tempo
            </span>
          )}
        </span>
        <span className="text-text-muted text-sm">
          <MoneyText amount={snapshot.principal} tone="plain" size="sm" /> {'· '}
          {formatRatePercent(deposit.interestRateAnnual)}%/thn
        </span>
        <span className={cn('text-xs', dueSoon ? 'text-warning-readable font-medium' : 'text-text-muted')}>
          Jatuh tempo {formatDateIndo(deposit.maturityDate)}
          {deposit.status === 'active' && <> · {daysRemainingLabel(remaining)}</>}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <MoneyText amount={estimate} tone="neutral" size="sm" />
        <span className="text-text-muted text-right text-[10px] leading-tight">{interestEstimateLabel(deposit.taxRate)}</span>
      </span>
    </Link>
  );
}
