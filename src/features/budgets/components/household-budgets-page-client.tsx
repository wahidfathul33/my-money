'use client';

/**
 * `/household/[id]/budgets` — same shape as budgets-page-client.tsx (header
 * summary, sorted list, tap-to-edit sheet, empty state), plus a per-budget
 * `MemberBreakdown` — tasks/14-budgets spec.md: "Budget household
 * menampilkan rincian per anggota."
 */
import { useState } from 'react';
import { Plus, PiggyBank } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import { BudgetBar } from './budget-bar';
import { BudgetSheet } from './budget-sheet';
import { MemberBreakdown } from './member-breakdown';
import type { HouseholdBudgetClientData } from '../client-types';
import type { BudgetableCategoryKey } from '../queries';

interface HouseholdBudgetsPageClientProps {
  householdId: string;
  period: string;
  budgets: HouseholdBudgetClientData[];
  budgetableCategoryKeys: BudgetableCategoryKey[];
}

export function HouseholdBudgetsPageClient({
  householdId,
  period,
  budgets,
  budgetableCategoryKeys,
}: HouseholdBudgetsPageClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<HouseholdBudgetClientData | null>(null);

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
            Buat Anggaran
          </Button>

          <div className="flex flex-col gap-3">
            {budgets.map((budget) => (
              <Card key={budget.id} variant="flat" className="flex flex-col gap-3">
                <BudgetBar
                  icon={budget.categoryIcon}
                  color={budget.categoryColor}
                  label={budget.categoryLabel}
                  amount={budget.amount}
                  spent={budget.spent}
                  status={budget.status}
                  percent={budget.percent}
                  onClick={() => setEditingBudget(budget)}
                  className="border-none bg-transparent p-0"
                />
                <div className="border-separator border-t pt-3">
                  <MemberBreakdown byMember={budget.byMember} />
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {budgets.length === 0 && (
        <EmptyState
          icon={PiggyBank}
          title="Belum ada anggaran keluarga"
          description="Tetapkan anggaran bulanan bersama, lalu semua anggota dapat memantau pengeluaran keluarga."
          action={<Button onClick={() => setCreateOpen(true)}>Buat Anggaran</Button>}
        />
      )}

      <BudgetSheet
        scope="household"
        open={createOpen}
        onOpenChange={setCreateOpen}
        period={period}
        householdId={householdId}
        budgetableCategoryKeys={budgetableCategoryKeys}
      />

      {editingBudget && (
        <BudgetSheet
          scope="household"
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingBudget(null);
          }}
          period={period}
          householdId={householdId}
          budget={editingBudget}
          budgetableCategoryKeys={budgetableCategoryKeys}
        />
      )}
    </div>
  );
}
