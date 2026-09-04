'use client';

/**
 * `/budgets` — tasks/14-budgets/spec.md: list sorted by percent used
 * descending (already sorted server-side by
 * src/features/budgets/queries.ts's `getPersonalBudgets`), header summary
 * (total budgeted/spent/remaining), tap a row to edit, empty state.
 */
import { useState } from 'react';
import { Plus, PiggyBank } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import { BudgetBar } from './budget-bar';
import { BudgetSheet } from './budget-sheet';
import type { PersonalBudgetClientData } from '../client-types';
import type { BudgetableCategory } from '../queries';

interface BudgetsPageClientProps {
  period: string;
  budgets: PersonalBudgetClientData[];
  budgetableCategories: BudgetableCategory[];
}

export function BudgetsPageClient({ period, budgets, budgetableCategories }: BudgetsPageClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<PersonalBudgetClientData | null>(null);

  const totalAmount = budgets.reduce((sum, b) => sum + deserializeMoney(b.amount), 0n);
  const totalSpent = budgets.reduce((sum, b) => sum + deserializeMoney(b.spent), 0n);
  const totalRemaining = totalAmount - totalSpent;

  return (
    <div className="px-page-x flex flex-col gap-6 pb-8">
      {budgets.length > 0 && (
        <>
          <div className="bg-surface-raised rounded-card grid grid-cols-3 gap-2 p-4">
            <div className="flex flex-col gap-0.5">
              <p className="text-text-muted text-xs">Dianggarkan</p>
              <MoneyText amount={totalAmount} tone="plain" size="sm" />
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-text-muted text-xs">Terpakai</p>
              <MoneyText amount={totalSpent} tone="plain" size="sm" />
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-text-muted text-xs">Sisa</p>
              <MoneyText amount={totalRemaining} tone="plain" size="sm" />
            </div>
          </div>

          <Button onClick={() => setCreateOpen(true)} className="self-start">
            <Plus className="size-4" aria-hidden="true" />
            Tambah budget
          </Button>

          <div className="flex flex-col gap-3">
            {budgets.map((budget) => (
              <BudgetBar
                key={budget.id}
                icon={budget.categoryIcon}
                color={budget.categoryColor}
                label={budget.categoryName}
                amount={budget.amount}
                spent={budget.spent}
                status={budget.status}
                percent={budget.percent}
                onClick={() => setEditingBudget(budget)}
              />
            ))}
          </div>
        </>
      )}

      {budgets.length === 0 && (
        <EmptyState
          icon={PiggyBank}
          title="Belum ada budget"
          description="Tetapkan anggaran bulanan, lalu kami ingatkan saat mendekati batas."
          action={<Button onClick={() => setCreateOpen(true)}>Buat Anggaran</Button>}
        />
      )}

      <BudgetSheet
        scope="personal"
        open={createOpen}
        onOpenChange={setCreateOpen}
        period={period}
        budgetableCategories={budgetableCategories}
      />

      {editingBudget && (
        <BudgetSheet
          scope="personal"
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingBudget(null);
          }}
          period={period}
          budget={editingBudget}
          budgetableCategories={budgetableCategories}
        />
      )}
    </div>
  );
}
