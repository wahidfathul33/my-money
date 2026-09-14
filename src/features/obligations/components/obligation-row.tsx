'use client';

/**
 * `ObligationRow` — docs/07-design-system.md §14.3's catalog entry ("Hutang/
 * piutang: sisa + jatuh tempo"), built per this task's brief as a proper
 * reusable component: name, remaining-of-initial, progress bar, due date.
 * Structural reference points: src/features/budgets/components/budget-bar.tsx
 * (linear `Progress` + threshold color + a text badge alongside color, never
 * color alone — WCAG 1.4.1) and src/features/savings/components/goal-card.tsx
 * (money-pair line + progress + status text).
 *
 * Color is never the only overdue signal: an overdue row gets a
 * `border-negative` outline, a danger-colored progress fill, AND an
 * explicit "Telat" text badge — matching `BudgetBar`'s own reasoning for
 * why its status badge exists alongside color.
 */
import { Progress } from '@/components/ui/progress';
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import { progressPercent } from '@/lib/finance/obligation';
import { cn } from '@/lib/utils';
import type { ObligationListItemClientData } from '../client-types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateStrUtc(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** `dueDate - today`, in whole days — both already resolved `YYYY-MM-DD`
 * calendar dates, so this is pure calendar arithmetic (no timezone
 * conversion needed, same reasoning as
 * src/features/transactions/components/day-group.tsx's `formatDayLabel`). */
function daysBetween(dueDate: string, today: string): number {
  return Math.round((parseDateStrUtc(dueDate) - parseDateStrUtc(today)) / MS_PER_DAY);
}

const DATE_LABEL_FORMAT = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function formatDateLabel(dateStr: string): string {
  return DATE_LABEL_FORMAT.format(new Date(parseDateStrUtc(dateStr)));
}

/** "Telat N hari" / "Jatuh tempo hari ini" / "Jatuh tempo N hari lagi"
 * (≤7 hari, matching the dashboard's own urgency window) / "Jatuh tempo 20
 * Okt" (further out) — `null` when there's no due date at all. */
function dueDateText(dueDate: string | null, today: string, overdue: boolean): string | null {
  if (dueDate === null) return null;
  const diff = daysBetween(dueDate, today);
  if (overdue) return `Telat ${Math.abs(diff)} hari`;
  if (diff === 0) return 'Jatuh tempo hari ini';
  if (diff <= 7) return `Jatuh tempo ${diff} hari lagi`;
  return `Jatuh tempo ${formatDateLabel(dueDate)}`;
}

interface ObligationRowProps {
  item: ObligationListItemClientData;
  /** `YYYY-MM-DD`, resolved ONCE by the page (server-side, timezone-aware —
   * see src/features/obligations/queries.ts's file header) and threaded
   * down here, so the due-date label never guesses "today" from the
   * viewer's local clock. */
  today: string;
  /** Tapping the row opens its manage/edit sheet — omitted renders a
   * non-interactive `<div>` instead of a `<button>`. */
  onClick?: () => void;
  className?: string;
}

export function ObligationRow({ item, today, onClick, className }: ObligationRowProps) {
  const initialAmount = deserializeMoney(item.initialAmount);
  const remainingAmount = deserializeMoney(item.remainingAmount);
  const percent = progressPercent(initialAmount, remainingAmount);

  const dueText =
    item.status === 'paid'
      ? 'Lunas'
      : item.status === 'written_off'
        ? 'Dihapuskan'
        : dueDateText(item.dueDate, today, item.overdue);

  const Container = onClick ? 'button' : 'div';

  return (
    <Container
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={onClick ? `Kelola ${item.name}` : undefined}
      className={cn(
        'rounded-card border-border bg-surface flex w-full flex-col gap-2 border p-4 text-left',
        onClick && 'pressable-tint pressable',
        item.overdue && 'border-negative',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-text truncate font-medium">{item.name}</span>
        {item.overdue && <span className="text-negative shrink-0 text-xs font-medium">Telat</span>}
      </div>

      <p className="text-text-muted text-sm">
        Sisa <MoneyText amount={remainingAmount} tone="plain" size="sm" /> dari{' '}
        <MoneyText amount={initialAmount} tone="plain" size="sm" />
      </p>

      <Progress
        value={percent}
        max={100}
        label={`${item.name} terbayar ${Math.round(percent)} persen`}
        // `bg-danger` (not `bg-negative`) — matches
        // src/features/budgets/components/budget-bar.tsx's own `over`
        // status color exactly (docs/09-screen-specs.md §7: "aksen
        // `--color-danger`" is the literal token spec.md names for overdue).
        indicatorClassName={item.overdue ? 'bg-danger' : undefined}
      />

      {dueText && (
        <p className={cn('text-xs', item.overdue ? 'text-negative font-medium' : 'text-text-muted')}>{dueText}</p>
      )}
    </Container>
  );
}
