'use server';

import { z } from 'zod';
import { signIn } from '@/lib/auth';
import { assertLoginRateLimitOk, RateLimitedError } from '@/lib/auth/rate-limit';

export interface SignInFormState {
  error: string | null;
  /** Set once a magic-link email has actually been sent, for the "check your inbox" state. */
  sentTo: string | null;
}

const emailSchema = z.string().trim().email('Masukkan alamat email yang valid');

export async function signInWithGoogleAction(
  _prevState: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  try {
    await assertLoginRateLimitOk();
  } catch (error) {
    if (error instanceof RateLimitedError) return { error: error.message, sentTo: null };
    throw error;
  }

  const callbackUrl = (formData.get('callbackUrl') as string) || '/';
  await signIn('google', { redirectTo: callbackUrl });
  return { error: null, sentTo: null }; // unreachable — signIn() redirects
}

export async function signInWithEmailAction(
  _prevState: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Email tidak valid', sentTo: null };
  }

  try {
    await assertLoginRateLimitOk();
  } catch (error) {
    if (error instanceof RateLimitedError) return { error: error.message, sentTo: null };
    throw error;
  }

  const callbackUrl = (formData.get('callbackUrl') as string) || '/';
  // redirect: false — we show a "check your inbox" state on this same page
  // instead of Auth.js's default unstyled /api/auth/verify-request page.
  await signIn('nodemailer', { email: parsed.data, redirectTo: callbackUrl, redirect: false });

  return { error: null, sentTo: parsed.data };
}
