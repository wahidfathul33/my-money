import { Lock } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { requireUser } from '@/lib/auth/require-user';
import { getSharingSummary } from '@/features/sharing/queries';
import { SharingSummaryCard } from '@/features/sharing/components/sharing-summary';
import { ExclusionList } from '@/features/sharing/components/exclusion-list';
import { StopSharingDialog } from '@/features/sharing/components/stop-sharing-dialog';

/**
 * `/settings/sharing` — "Apa yang Saya Bagikan" (docs/09-screen-specs.md
 * §17). One screen answers "data saya yang mana yang bisa dilihat orang
 * lain?" because there are only ever two mechanisms to report on
 * (docs/03-domain-model.md §5) — no per-object grant list to page through.
 *
 * **No "share everything" button anywhere on this page or its
 * components** — spec.md is explicit that the asymmetry (revoking is
 * frictionless, granting is deliberate) is deliberate product policy, not
 * an oversight to "complete" later.
 */
export default async function SharingSettingsPage() {
  const user = await requireUser();
  const summary = await getSharingSummary(user.id);
  const sharingCount = summary.households.filter((h) => h.shareWealth).length;

  return (
    <>
      <PageHeader title="Yang Saya Bagikan" />
      <div className="px-page-x flex flex-col gap-6 pb-8">
        {summary.households.length === 0 ? (
          <EmptyState
            icon={Lock}
            title="Semua data Anda privat"
            description="Anda belum tergabung di keluarga mana pun. Bergabung ke keluarga tidak membagikan apa pun secara otomatis."
          />
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {summary.households.map((household) => (
                <SharingSummaryCard key={household.householdId} household={household} />
              ))}
            </div>

            <ExclusionList exclusions={summary.exclusions} />

            <StopSharingDialog sharingCount={sharingCount} />
          </>
        )}
      </div>
    </>
  );
}
