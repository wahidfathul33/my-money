import Link from 'next/link';
import { Receipt, Wallet as WalletIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { MoneyText } from '@/components/finance/money-text';
import { StatTile } from '@/components/finance/stat-tile';
import { NetWorthHero } from '@/components/finance/net-worth-hero';
import { requireUser } from '@/lib/auth/require-user';
import { toLocalHour } from '@/lib/date/timezone';
import { getUserTimezone } from '@/features/obligations/queries';
import { getDashboardConditionalData, getDashboardData } from '@/features/dashboard/queries';
import { greetingForHour } from '@/features/dashboard/greeting';
import { BudgetAttentionSection } from '@/features/dashboard/components/budget-attention-section';
import { NeedsAttentionSection } from '@/features/dashboard/components/needs-attention-section';
import { SavingsSection } from '@/features/dashboard/components/savings-section';
import { PendingTransferSection } from '@/features/dashboard/components/pending-transfer-section';
import { RecentTransactionsSection } from '@/features/dashboard/components/recent-transactions-section';

/**
 * `/` — the real dashboard (docs/09-screen-specs.md §1), replacing task 04's
 * disposable placeholder. Answers exactly one question fast: "apakah
 * kondisi saya baik-baik saja?" (spec.md) — hero net worth first, then
 * cash/month-flow tiles, then whatever conditional sections actually have
 * something to say, then a 5-item recent-transactions list. No section
 * beyond that list — every one considered was rejected as slowing the
 * answer down rather than helping it (spec.md's "Batasan").
 *
 * Data comes from exactly TWO calls, both internally parallel (never a
 * waterfall) — `getDashboardData` (the "main" combined fetch: wallet cash,
 * month aggregate, net worth + trend, 5 recent transactions) and
 * `getDashboardConditionalData` (budget attention, jatuh tempo, savings
 * goals, pending transfers) — fired together via the same `Promise.all`
 * here, per src/features/dashboard/queries.ts's own file header. The single
 * `getUserTimezone` lookup ahead of both mirrors the exact pattern
 * src/features/obligations/queries.ts's file header already documents for
 * "a single page load that calls several of these functions".
 *
 * Every section below is a plain Server Component; the only `'use client'`
 * boundaries reachable from this page are `<NetWorthHero>`'s own
 * `<Sparkline>` and the handful of already-shared domain components
 * (`BudgetBar`, `GoalCard`, `Avatar`) that were 'use client' before this
 * task and are reused rather than duplicated (AGENTS.md: "'use client'
 * hanya pada sparkline & interaksi").
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const tz = await getUserTimezone(user.id);

  const [dashboardData, conditional] = await Promise.all([
    getDashboardData(user.id, now, tz),
    getDashboardConditionalData(user.id, now, tz),
  ]);

  const displayName = user.name ?? user.email;
  const greeting = `${greetingForHour(toLocalHour(now, tz))}, ${displayName}`;

  const headerAction = (
    <Link href="/settings" aria-label="Pengaturan">
      <Avatar src={user.image ?? undefined} name={displayName} />
    </Link>
  );

  // spec.md empty state: no wallet at all -> nothing else on this screen
  // means anything (net worth, cash, month flow are all derived from
  // wallets), so this replaces the whole body rather than rendering a hero
  // full of zeroes.
  if (!dashboardData.hasAnyWallet) {
    return (
      <>
        <PageHeader title={greeting} action={headerAction} />
        <div className="px-page-x pb-8">
          <EmptyState
            icon={WalletIcon}
            title="Belum ada dompet"
            description="Buat dompet pertama untuk mulai mencatat keuangan Anda."
            action={
              <Button asChild>
                <Link href="/wallets">Buat Dompet</Link>
              </Button>
            }
          />
        </div>
      </>
    );
  }

  const showBudgetAttention = conditional.budgetsNeedingAttention.length > 0;
  const showNeedsAttention = conditional.upcomingObligations.length > 0;
  const showPendingTransfer = conditional.pendingTransferCount > 0;
  const showSavings = conditional.savingsGoals.length > 0;

  return (
    <>
      <PageHeader title={greeting} action={headerAction} />
      <div className="px-page-x flex flex-col gap-8 pb-8">
        <NetWorthHero netWorth={dashboardData.netWorth} history={dashboardData.netWorthTrend} />

        <div className="flex gap-3">
          <StatTile label="Kas" value={<MoneyText amount={dashboardData.cashTotal} tone="plain" size="lg" />} />
          <StatTile
            label="Bulan Ini"
            value={
              <span className="flex items-center gap-1.5">
                <MoneyText amount={dashboardData.monthlyIncome} showSign size="md" />
                <span className="text-text-muted text-sm">/</span>
                <MoneyText amount={-dashboardData.monthlyExpense} showSign size="md" />
              </span>
            }
          />
        </div>

        {showBudgetAttention && <BudgetAttentionSection budgets={conditional.budgetsNeedingAttention} />}
        {showNeedsAttention && <NeedsAttentionSection items={conditional.upcomingObligations} />}
        {showPendingTransfer && (
          <PendingTransferSection
            count={conditional.pendingTransferCount}
            preview={conditional.pendingTransferPreview}
          />
        )}
        {showSavings && <SavingsSection goals={conditional.savingsGoals} />}

        {dashboardData.hasAnyTransactionEver ? (
          <RecentTransactionsSection transactions={dashboardData.recentTransactions} />
        ) : (
          <EmptyState
            icon={Receipt}
            title="Belum ada transaksi"
            description="Catat transaksi pertama lewat tombol tambah di bawah."
          />
        )}
      </div>
    </>
  );
}
