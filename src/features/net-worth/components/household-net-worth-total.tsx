/**
 * The household total row — docs/09-screen-specs.md §16: a SECONDARY row
 * beneath the per-member list (ADR-029's primary view), always paired with
 * its coverage. `coverage` is a required prop with no default — same
 * constraint `CoverageNote` itself enforces, deliberately duplicated here
 * (not just delegated) so that even a caller who never imports
 * `CoverageNote` directly still cannot render a bare total number through
 * this component without supplying it — see this file's own
 * `__tests__/household-net-worth-total.test.tsx` for the `@ts-expect-error`
 * proof that omitting it is a compile error, not a convention.
 */
import { MoneyText } from '@/components/finance/money-text';
import { CoverageNote, type CoverageInfo } from '@/components/finance/coverage-note';
import type { Money } from '@/lib/finance/money';
import { cn } from '@/lib/utils';

export interface HouseholdNetWorthTotalProps {
  netWorth: Money;
  coverage: CoverageInfo;
  className?: string;
}

export function HouseholdNetWorthTotal({ netWorth, coverage, className }: HouseholdNetWorthTotalProps) {
  return (
    <div className={cn('border-border flex flex-col gap-1 border-t pt-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-text font-medium">Total</span>
        <MoneyText amount={netWorth} tone="plain" size="lg" />
      </div>
      <CoverageNote coverage={coverage} />
    </div>
  );
}
