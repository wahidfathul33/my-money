'use client';

/**
 * `count_receivables_as_asset` toggle (ADR-010) — todo.md: "Toggle 'Hitung
 * piutang sebagai aset' di settings". Frictionless in BOTH directions, no
 * confirmation dialog either way — unlike `ShareWealthToggle` (which needs
 * one turning ON because it grants OTHER PEOPLE new visibility), this
 * setting only ever changes how the CALLER'S OWN net worth number is
 * computed for themselves. Same optimistic-update shape as
 * src/features/sharing/components/exclusion-toggle.tsx.
 *
 * `updatePreferencesAction` (tasks/22-settings-sharing-pwa) takes the WHOLE
 * preferences object, not a single field — this component sends the
 * CURRENT `timezone`/`defaultWalletId` back unchanged alongside the one
 * field it actually owns, same "send the full current state, override one
 * field" shape `TimezoneSelect`/`DefaultWalletSelect` use for theirs.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { updatePreferencesAction } from '../actions';
import type { UserPreferences } from '../queries';

interface CountReceivablesToggleProps {
  preferences: UserPreferences;
}

export function CountReceivablesToggle({ preferences }: CountReceivablesToggleProps) {
  const router = useRouter();
  const [value, setValue] = useState(preferences.countReceivablesAsAsset);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleChange(next: boolean) {
    setValue(next); // optimistic — no confirmation, no loading flicker
    setError(null);
    startTransition(async () => {
      const result = await updatePreferencesAction({
        countReceivablesAsAsset: next,
        timezone: preferences.timezone,
        defaultWalletId: preferences.defaultWalletId,
      });
      if (result.error) {
        setValue(!next); // roll back
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-text text-sm font-medium">Hitung piutang sebagai aset</span>
          <span className="text-text-muted text-xs">
            Default tidak dihitung — piutang personal punya risiko gagal bayar yang tinggi, dan
            kekayaan bersih sebaiknya konservatif.
          </span>
        </div>
        <Switch label="Hitung piutang sebagai aset" checked={value} onCheckedChange={handleChange} />
      </div>
      {error && (
        <p role="alert" className="text-negative text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
