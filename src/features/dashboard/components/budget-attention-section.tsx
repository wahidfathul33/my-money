/**
 * "Anggaran" — docs/09-screen-specs.md §1: shown ONLY when at least one
 * budget is >= 80% used (spec.md: "Budget yang sehat tidak butuh
 * perhatian"). The caller (page.tsx) is what decides whether to render this
 * at all — this component itself just renders whatever list it's given, so
 * the emptiness rule lives in exactly one place (the page), matching every
 * other conditional section on this screen.
 */
import { BudgetBar } from '@/features/budgets/components/budget-bar';
import { toPersonalBudgetClientData } from '@/features/budgets/client-types';
import type { PersonalBudgetView } from '@/features/budgets/queries';
import { SectionHeader } from './section-header';

interface BudgetAttentionSectionProps {
  budgets: PersonalBudgetView[];
}

export function BudgetAttentionSection({ budgets }: BudgetAttentionSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Anggaran" href="/budgets" />
      <div className="flex flex-col gap-2">
        {budgets.map((budget) => {
          const data = toPersonalBudgetClientData(budget);
          return (
            <BudgetBar
              key={data.id}
              icon={data.categoryIcon}
              color={data.categoryColor}
              label={data.categoryName}
              amount={data.amount}
              spent={data.spent}
              status={data.status}
              percent={data.percent}
            />
          );
        })}
      </div>
    </section>
  );
}
