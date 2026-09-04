'use client';

import Link from 'next/link';
import { ProgressRing } from '@/components/ui/progress';
import { MoneyText } from '@/components/finance/money-text';
import { Icon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { deserializeMoney } from '@/lib/finance/money';
import { categoryColorClasses } from '@/features/categories/category-colors';
import { calculateGoalProgress } from '@/lib/finance/savings';
import type { SavingsGoalListItemClientData } from '../client-types';

interface GoalCardProps {
  goal: SavingsGoalListItemClientData;
  /** `/wealth/savings/[id]` from either the personal list or the household
   * list — both link to the SAME detail page (spec.md doesn't call for
   * separate personal/household detail views, and access is already scoped
   * by src/features/savings/queries.ts's `getGoal`). */
  href: string;
  /** Hides the household name chip — the household list page already shows
   * that context via its own header, so repeating it per-card is noise. */
  showHouseholdBadge?: boolean;
}

/** List-row card — name, icon, progress ring, current/target — docs/03
 * §10.3, spec.md's shared-goal example table (the per-member breakdown
 * itself lives on the detail page, not here). "Target terlewat" replaces
 * any numeric time-left the moment it applies — never a negative number. */
export function GoalCard({ goal, href, showHouseholdBadge = true }: GoalCardProps) {
  const targetAmount = deserializeMoney(goal.targetAmount);
  const currentAmount = deserializeMoney(goal.currentAmount);
  const progress = calculateGoalProgress({ targetAmount, currentAmount, targetDate: goal.targetDate });
  const colors = categoryColorClasses(goal.color);

  return (
    <Link
      href={href}
      className="pressable-tint bg-surface rounded-card flex items-center gap-3 p-4"
    >
      <span
        className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', colors.bg, colors.text)}
      >
        <Icon name={goal.icon} className="size-5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="text-text truncate text-body font-medium">{goal.name}</span>
          {showHouseholdBadge && goal.householdName && (
            <span className="bg-surface-raised text-text-subtle shrink-0 rounded-full px-2 py-0.5 text-xs">
              {goal.householdName}
            </span>
          )}
        </span>
        <span className="text-text-muted text-sm">
          <MoneyText amount={currentAmount} tone="plain" size="sm" />
          {' dari '}
          <MoneyText amount={targetAmount} tone="plain" size="sm" />
        </span>
        {/* "Sisa Rp12.000.000 · 8 bulan lagi" — docs/08-copywriting.md §8. */}
        {goal.status === 'active' && !progress.isOverdue && progress.remainingAmount > 0n && (
          <span className="text-text-muted text-xs">
            Sisa <MoneyText amount={progress.remainingAmount} tone="plain" size="sm" />
            {progress.monthsRemaining !== null && progress.monthsRemaining > 0 && (
              <> · {progress.monthsRemaining} bulan lagi</>
            )}
          </span>
        )}
        {progress.isOverdue && <span className="text-negative text-xs font-medium">Target terlewat</span>}
        {goal.status === 'completed' && <span className="text-positive-readable text-xs font-medium">Tercapai</span>}
      </span>
      <ProgressRing value={progress.progressPct} size={44} label={`Progress ${goal.name}: ${Math.round(progress.progressPct)} persen`} />
    </Link>
  );
}
