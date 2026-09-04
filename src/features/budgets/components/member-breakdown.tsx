/**
 * "Siapa menghabiskan berapa dari anggaran bersama" — docs/09-screen-specs.md
 * §12's "Siapa Membayar Apa" wireframe, scoped to one household budget.
 * EVERY active member is shown, including a 0-spend one (see
 * src/features/budgets/queries.ts `getHouseholdBudgets` doc comment) — bars
 * are normalized to the TOP spender, not the budget total, so the biggest
 * bar always reads full and the rest scale relative to it.
 */
import { MemberAvatar } from '@/features/household/components/member-avatar';
import { Progress } from '@/components/ui/progress';
import { formatIDR } from '@/lib/finance/money';
import type { MemberSpentClientData } from '../client-types';

export interface MemberBreakdownProps {
  byMember: MemberSpentClientData[];
}

export function MemberBreakdown({ byMember }: MemberBreakdownProps) {
  if (byMember.length === 0) return null;

  const maxSpent = byMember.reduce((max, m) => (BigInt(m.spent) > max ? BigInt(m.spent) : max), 0n);

  return (
    <div className="flex flex-col gap-3">
      {byMember.map((member) => {
        const spent = BigInt(member.spent);
        const ratio = maxSpent > 0n ? Number((spent * 1000n) / maxSpent) / 1000 : 0;
        return (
          <div key={member.userId} className="flex items-center gap-3">
            <MemberAvatar seed={member.userId} name={member.name} size={32} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-text truncate text-sm font-medium">{member.name}</span>
                <span className="text-text-muted font-money text-sm">{formatIDR(spent)}</span>
              </div>
              <Progress value={ratio * 100} max={100} label={`${member.name}: ${formatIDR(spent)}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
