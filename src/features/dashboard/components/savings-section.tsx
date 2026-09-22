/**
 * "Tabungan" — docs/09-screen-specs.md §1: at most 2 goals, nearest target
 * date first (`selectDashboardSavingsGoals`, src/features/dashboard/queries.ts).
 * Reuses `GoalCard` (src/features/savings/components/goal-card.tsx) exactly
 * as `/wealth/savings` does, so the two screens can never disagree about
 * what a goal card looks like.
 */
import { GoalCard } from '@/features/savings/components/goal-card';
import { toGoalListClientData } from '@/features/savings/client-types';
import type { SavingsGoalListItem } from '@/features/savings/queries';
import { SectionHeader } from './section-header';

interface SavingsSectionProps {
  goals: SavingsGoalListItem[];
}

export function SavingsSection({ goals }: SavingsSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Tabungan" href="/wealth/savings" />
      <div className="flex flex-col gap-2">
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={toGoalListClientData(goal)} href={`/wealth/savings/${goal.id}`} />
        ))}
      </div>
    </section>
  );
}
