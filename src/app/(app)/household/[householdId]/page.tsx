import { notFound } from 'next/navigation';
import Link from 'next/link';
import { BarChart3, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { currentLocalPeriod } from '@/lib/date/timezone';
import { getHouseholdWithRole } from '@/features/household/queries';
import { getHouseholdSummary } from '@/features/household/summary-queries';
import { hasAnyHouseholdTransaction } from '@/features/sharing/household-transactions-queries';
import { SetupSteps, type SetupStep } from '@/features/household/components/setup-steps';
import { HouseholdSummary } from '@/features/household/components/household-summary';

const SOLO_MEMBER_COUNT = 1;

function isValidPeriod(value: string | undefined): value is string {
  return value !== undefined && /^\d{4}-\d{2}$/.test(value);
}

/**
 * `/household/[id]` — the real household summary (docs/09-screen-specs.md
 * §12), replacing task 10's setup-steps-only placeholder. Doesn't re-verify
 * membership itself — the layout above this segment already 404s a
 * non-member before this page ever renders (see that file's own doc
 * comment).
 *
 * `<SetupSteps>` renders unconditionally above the summary and returns
 * `null` itself once all three steps are done (its own file header) — so a
 * brand-new household shows ONLY the step list (every summary section is
 * naturally empty at that point and stays hidden per its own rule), and an
 * established household shows ONLY the summary. No extra branching needed
 * here to implement docs §12's "kecuali pada household yang baru dibuat" —
 * it falls out of "each section hides itself when it has nothing to show"
 * plus the steps card being the one big visible thing in that empty state.
 */
export default async function HouseholdSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ householdId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { householdId } = await params;
  const { period: rawPeriod } = await searchParams;
  const user = await requireUser();

  const result = await getHouseholdWithRole(user.id, householdId);
  // Defense in depth only — layout.tsx already 404s a non-member before
  // this page ever renders.
  if (!result) notFound();

  const { household, memberCount, shareWealth } = result;
  const period = isValidPeriod(rawPeriod) ? rawPeriod : currentLocalPeriod(new Date(), household.timezone);

  const [anyTagged, summary] = await Promise.all([
    hasAnyHouseholdTransaction(householdId),
    getHouseholdSummary(householdId, period),
  ]);

  // "Buat keluarga" itself is rendered inside <SetupSteps> as an always-done
  // line, separate from this list — see that component's doc comment.
  // "Undang anggota" activated in task 11: done once at least one OTHER
  // active member has joined (memberCount counts the owner too, hence > 1).
  // "Tandai pengeluaran" & "Bagikan" activated in task 12 — docs/10-ux-states.md
  // §2.1 / todo.md. "Tandai" is done once ANY member has tagged a
  // transaction (not just this viewer) — it's a household-wide milestone,
  // not a personal one. "Bagikan" is done specifically when THIS viewer's
  // OWN `share_wealth` is on, since that's an inherently per-member choice
  // (docs/03 §5.1) — a household where only Wahid shares isn't "done" for Istri.
  const steps: SetupStep[] = [
    {
      key: 'invite',
      title: 'Undang anggota',
      description: 'Ajak pasangan atau anggota keluarga lain bergabung.',
      done: memberCount > SOLO_MEMBER_COUNT,
      href: `/household/${householdId}/members`,
      cta: 'Undang anggota',
    },
    {
      key: 'tag',
      title: 'Tandai pengeluaran keluarga',
      description: 'Aktifkan 🏠 saat mencatat, atau tandai transaksi yang sudah ada.',
      done: anyTagged,
      // docs/10-ux-states.md §2.1's exact mockup: CTA "[Pilih transaksi →]",
      // pointed at personal history where bulk-tagging actually happens
      // (src/features/transactions/components/transaction-list.tsx's
      // "Pilih" select mode) — NOT at the (necessarily still-empty, at
      // this exact moment) household expenses viewing page.
      href: '/transactions',
      cta: 'Pilih transaksi',
    },
    {
      key: 'share',
      title: 'Bagikan yang ingin dihitung',
      description: 'Pilih dompet atau aset yang masuk kekayaan keluarga.',
      done: shareWealth,
      href: '/settings/sharing',
      cta: 'Atur', // docs/10-ux-states.md §2.1's exact mockup: "[Atur →]".
    },
  ];

  return (
    <>
      <PageHeader title={household.name} />
      <div className="px-page-x flex flex-col gap-6 pb-8">
        <SetupSteps householdName={household.name} steps={steps} />
        <HouseholdSummary householdId={householdId} period={period} data={summary} />

        {/* tautan ke rincian — tasks/21-reports/todo.md: "Bagian household
            di /household/[id] (tautan ke rincian)". Selalu tampil (bahkan
            sebelum ada transaksi bertag) — halaman rincian sendiri yang
            menampilkan empty state kalau datanya belum cukup. */}
        <Link
          href={`/household/${householdId}/reports`}
          className="pressable-tint bg-surface border-border rounded-card flex items-center justify-between gap-3 border p-4"
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="text-text-muted size-5" aria-hidden="true" />
            <span className="text-text text-sm font-medium">Laporan Keluarga</span>
          </div>
          <ChevronRight className="text-text-subtle size-4 shrink-0" aria-hidden="true" />
        </Link>
      </div>
    </>
  );
}
