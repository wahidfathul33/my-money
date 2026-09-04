import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { getHouseholdWithRole } from '@/features/household/queries';
import { SetupSteps, type SetupStep } from '@/features/household/components/setup-steps';

const SOLO_MEMBER_COUNT = 1;

/**
 * `/household/[id]` — the household summary. Per tasks/10-household-core
 * spec.md's "Catatan", this is mostly a setup-steps list for now: shared
 * expenses (task 12), budgets (14), savings (15), and net worth (19) all
 * land in later tasks. Doesn't re-verify membership — the layout above this
 * page already guarded the whole segment (see layout.tsx's doc comment).
 */
export default async function HouseholdSummaryPage({
  params,
}: {
  params: Promise<{ householdId: string }>;
}) {
  const { householdId } = await params;
  const user = await requireUser();

  const result = await getHouseholdWithRole(user.id, householdId);
  // Defense in depth only — layout.tsx already 404s a non-member before
  // this page ever renders.
  if (!result) notFound();

  const { household, memberCount } = result;

  // "Buat keluarga" itself is rendered inside <SetupSteps> as an always-done
  // line, separate from this list — see that component's doc comment.
  // "Undang anggota" activates as of task 11: done once at least one OTHER
  // active member has joined (memberCount counts the owner too, hence > 1).
  // "Tandai pengeluaran" & "Bagikan" stay locked until task 12 —
  // docs/10-ux-states.md §2.1 / todo.md.
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
      done: false,
    },
    {
      key: 'share',
      title: 'Bagikan yang ingin dihitung',
      description: 'Pilih dompet atau aset yang masuk kekayaan keluarga.',
      done: false,
    },
  ];

  return (
    <>
      <PageHeader title={household.name} />
      <div className="px-page-x flex flex-col gap-6 pb-8">
        <SetupSteps householdName={household.name} steps={steps} />
      </div>
    </>
  );
}
