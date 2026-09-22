import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { requireUser } from '@/lib/auth/require-user';
import { currentLocalPeriod } from '@/lib/date/timezone';
import { hasEnoughHistory } from '@/lib/finance/report-aggregation';
import {
  getCashFlow,
  getEarliestTransactionDate,
  getExpenseByCategory,
  getIncomeVsExpense,
  getSavingsGrowth,
  getTopCategories,
} from '@/features/reports/queries';
import { PERIOD_RE, formatPeriodLabel } from '@/features/reports/period-label';
import { PeriodNav } from '@/features/reports/components/period-nav';
import { IncomeExpenseSection } from '@/features/reports/components/income-expense-section';
import { ExpenseByCategorySection } from '@/features/reports/components/expense-by-category-section';
import { TopCategoriesSection } from '@/features/reports/components/top-categories-section';
import { CashFlowSection } from '@/features/reports/components/cash-flow-section';
import { SavingsGrowthSection } from '@/features/reports/components/savings-growth-section';

/**
 * `/reports` — docs/09-screen-specs.md §9: period selector + 5 sections
 * (income vs expense, expense by category, top categories, cash flow,
 * savings growth), all sharing one selected period except the two
 * 6-months-trailing charts (income vs expense, savings growth), which
 * always show the same trailing window regardless of the period picker —
 * matching how `/wealth/net-worth`'s trend chips are independent of any
 * single-period selector on that page.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const period = sp.period && PERIOD_RE.test(sp.period) ? sp.period : currentLocalPeriod();

  const earliestDate = await getEarliestTransactionDate(user.id);
  if (!hasEnoughHistory(earliestDate)) {
    return (
      <>
        <PageHeader title="Laporan" />
        <div className="px-page-x pb-8">
          <EmptyState
            icon={BarChart3}
            title="Belum cukup data"
            description="Catat transaksi selama beberapa hari lagi supaya laporan punya cukup data untuk ditampilkan."
          />
        </div>
      </>
    );
  }

  const [incomeExpense, expenseByCategory, topCategories, cashFlow, savingsGrowth] = await Promise.all([
    getIncomeVsExpense(user.id, 6),
    getExpenseByCategory(user.id, period),
    getTopCategories(user.id, period, 3),
    getCashFlow(user.id, period),
    getSavingsGrowth(user.id, 6),
  ]);

  const periodLabel = formatPeriodLabel(period);

  return (
    <>
      <PageHeader title="Laporan" />
      <div className="px-page-x flex flex-col gap-8 pb-8">
        <PeriodNav period={period} />

        <IncomeExpenseSection data={incomeExpense} />
        <ExpenseByCategorySection items={expenseByCategory} periodLabel={periodLabel} />
        <TopCategoriesSection items={topCategories} />
        <CashFlowSection points={cashFlow} periodLabel={periodLabel} />
        <SavingsGrowthSection points={savingsGrowth} />
      </div>
    </>
  );
}
