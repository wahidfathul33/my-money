'use client';

/**
 * Per-contributor breakdown for a SHARED goal — spec.md's own example:
 * ```
 * 🎯 Liburan Keluarga — target Rp20.000.000
 *    Wahid   Rp5.000.000
 *    Istri   Rp3.000.000
 *    ─────────────────────
 *    Total   Rp8.000.000   → 40%
 * ```
 * `members` is already sorted biggest-first by
 * src/features/savings/queries.ts's `getContributionsByMember`. The
 * percentage uses `calculateGoalProgress` (src/lib/finance/savings.ts) —
 * the SAME function the goal card/detail ring use — so this table and the
 * ring can never quietly disagree about what "40%" means.
 */
import { Avatar } from '@/components/ui/avatar';
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import { calculateGoalProgress } from '@/lib/finance/savings';
import type { MemberContributionTotalClientData } from '../client-types';

interface MemberContributionsProps {
  members: MemberContributionTotalClientData[];
  currentAmount: string;
  targetAmount: string;
}

export function MemberContributions({ members, currentAmount, targetAmount }: MemberContributionsProps) {
  if (members.length === 0) {
    return <p className="text-text-muted text-sm">Belum ada kontribusi dari anggota mana pun.</p>;
  }

  const { progressPct } = calculateGoalProgress({
    targetAmount: deserializeMoney(targetAmount),
    currentAmount: deserializeMoney(currentAmount),
    targetDate: null,
  });

  return (
    <div className="bg-surface rounded-card flex flex-col gap-3 p-4">
      <h3 className="text-text text-sm font-semibold">Kontribusi per anggota</h3>
      <ul className="flex flex-col gap-3">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={member.name ?? 'Anggota'} size={28} />
              <span className="text-text truncate text-sm">{member.name ?? 'Anggota'}</span>
            </span>
            <MoneyText amount={deserializeMoney(member.total)} tone="plain" size="sm" />
          </li>
        ))}
      </ul>
      <div className="border-separator flex items-center justify-between border-t pt-3">
        <span className="text-text text-sm font-semibold">Total</span>
        <span className="flex items-baseline gap-2">
          <MoneyText amount={deserializeMoney(currentAmount)} tone="plain" size="sm" className="font-semibold" />
          <span className="text-text-muted text-xs">→ {Math.round(progressPct)}%</span>
        </span>
      </div>
    </div>
  );
}
