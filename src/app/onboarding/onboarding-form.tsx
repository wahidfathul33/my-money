'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { completeOnboardingAction, type OnboardingFormState } from './actions';

const initialState: OnboardingFormState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? 'Menyimpan…' : 'Lanjutkan'}
    </button>
  );
}

export function OnboardingForm() {
  const [state, formAction] = useActionState(completeOnboardingAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="walletName" className="text-sm font-medium">
          Nama dompet
        </label>
        <input
          id="walletName"
          name="walletName"
          type="text"
          defaultValue="Tunai"
          required
          maxLength={60}
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="walletType" className="text-sm font-medium">
          Jenis dompet
        </label>
        <select
          id="walletType"
          name="walletType"
          defaultValue="cash"
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        >
          <option value="cash">Tunai</option>
          <option value="bank">Rekening bank</option>
          <option value="ewallet">E-Wallet</option>
        </select>
      </div>

      <div>
        <label htmlFor="openingBalance" className="text-sm font-medium">
          Saldo saat ini (Rp)
        </label>
        <input
          id="openingBalance"
          name="openingBalance"
          type="text"
          inputMode="numeric"
          defaultValue="0"
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
