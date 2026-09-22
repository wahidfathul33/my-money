import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { currentLocalPeriod } from '@/lib/date/timezone';
import { hasEnoughHistory } from '@/lib/finance/report-aggregation';
import {
  getEarliestHouseholdTransactionDate,
  getHouseholdSummary,
  getHouseholdTrend,
} from '@/features/reports/household-queries';
import { PERIOD_RE, formatPeriodLabel } from '@/features/reports/period-label';
import { HouseholdPeriodNav } from '@/features/reports/components/household-period-nav';
import { HouseholdTrendSection } from '@/features/reports/components/household-trend-section';
import { HouseholdCategorySection } from '@/features/reports/components/household-category-section';
import { HouseholdMemberSection } from '@/features/reports/components/household-member-section';

/**
 * `/household/[id]/reports` — the "rincian" `/household/[id]`'s own
 * Ringkasan page links to (todo.md: "Bagian household di /household/[id]
 * (tautan ke rincian)"). Doesn't re-verify membership itself — the layout
 * above this segment already 404s a non-member
 * (src/app/(app)/household/[householdId]/layout.tsx).
 */
export default async function HouseholdReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ householdId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { householdId } = await params;
  const sp = await searchParams;
  const period = sp.period && PERIOD_RE.test(sp.period) ? sp.period : currentLocalPeriod();

  const earliestDate = await getEarliestHouseholdTransactionDate(householdId);
  if (!hasEnoughHistory(earliestDate)) {
    return (
      <>
        <PageHeader title="Laporan Keluarga" />
        <div className="px-page-x pb-8">
          <EmptyState
            icon={BarChart3}
            title="Belum cukup data"
            description="Laporan muncul begitu ada beberapa hari transaksi keluarga tercatat."
          />
        </div>
      </>
    );
  }

  const [summary, trend] = await Promise.all([
    getHouseholdSummary(householdId, period),
    getHouseholdTrend(householdId, 6),
  ]);

  const periodLabel = formatPeriodLabel(period);

  return (
    <>
      <PageHeader title="Laporan Keluarga" />
      <div className="px-page-x flex flex-col gap-8 pb-8">
        <HouseholdPeriodNav householdId={householdId} period={period} />

        <HouseholdTrendSection data={trend} />
        <HouseholdCategorySection items={summary.byCategory} periodLabel={periodLabel} />
        <HouseholdMemberSection items={summary.byMember} periodLabel={periodLabel} />
      </div>
    </>
  );
}
