/**
 * "Perlu Perhatian" — docs/09-screen-specs.md §1: shown ONLY when a debt or
 * receivable is due within 7 days or already overdue. Carried over from
 * task 18's placeholder block on `src/app/(app)/page.tsx` (same markup,
 * same `getUpcomingDue(userId, 7, ...)` source), now promoted to its own
 * reusable component per this task's file layout.
 */
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import { toUpcomingClientData } from '@/features/obligations/client-types';
import type { UpcomingObligation } from '@/features/obligations/queries';

interface NeedsAttentionSectionProps {
  items: UpcomingObligation[];
}

export function NeedsAttentionSection({ items }: NeedsAttentionSectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-text text-sm font-semibold">Perlu Perhatian</h2>
      <div className="flex flex-col gap-2">
        {items.map((raw) => {
          const item = toUpcomingClientData(raw);
          return (
            <Link
              key={item.id}
              href={`/wealth/debts?tab=${item.kind === 'debt' ? 'debts' : 'receivables'}`}
              className="pressable-tint bg-surface rounded-card flex items-center gap-3 p-4"
            >
              <span className="bg-negative-subtle text-negative flex size-10 shrink-0 items-center justify-center rounded-full">
                <AlertTriangle className="size-4" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-text truncate text-sm font-medium">{item.name}</span>
                <span className={item.overdue ? 'text-negative text-xs font-medium' : 'text-text-muted text-xs'}>
                  {item.overdue ? 'Telat' : 'Jatuh tempo segera'}
                </span>
              </span>
              <MoneyText amount={deserializeMoney(item.remainingAmount)} tone="plain" size="sm" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
