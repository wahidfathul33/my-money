/**
 * `HouseholdSummary` — the real `/household/[id]` body (docs/09-screen-specs.md
 * §12), replacing task 10's minimal placeholder. Server Component: every
 * number here is already resolved by `getHouseholdSummary`
 * (src/features/household/summary-queries.ts); this file only lays it out.
 *
 * Section order matches §12's mockup exactly: period picker, Pengeluaran
 * Keluarga, Siapa Membayar Apa, Per Kategori, Anggaran Keluarga, Tabungan
 * Bersama, Kekayaan Keluarga, Anggota. Each section (other than the period
 * header and Anggota) is hidden entirely when it has nothing to show — same
 * "hide, don't half-render" discipline the personal dashboard uses,
 * per-section rather than blanket, since this screen's own acceptance
 * criteria list a full set of sections rather than the dashboard's
 * deliberately-minimal one.
 */
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MoneyText } from '@/components/finance/money-text';
import { CategoryIcon } from '@/features/categories/components/category-icon';
import { GoalCard } from '@/features/savings/components/goal-card';
import { toGoalListClientData } from '@/features/savings/client-types';
import { BudgetBar } from '@/features/budgets/components/budget-bar';
import { toHouseholdBudgetClientData } from '@/features/budgets/client-types';
import { MemberNetWorthRow } from '@/features/net-worth/components/member-net-worth-row';
import { HouseholdNetWorthTotal } from '@/features/net-worth/components/household-net-worth-total';
import type { Money } from '@/lib/finance/money';
import { shiftPeriod } from '@/lib/date/timezone';
import { MemberAvatar } from './member-avatar';
import { MemberBar } from './member-bar';
import type { HouseholdSummaryData } from '../summary-queries';

const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function formatPeriodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return MONTH_LABEL_FORMAT.format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)));
}

/** Compact "X,Y jt" abbreviation — duplicated from
 * src/features/net-worth/components/member-net-worth-row.tsx's own local
 * `formatShort` (same exact shape docs/09 §12's mockup contribution line
 * needs: "Wahid 5,0jt · Istri 3,0jt"), kept local per
 * docs/11-tech-architecture.md §3. */
function formatShort(amount: Money): string {
  const rupiah = amount / 100n;
  const negative = rupiah < 0n;
  const abs = negative ? -rupiah : rupiah;
  if (abs >= 1_000_000n) {
    const millions = Number(abs) / 1_000_000;
    return `${negative ? '−' : ''}${millions.toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  }
  if (abs >= 1_000n) {
    const thousands = Number(abs) / 1_000;
    return `${negative ? '−' : ''}${thousands.toLocaleString('id-ID', { maximumFractionDigits: 1 })} rb`;
  }
  return `${negative ? '−' : ''}${abs.toString()}`;
}

interface HouseholdSummaryProps {
  householdId: string;
  period: string;
  data: HouseholdSummaryData;
}

export function HouseholdSummary({ householdId, period, data }: HouseholdSummaryProps) {
  const remaining = data.periodIncome - data.periodExpense;
  const showExpenseSection = data.hasAnyTaggedTransactionEver;
  const showMemberBar = data.memberSpending.length > 0;
  const showCategories = data.categorySpending.length > 0;
  const showBudgets = data.budgetsNeedingAttention.length > 0;
  const showSavings = data.savingsGoals.length > 0;
  const showNetWorth = data.netWorth.byMember.length > 0;

  return (
    <div className="flex flex-col gap-8">
      {/* Only worth paging through when there's actually tagged history to
          page through — a brand-new household shows SetupSteps instead
          (page.tsx), and Anggaran/Tabungan/Kekayaan below aren't
          period-scoped anyway. */}
      {showExpenseSection && (
        <div
          className="rounded-card border-border bg-surface flex items-center justify-between border px-1"
          role="group"
          aria-label="Pilih periode"
        >
          <Link
            href={`/household/${householdId}?period=${shiftPeriod(period, -1)}`}
            aria-label="Bulan sebelumnya"
            className="pressable flex size-11 shrink-0 items-center justify-center"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>
          <span className="text-text flex-1 text-center text-sm font-medium">{formatPeriodLabel(period)}</span>
          <Link
            href={`/household/${householdId}?period=${shiftPeriod(period, 1)}`}
            aria-label="Bulan berikutnya"
            className="pressable flex size-11 shrink-0 items-center justify-center"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </Link>
        </div>
      )}

      {showExpenseSection && (
        <section className="bg-surface rounded-card flex flex-col gap-1 p-4">
          <span className="text-text-muted text-sm">Pengeluaran Keluarga</span>
          <MoneyText amount={data.periodExpense} tone="plain" size="display" />
          <span className="text-text-muted text-sm">
            Masuk <MoneyText amount={data.periodIncome} tone="plain" size="sm" /> · Sisa{' '}
            <MoneyText amount={remaining} tone="plain" size="sm" />
          </span>
        </section>
      )}

      {showMemberBar && (
        <section className="flex flex-col gap-3">
          <h2 className="text-text text-sm font-semibold">Siapa Membayar Apa</h2>
          <MemberBar items={data.memberSpending} />
        </section>
      )}

      {showCategories && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-text text-sm font-semibold">Per Kategori</h2>
            <Link href={`/household/${householdId}/transactions`} className="text-brand-readable text-sm font-medium">
              Lihat →
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {data.categorySpending.map((row) => (
              <div key={row.key} className="flex items-center gap-3">
                <CategoryIcon icon={row.icon} color={row.color} />
                <div className="min-w-0 flex-1">
                  <p className="text-text truncate text-sm font-medium">{row.name}</p>
                  {row.ownerName && <p className="text-text-muted truncate text-xs">{row.ownerName}</p>}
                </div>
                <MoneyText amount={row.total} tone="plain" size="sm" />
              </div>
            ))}
          </div>
        </section>
      )}

      {showBudgets && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-text text-sm font-semibold">Anggaran Keluarga</h2>
            <Link href={`/household/${householdId}/budgets`} className="text-brand-readable text-sm font-medium">
              Lihat →
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {data.budgetsNeedingAttention.map((budget) => {
              const clientData = toHouseholdBudgetClientData(budget);
              return (
                <BudgetBar
                  key={clientData.id}
                  icon={clientData.categoryIcon}
                  color={clientData.categoryColor}
                  label={clientData.categoryLabel}
                  amount={clientData.amount}
                  spent={clientData.spent}
                  status={clientData.status}
                  percent={clientData.percent}
                />
              );
            })}
          </div>
        </section>
      )}

      {showSavings && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-text text-sm font-semibold">Tabungan Bersama</h2>
            <Link href={`/household/${householdId}/savings`} className="text-brand-readable text-sm font-medium">
              Lihat →
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {data.savingsGoals.map((goal) => {
              const contribution = data.savingsContributions.find((c) => c.goalId === goal.id);
              return (
                <div key={goal.id} className="flex flex-col gap-1">
                  <GoalCard goal={toGoalListClientData(goal)} href={`/wealth/savings/${goal.id}`} showHouseholdBadge={false} />
                  {contribution && contribution.members.length > 0 && (
                    <p className="text-text-muted px-4 text-xs">
                      {contribution.members.map((m) => `${m.name ?? 'Anggota'} ${formatShort(m.total)}`).join(' · ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {showNetWorth && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-text text-sm font-semibold">Kekayaan Keluarga</h2>
            <Link href={`/household/${householdId}/net-worth`} className="text-brand-readable text-sm font-medium">
              Lihat →
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {data.netWorth.byMember.map((m) => (
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
          <HouseholdNetWorthTotal netWorth={data.netWorth.totals.netWorth} coverage={data.netWorth.coverage} />
        </section>
      )}

      {data.members.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-text text-sm font-semibold">Anggota ({data.members.length})</h2>
            <Link href={`/household/${householdId}/members`} className="text-brand-readable text-sm font-medium">
              Lihat →
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {data.members.map((m) => (
              <span key={m.userId} className="flex items-center gap-2">
                <MemberAvatar seed={m.userId} name={m.name ?? m.email} size={28} />
                <span className="text-text-muted text-sm">{m.name ?? m.email}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
