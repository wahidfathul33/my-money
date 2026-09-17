import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { getUserPreferences, listWalletOptions } from '@/features/settings/queries';
import { CountReceivablesToggle } from '@/features/settings/components/count-receivables-toggle';
import { TimezoneSelect } from '@/features/settings/components/timezone-select';
import { DefaultWalletSelect } from '@/features/settings/components/default-wallet-select';

/**
 * `/settings/preferences` — docs/09-screen-specs.md §18: "Preferensi (zona
 * waktu, dompet default, piutang sebagai aset)". Started as task 18's single
 * toggle; tasks/22-settings-sharing-pwa adds the other two columns
 * `users` always had a place for (`timezone`, `default_wallet_id`) but no UI
 * ever wrote to before now.
 */
export default async function PreferencesSettingsPage() {
  const user = await requireUser();
  const [preferences, wallets] = await Promise.all([
    getUserPreferences(user.id),
    listWalletOptions(user.id),
  ]);

  return (
    <>
      <PageHeader title="Preferensi" />
      <div className="px-page-x flex flex-col gap-4 pb-8">
        <div className="bg-surface rounded-card flex flex-col gap-5 p-4">
          <TimezoneSelect preferences={preferences} />
          <DefaultWalletSelect preferences={preferences} wallets={wallets} />
        </div>
        <div className="bg-surface rounded-card p-4">
          <CountReceivablesToggle preferences={preferences} />
        </div>
      </div>
    </>
  );
}
