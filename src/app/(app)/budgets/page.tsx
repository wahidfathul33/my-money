import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { currentLocalPeriod } from '@/lib/date/timezone';
import { getPersonalBudgets, listBudgetableCategories } from '@/features/budgets/queries';
import { toPersonalBudgetClientData } from '@/features/budgets/client-types';
import { BudgetsPageClient } from '@/features/budgets/components/budgets-page-client';

/**
 * `/budgets` — tasks/14-budgets/spec.md, docs/09-screen-specs.md §11:
 * "Daftar budget periode berjalan dengan progress bar, diurut dari
 * persentase terpakai tertinggi. Ringkasan di header: total dianggarkan,
 * total terpakai, sisa." Always the CURRENT period — no period picker in
 * this task's scope (todo.md's UI checklist doesn't list one).
 */
export default async function BudgetsPage() {
  const user = await requireUser();
  const period = currentLocalPeriod();

  const [budgets, budgetableCategories] = await Promise.all([
    getPersonalBudgets(user.id, period),
    listBudgetableCategories(user.id, period),
  ]);

  return (
    <>
      <PageHeader title="Anggaran" />
      <BudgetsPageClient
        period={period}
        budgets={budgets.map(toPersonalBudgetClientData)}
        budgetableCategories={budgetableCategories}
      />
    </>
  );
}
