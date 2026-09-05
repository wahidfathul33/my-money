'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { WALLET_TYPE_META, type WalletType } from '@/features/wallets/wallet-type-meta';
import { completeOnboardingAction, type OnboardingFormState } from './actions';

const initialState: OnboardingFormState = { error: null };

// Hanya tiga jenis pertama — `credit_card` bukan pilihan wajar untuk dompet
// awal (liabilitas, saldo tidak boleh positif). Skema di actions.ts membatasi
// hal yang sama lewat `z.enum(['cash', 'bank', 'ewallet'])`.
const ONBOARDING_WALLET_TYPES = ['cash', 'bank', 'ewallet'] as const satisfies readonly WalletType[];
const WALLET_TYPE_OPTIONS = ONBOARDING_WALLET_TYPES.map((type) => ({
  value: type,
  label: WALLET_TYPE_META[type].label,
}));

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="mt-2 w-full">
      Lanjutkan
    </Button>
  );
}

export function OnboardingForm() {
  const [state, formAction] = useActionState(completeOnboardingAction, initialState);
  const [walletType, setWalletType] = useState<WalletType>('cash');

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Input label="Nama dompet" name="walletName" defaultValue="Tunai" required maxLength={60} />

      <input type="hidden" name="walletType" value={walletType} />
      <Select
        label="Jenis dompet"
        options={WALLET_TYPE_OPTIONS}
        value={walletType}
        onValueChange={(value) => setWalletType(value as WalletType)}
      />

      <Input label="Saldo saat ini (Rp)" name="openingBalance" type="money" defaultValue="0" />

      {state.error ? (
        <p role="alert" className="text-negative text-sm">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
