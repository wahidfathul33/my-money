import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { getBlockingHouseholdForDeletion } from '@/features/settings/queries';
import { ExportDataButton } from '@/features/settings/components/export-data-button';
import { DeleteAccountSection } from '@/features/settings/components/delete-account-section';
import { OwnerBlockedDeletionCard } from '@/features/settings/components/owner-blocked-deletion-card';

/**
 * `/settings/data` — docs/09-screen-specs.md §18: "Data (ekspor CSV, hapus
 * akun)". The owner-block is checked HERE, server-side, before the delete
 * button is ever rendered — docs/12-security-and-auth.md §11's "layarnya
 * menyebutkan household mana yang menghalangi" describes a SCREEN, not just
 * a dialog error a caller discovers after clicking. `deleteAccountAction`
 * re-checks the same predicate server-side regardless (membership can
 * change between page load and submit).
 */
export default async function DataSettingsPage() {
  const user = await requireUser();
  const blockingHousehold = await getBlockingHouseholdForDeletion(user.id);

  return (
    <>
      <PageHeader title="Data" />
      <div className="px-page-x flex flex-col gap-6 pb-8">
        <section className="flex flex-col gap-2">
          <h2 className="text-text text-sm font-semibold">Ekspor</h2>
          <div className="bg-surface rounded-card p-4">
            <ExportDataButton />
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-text text-sm font-semibold">Hapus akun</h2>
          {blockingHousehold ? (
            <OwnerBlockedDeletionCard householdId={blockingHousehold.id} householdName={blockingHousehold.name} />
          ) : (
            <DeleteAccountSection email={user.email} />
          )}
        </section>
      </div>
    </>
  );
}
