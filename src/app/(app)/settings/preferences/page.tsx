import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { getUserPreferences } from '@/features/settings/queries';
import { CountReceivablesToggle } from '@/features/settings/components/count-receivables-toggle';

/**
 * `/settings/preferences` — task 18's ONE preference
 * (`count_receivables_as_asset`, ADR-010). docs/06-api-contracts.md §5
 * lists `updatePreferencesAction` under a broader Settings catalog; this
 * page is deliberately minimal (a single toggle) rather than a full
 * preferences screen, since nothing else has a preference to show yet — a
 * future settings task extends this page alongside `UpdatePreferencesInput`
 * (src/lib/services/settings.ts).
 */
export default async function PreferencesSettingsPage() {
  const user = await requireUser();
  const preferences = await getUserPreferences(user.id);

  return (
    <>
      <PageHeader title="Preferensi" />
      <div className="px-page-x flex flex-col gap-6 pb-8">
        <div className="bg-surface rounded-card p-4">
          <CountReceivablesToggle countReceivablesAsAsset={preferences.countReceivablesAsAsset} />
        </div>
      </div>
    </>
  );
}
