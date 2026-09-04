'use client';

/**
 * One budget's progress row — shared by `/budgets` (personal) and
 * `/household/[id]/budgets`: docs/07-design-system.md's component table
 * lists ONE `BudgetBar` ("progress dengan ambang warna"), not a
 * personal/household pair, so this component only knows about display
 * fields (label/icon/color/amount/spent/status/percent), never `categoryId`
 * vs `categoryKey`.
 *
 * Color is never the ONLY signal (WCAG 1.4.1): warning/over also get a
 * short text badge next to the percentage — safe gets none, matching the
 * dashboard's own "budget sehat tidak butuh perhatian" philosophy (nothing
 * to call out).
 */
import { CategoryIcon } from '@/features/categories/components/category-icon';
import { Progress } from '@/components/ui/progress';
import { BUDGET_STATUS_COLOR, type BudgetStatus } from '@/lib/finance/budget';
import { deserializeMoney } from '@/lib/finance/money';
import { formatIDR } from '@/lib/finance/money';
import { cn } from '@/lib/utils';

const STATUS_BADGE_LABEL: Partial<Record<BudgetStatus, string>> = {
  warning: 'Waspada',
  over: 'Terlampaui',
};

export interface BudgetBarProps {
  icon: string;
  color: string;
  label: string;
  /** Serialized `Money` (minor units). */
  amount: string;
  /** Serialized `Money` (minor units). */
  spent: string;
  status: BudgetStatus;
  percent: number;
  onClick?: () => void;
  className?: string;
}

export function BudgetBar({ icon, color, label, amount, spent, status, percent, onClick, className }: BudgetBarProps) {
  const statusColor = BUDGET_STATUS_COLOR[status];
  const badgeLabel = STATUS_BADGE_LABEL[status];
  // Uncapped `percent` (e.g. 240 when 2.4x over) is worth showing as text —
  // only the BAR itself visually clamps at 100%.
  const displayPercent = Math.round(percent);
  const barValue = Math.min(percent, 100);

  const Container = onClick ? 'button' : 'div';

  return (
    <Container
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={onClick ? `Ubah budget ${label}` : undefined}
      className={cn(
        'rounded-card border-border bg-surface flex flex-col gap-3 border p-4 text-left',
        onClick && 'pressable-tint pressable',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <CategoryIcon icon={icon} color={color} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-text truncate font-medium">{label}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              {badgeLabel && (
                <span className={cn('text-xs font-medium', statusColor.text)}>{badgeLabel}</span>
              )}
              <span className={cn('font-money text-sm font-semibold', statusColor.text)}>
                {displayPercent}%
              </span>
            </div>
          </div>
          <Progress
            value={barValue}
            max={100}
            label={`${label} terpakai ${displayPercent}%`}
            indicatorClassName={statusColor.bar}
          />
          <p className="text-text-muted font-money text-sm">
            {formatIDR(deserializeMoney(spent))} dari {formatIDR(deserializeMoney(amount))}
          </p>
        </div>
      </div>
    </Container>
  );
}
