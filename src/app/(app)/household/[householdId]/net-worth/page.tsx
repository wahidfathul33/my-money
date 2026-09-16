import Link from 'next/link';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { MemberNetWorthRow } from '@/features/net-worth/components/member-net-worth-row';
import { HouseholdNetWorthTotal } from '@/features/net-worth/components/household-net-worth-total';
import { NetWorthAreaChart, coverageChangePoints } from '@/features/net-worth/components/area-chart';
import { CompositionBar, assetColorFor, liabilityColorFor } from '@/features/net-worth/components/composition-bar';
import {
  buildAssetComposition,
  buildLiabilityComposition,
  getHouseholdNetWorth,
  getHouseholdNetWorthHistory,
  type NetWorthHistoryRange,
} from '@/features/net-worth/queries';
import { cn } from '@/lib/utils';

const RANGE_OPTIONS: { value: NetWorthHistoryRange; label: string }[] = [
  { value: '3m', label: '3B' },
  { value: '6m', label: '6B' },
  { value: '1y', label: '1T' },
  { value: 'all', label: 'Semua' },
];

function isValidRange(value: string | undefined): value is NetWorthHistoryRange {
  return value === '3m' || value === '6m' || value === '1y' || value === 'all';
}

interface HouseholdNetWorthPageProps {
  params: Promise<{ householdId: string }>;
  // Plain `Link`s (not a client-side fetch) — unlike /wealth/net-worth,
  // there is no `GET /api/households/[id]/net-worth/history` endpoint in
  // this task's scope (docs/06-api-contracts.md §6 only defines the
  // current-snapshot GET), so range switching here re-renders the whole
  // Server Component via a search param, same shape as
  // src/app/(app)/household/[householdId]/transactions/page.tsx's `memberId`.
  searchParams: Promise<{ range?: string }>;
}

/**
 * `/household/[id]/net-worth` — docs/09-screen-specs.md §16. Ordering is
 * deliberate and matches todo.md exactly: per-member list FIRST (ADR-029's
 * primary view), then the total + coverage as a secondary row, then trend,
 * then composition. Doesn't re-verify membership itself — the layout above
 * this segment already 404s a non-member.
 */
export default async function HouseholdNetWorthPage({ params, searchParams }: HouseholdNetWorthPageProps) {
  const { householdId } = await params;
  const { range: rawRange } = await searchParams;
  const range: NetWorthHistoryRange = isValidRange(rawRange) ? rawRange : '3m';

  const [overview, history] = await Promise.all([
    getHouseholdNetWorth(householdId),
    getHouseholdNetWorthHistory(householdId, range),
  ]);

  const assetItems = buildAssetComposition(overview.composition.assets);
  const liabilityItems = buildLiabilityComposition(overview.composition.liabilities);
  const coverageChangeDates = coverageChangePoints(
    history.map((h) => ({ date: h.date, contributingCount: h.contributingCount })),
  );

  return (
    <>
      <PageHeader title="Kekayaan Keluarga" />
      <div className="px-page-x flex flex-col gap-8 pb-8">
        {overview.byMember.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Belum ada anggota"
            description="Kekayaan keluarga muncul begitu ada anggota aktif di keluarga ini."
          />
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <h2 className="text-text text-sm font-semibold">Per Anggota</h2>
              <div className="flex flex-col gap-2">
                {overview.byMember.map((m) => (
                  <MemberNetWorthRow
                    key={m.userId}
                    userId={m.userId}
                    name={m.name}
                    sharing={m.sharing}
                    assets={m.assets}
                    liabilities={m.liabilities}
                    netWorth={m.netWorth}
                  />
                ))}
              </div>
              <HouseholdNetWorthTotal netWorth={overview.totals.netWorth} coverage={overview.coverage} />
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-text text-sm font-semibold">Tren</h2>
              <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Rentang waktu">
                {RANGE_OPTIONS.map((opt) => (
                  <Link
                    key={opt.value}
                    href={`/household/${householdId}/net-worth?range=${opt.value}`}
                    aria-pressed={opt.value === range}
                    className={cn(
                      'pressable rounded-chip inline-flex h-11 min-w-11 items-center justify-center border px-4 text-sm font-medium',
                      opt.value === range
                        ? 'border-brand bg-brand-subtle text-brand-readable'
                        : 'border-border bg-surface text-text-muted',
                    )}
                  >
                    {opt.label}
                  </Link>
                ))}
              </div>
              <NetWorthAreaChart
                points={history.map((h) => ({ date: h.date, netWorth: h.netWorth }))}
                coverageChangeDates={coverageChangeDates}
              />
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-text text-sm font-semibold">Komposisi</h2>
              <CompositionBar items={assetItems} colorFor={assetColorFor} emptyLabel="Belum ada aset yang dibagikan." />
            </section>

            {liabilityItems.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-text text-sm font-semibold">Liabilitas</h2>
                <CompositionBar items={liabilityItems} colorFor={liabilityColorFor} emptyLabel="Tidak ada liabilitas." />
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
