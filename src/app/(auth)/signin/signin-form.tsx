'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  return (
    <Button type="submit" variant={variant} loading={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function SignInForm({ callbackUrl }: { callbackUrl: string }) {
  const [googleState, googleAction] = useActionState(signInWithGoogleAction, initialState);
  const [emailState, emailAction] = useActionState(signInWithEmailAction, initialState);

  return (
    <div className="mt-8 flex flex-col gap-6">
      <form action={googleAction}>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <SubmitButton label="Masuk dengan Google" pendingLabel="Mengalihkan…" />
        {googleState.error ? (
          <p role="alert" className="text-negative mt-2 text-sm">
            {googleState.error}
          </p>
        ) : null}
      </form>

      <div className="text-text-subtle flex items-center gap-3 text-xs">
        <div className="bg-border h-px flex-1" />
        atau
        <div className="bg-border h-px flex-1" />
      </div>

      {emailState.sentTo ? (
        <p className="text-text-muted text-sm">
          Tautan masuk telah dikirim ke <strong className="text-text">{emailState.sentTo}</strong>. Periksa
          kotak masuk Anda.
        </p>
      ) : (
        // noValidate: Zod (src/app/(auth)/signin/actions.ts) is the
        // authoritative check, per docs/12-security-and-auth.md §6 ("Zod di
        // batas") — browser-native constraint validation would otherwise
        // silently short-circuit the submit on some inputs and never call
        // the server at all, giving a stock browser tooltip instead of this
        // form's own styled, consistent error message.
        <form action={emailAction} className="flex flex-col gap-3" noValidate>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <Input label="Email" name="email" type="text" inputMode="email" placeholder="nama@email.com" />
          <SubmitButton label="Kirim tautan masuk" pendingLabel="Mengirim…" variant="secondary" />
          {emailState.error ? (
            <p role="alert" className="text-negative text-sm">
              {emailState.error}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
