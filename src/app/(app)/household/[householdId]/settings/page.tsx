import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { getHouseholdWithRole } from '@/features/household/queries';
import { HouseholdSettingsForm } from '@/features/household/components/household-settings-form';

/**
 * `/household/[id]/settings` — rename, timezone, archive. Owner-only edits
 * (docs/03 §4.2); a `member` sees a read-only view (enforced again, for
 * real, by `updateHousehold`/`archiveHousehold` inside
 * src/lib/services/households.ts — this page hiding the form is UX, not the
 * security boundary).
 */
export default async function HouseholdSettingsPage({
  params,
}: {
  params: Promise<{ householdId: string }>;
}) {
  const { householdId } = await params;
  const user = await requireUser();

  const result = await getHouseholdWithRole(user.id, householdId);
  if (!result) notFound(); // Defense in depth — layout.tsx already guards this segment.

  const { household, role, memberCount } = result;

  return (
    <>
      <PageHeader title="Pengaturan Keluarga" />
      <div className="px-page-x pb-8">
        <HouseholdSettingsForm
          householdId={household.id}
          name={household.name}
          timezone={household.timezone}
          isOwner={role === 'owner'}
          memberCount={memberCount}
        />
      </div>
    </>
  );
}
