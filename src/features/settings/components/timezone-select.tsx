'use client';

/**
 * Timezone preference — tasks/22-settings-sharing-pwa. Changing this
 * changes every timezone-aware date grouping in the app (transaction
 * history day-grouping, budget/obligation periods, net worth trend cutoffs)
 * since they all read this same `users.timezone` column
 * (src/lib/date/timezone.ts's helpers). Curated to the three IANA zones
 * that correspond to Indonesian time — `updatePreferencesAction` itself
 * accepts any valid IANA name (src/features/settings/schema.ts), same as
 * the household create/settings form's own timezone picker.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { TIMEZONE_OPTIONS } from '@/lib/date/timezone-options';
import { updatePreferencesAction } from '../actions';
import type { UserPreferences } from '../queries';

interface TimezoneSelectProps {
  preferences: UserPreferences;
}

export function TimezoneSelect({ preferences }: TimezoneSelectProps) {
  const router = useRouter();
  const [value, setValue] = useState(preferences.timezone);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleChange(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await updatePreferencesAction({
        countReceivablesAsAsset: preferences.countReceivablesAsAsset,
        timezone: next,
        defaultWalletId: preferences.defaultWalletId,
      });
      if (result.error) {
        setValue(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Select label="Zona waktu" options={TIMEZONE_OPTIONS} value={value} onValueChange={handleChange} />
      <p className="text-text-muted text-xs">
        Menentukan pengelompokan tanggal transaksi, anggaran, dan laporan.
      </p>
      {error && (
        <p role="alert" className="text-negative text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
