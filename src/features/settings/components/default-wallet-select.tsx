'use client';

/**
 * Default-wallet preference — tasks/22-settings-sharing-pwa. Pre-selects
 * this wallet when opening the add-transaction sheet
 * (src/features/transactions/sheet-data.ts already reads
 * `users.default_wallet_id`; this is the first UI that ever WRITES it). A
 * sentinel `'none'` option maps to `null` — Radix `Select.Item` rejects an
 * empty-string `value`.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { updatePreferencesAction } from '../actions';
import type { UserPreferences, WalletOption } from '../queries';

const NONE = 'none';

interface DefaultWalletSelectProps {
  preferences: UserPreferences;
  wallets: WalletOption[];
}

export function DefaultWalletSelect({ preferences, wallets }: DefaultWalletSelectProps) {
  const router = useRouter();
  const [value, setValue] = useState(preferences.defaultWalletId ?? NONE);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const options = [{ value: NONE, label: 'Tidak ada' }, ...wallets.map((w) => ({ value: w.id, label: w.name }))];

  function handleChange(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await updatePreferencesAction({
        countReceivablesAsAsset: preferences.countReceivablesAsAsset,
        timezone: preferences.timezone,
        defaultWalletId: next === NONE ? null : next,
      });
      if (result.error) {
        setValue(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (wallets.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <Select label="Dompet default" options={options} value={value} onValueChange={handleChange} />
      <p className="text-text-muted text-xs">Dipilih otomatis saat membuka form tambah transaksi.</p>
      {error && (
        <p role="alert" className="text-negative text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
