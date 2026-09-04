'use client';

/**
 * `/household/[id]/savings` — this household's shared goals only. Creating
 * from here always produces a SHARED goal for THIS household
 * (`GoalFormSheet`'s `lockedHouseholdId`, no personal escape hatch) — any
 * active member may create one (docs/03 §10.2, spec.md acceptance).
 */
import { useState } from 'react';
import { Plus, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import type { SavingsGoalListItemClientData } from '../client-types';
import { GoalCard } from './goal-card';
import { GoalFormSheet } from './goal-form-sheet';

interface HouseholdSavingsListClientProps {
  goals: SavingsGoalListItemClientData[];
  householdId: string;
}

export function HouseholdSavingsListClient({ goals, householdId }: HouseholdSavingsListClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const isEmpty = goals.length === 0;

  return (
    <div className="px-page-x flex flex-col gap-6 pb-8">
      {/* Only ONE "Buat target" trigger at a time — this persistent button
          when the list is non-empty, EmptyState's own action button when
          it's empty. Rendering both simultaneously (a bug caught by
          e2e/savings-household.spec.ts: getByRole('button', { name: 'Buat
          target' }) resolving to two elements) would make every query for
          it ambiguous. */}
      {!isEmpty && (
        <Button onClick={() => setCreateOpen(true)} className="self-start">
          <Plus className="size-4" aria-hidden="true" />
          Buat target
        </Button>
      )}

      {!isEmpty && (
        <div className="flex flex-col gap-2">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              href={`/wealth/savings/${goal.id}`}
              showHouseholdBadge={false}
            />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          icon={Target}
          title="Belum ada target bersama"
          description="Buat target tabungan yang bisa dilihat dan diisi seluruh anggota keluarga — masing-masing dari dompetnya sendiri."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Buat target
            </Button>
          }
        />
      )}

      <GoalFormSheet open={createOpen} onOpenChange={setCreateOpen} lockedHouseholdId={householdId} />
    </div>
  );
}
