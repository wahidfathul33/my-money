'use client';

/**
 * `/wealth/savings` — personal + shared goals in one list, total saved
 * summary, create entry point. Mirrors src/features/wallets/components/wallets-page-client.tsx's
 * shape (summary card + list + create sheet + empty state).
 */
import { useState } from 'react';
import { Plus, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import type { SavingsGoalListItemClientData } from '../client-types';
import { GoalCard } from './goal-card';
import { GoalFormSheet } from './goal-form-sheet';

interface SavingsListClientProps {
  goals: SavingsGoalListItemClientData[];
  totalSaved: string;
  households: { id: string; name: string }[];
}

export function SavingsListClient({ goals, totalSaved, households }: SavingsListClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const isEmpty = goals.length === 0;

  return (
    <div className="px-page-x flex flex-col gap-6 pb-8">
      {!isEmpty && (
        <>
          <div className="bg-surface-raised rounded-card p-4">
            <p className="text-text-muted text-sm">Total tersimpan</p>
            <MoneyText amount={deserializeMoney(totalSaved)} tone="plain" size="lg" />
          </div>

          <Button onClick={() => setCreateOpen(true)} className="self-start">
            <Plus className="size-4" aria-hidden="true" />
            Buat target
          </Button>

          <div className="flex flex-col gap-2">
            {goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} href={`/wealth/savings/${goal.id}`} />
            ))}
          </div>
        </>
      )}

      {/* Copy per docs/08-copywriting.md §5.5's empty-state table (Tabungan row). */}
      {isEmpty && (
        <EmptyState
          icon={Target}
          title="Belum ada target"
          description="Buat target untuk mulai menyisihkan uang."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Buat target
            </Button>
          }
        />
      )}

      <GoalFormSheet open={createOpen} onOpenChange={setCreateOpen} households={households} />
    </div>
  );
}
