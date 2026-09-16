/**
 * One member's row on `/household/[id]/net-worth` — docs/09-screen-specs.md
 * §16's PRIMARY view (ADR-029), not a supporting detail. A member who
 * hasn't turned on sharing still renders here, labeled "Belum berbagi"
 * instead of a number — hiding the row would make the total look more
 * complete than it is.
 *
 * Server-compatible (no 'use client'): plain display, no interactivity of
 * its own beyond `MoneyText`'s own subcomponents, same as
 * src/features/budgets/components/budget-bar.tsx when rendered without an
 * `onClick`.
 */
import { MemberAvatar } from '@/features/household/components/member-avatar';
import { MoneyText } from '@/components/finance/money-text';
import type { Money } from '@/lib/finance/money';

export interface MemberNetWorthRowProps {
  userId: string;
  name: string | null;
  sharing: boolean;
  assets: Money;
  liabilities: Money;
  netWorth: Money;
  className?: string;
}

export function MemberNetWorthRow({ userId, name, sharing, assets, liabilities, netWorth }: MemberNetWorthRowProps) {
  const displayName = name ?? 'Anggota';

  return (
    <div className="rounded-card border-border bg-surface flex items-center gap-3 border p-4">
      <MemberAvatar seed={userId} name={displayName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-text truncate font-medium">{displayName}</span>
        {sharing && (
          <span className="text-text-muted font-money text-sm">
            Aset {formatShort(assets)} · Liabilitas {formatShort(liabilities)}
          </span>
        )}
      </div>
      {sharing ? (
        <MoneyText amount={netWorth} tone="plain" size="md" />
      ) : (
        <span className="text-text-muted shrink-0 text-sm font-medium">Belum berbagi</span>
      )}
    </div>
  );
}

// A small inline formatter (not `formatIDR`'s full "Rp165.000.000") to keep
// the subtext line ("Aset 175,0 jt · Liabilitas 10,0 jt") the same compact
// shape docs/09-screen-specs.md §16's mockup uses. Kept local rather than a
// shared utility — this exact "X,Y jt" abbreviation isn't used anywhere
// else in the app yet.
function formatShort(amount: Money): string {
  const rupiah = amount / 100n;
  const negative = rupiah < 0n;
  const abs = negative ? -rupiah : rupiah;
  if (abs >= 1_000_000n) {
    const millions = Number(abs) / 1_000_000;
    return `${negative ? '−' : ''}${millions.toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  }
  if (abs >= 1_000n) {
    const thousands = Number(abs) / 1_000;
    return `${negative ? '−' : ''}${thousands.toLocaleString('id-ID', { maximumFractionDigits: 1 })} rb`;
  }
  return `${negative ? '−' : ''}${abs.toString()}`;
}
