'use client';

/**
 * Full contribution/withdrawal timeline for a goal — spec.md "Riwayat
 * kontribusi menampilkan nama kontributor pada goal bersama." `amount`'s
 * sign already carries the right meaning (`savings_contributions.amount`:
 * positive = contribution, negative = withdrawal), so `MoneyText`'s `auto`
 * tone/sign needs no extra branching here.
 */
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import type { ContributionHistoryItemClientData } from '../client-types';

interface ContributionHistoryProps {
  items: ContributionHistoryItemClientData[];
  /** Shows each row's contributor name — shared goals only. A personal
   * goal's history is always the caller's own, so the name would be pure
   * repetition. */
  showContributorName: boolean;
}

const DATE_FORMAT = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export function ContributionHistory({ items, showContributorName }: ContributionHistoryProps) {
  if (items.length === 0) {
    return <p className="text-text-muted text-sm">Belum ada kontribusi.</p>;
  }

  return (
    <ul className="bg-surface rounded-card overflow-hidden">
      {items.map((item) => {
        const amount = deserializeMoney(item.amount);
        const isWithdrawal = amount < 0n;

        return (
          <li
            key={item.id}
            className="list-row border-separator flex items-center justify-between gap-3 border-b px-3 py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-text truncate text-body font-medium">
                {isWithdrawal ? 'Penarikan' : 'Kontribusi'}
                {showContributorName && item.contributorName ? ` — ${item.contributorName}` : ''}
              </p>
              <p className="text-text-muted text-sm">{DATE_FORMAT.format(new Date(item.contributionDate))}</p>
              {item.note && <p className="text-text-muted truncate text-sm">{item.note}</p>}
            </div>
            <MoneyText amount={amount} tone="auto" showSign size="sm" />
          </li>
        );
      })}
    </ul>
  );
}
