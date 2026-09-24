import { cookies } from 'next/headers';
import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { THEME_COOKIE, parseTheme } from '@/lib/theme';
import { getUserPreferences, listWalletOptions } from '@/features/settings/queries';
import { CountReceivablesToggle } from '@/features/settings/components/count-receivables-toggle';
import { TimezoneSelect } from '@/features/settings/components/timezone-select';
import { DefaultWalletSelect } from '@/features/settings/components/default-wallet-select';
import { ThemeSelect } from '@/features/settings/components/theme-select';

/**
 * `/settings/preferences` — docs/09-screen-specs.md §18: "Preferensi (zona
 * waktu, dompet default, piutang sebagai aset)". Started as task 18's single
 * toggle; tasks/22-settings-sharing-pwa adds the other two columns
 * `users` always had a place for (`timezone`, `default_wallet_id`) but no UI
 * ever wrote to before now.
 */
export default async function PreferencesSettingsPage() {
  const user = await requireUser();
  const [preferences, wallets, cookieStore] = await Promise.all([
    getUserPreferences(user.id),
    listWalletOptions(user.id),
    cookies(),
  ]);
  // Tema disimpan di cookie, bukan di `users` — src/lib/theme.ts menjelaskan
  // kenapa. Dibaca di sini supaya nilai awal radio-nya benar sejak render
  // pertama, sama seperti `preferences` untuk kontrol lainnya.
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <>
      <PageHeader title="Preferensi" />
      <div className="px-page-x flex flex-col gap-4 pb-8">
        <div className="bg-surface rounded-card p-4">
          <ThemeSelect theme={theme} />
        </div>
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
