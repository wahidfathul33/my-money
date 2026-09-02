'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signInWithEmailAction, signInWithGoogleAction, type SignInFormState } from './actions';

const initialState: SignInFormState = { error: null, sentTo: null };

function SubmitButton({
  label,
  pendingLabel,
  variant = 'primary',
}: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  const base = 'w-full rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-60';
  const styles =
    variant === 'primary' ? `${base} bg-zinc-900 text-white` : `${base} border border-zinc-300 text-zinc-900`;
  return (
    <button type="submit" disabled={pending} className={styles}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function SignInForm({ callbackUrl }: { callbackUrl: string }) {
  const [googleState, googleAction] = useActionState(signInWithGoogleAction, initialState);
  const [emailState, emailAction] = useActionState(signInWithEmailAction, initialState);

  return (
    <div className="mt-8 space-y-6">
      <form action={googleAction}>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <SubmitButton label="Masuk dengan Google" pendingLabel="Mengalihkan…" />
        {googleState.error ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {googleState.error}
          </p>
        ) : null}
      </form>

      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <div className="h-px flex-1 bg-zinc-200" />
        atau
        <div className="h-px flex-1 bg-zinc-200" />
      </div>

      {emailState.sentTo ? (
        <p className="text-sm text-zinc-600">
          Tautan masuk telah dikirim ke <strong>{emailState.sentTo}</strong>. Periksa kotak masuk Anda.
        </p>
      ) : (
        // noValidate: Zod (src/app/(auth)/signin/actions.ts) is the
        // authoritative check, per docs/12-security-and-auth.md §6 ("Zod di
        // batas") — browser-native constraint validation would otherwise
        // silently short-circuit the submit on some inputs and never call
        // the server at all, giving a stock browser tooltip instead of this
        // form's own styled, consistent error message.
        <form action={emailAction} className="space-y-3" noValidate>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <div>
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="nama@email.com"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <SubmitButton label="Kirim tautan masuk" pendingLabel="Mengirim…" variant="secondary" />
          {emailState.error ? (
            <p role="alert" className="text-sm text-red-600">
              {emailState.error}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
