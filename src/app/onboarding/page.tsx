import { redirect } from 'next/navigation';
import { requireUserRecord } from '@/lib/auth/require-user';
import { OnboardingForm } from './onboarding-form';

/**
 * Onboarding — tasks/04-authentication/spec.md: new user → create first
 * wallet → dashboard. Step 1 (this page) is the only mandatory step; the
 * canonical categories and a starter "Tunai" wallet already exist (seeded
 * atomically on first login — src/lib/db/seed.ts), so this form turns that
 * starter wallet into the user's real first wallet rather than building a
 * second, separate "create wallet" flow — see
 * src/lib/services/onboarding.ts for the reasoning. Steps 2/3 mentioned as
 * optional in tasks/04-authentication/todo.md (budget setup, invite
 * household) aren't implemented here — they belong to those later tasks'
 * scope, and the acceptance criteria only require step 1 + landing on a
 * functional dashboard.
 */
export default async function OnboardingPage() {
  const user = await requireUserRecord();
  if (user.onboardedAt) {
    redirect('/');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <h1 className="text-xl font-semibold">Selamat datang di MyMoney</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Kategori bawaan sudah disiapkan. Sebelum mulai mencatat, atur dompet pertama Anda.
      </p>
      <OnboardingForm />
    </main>
  );
}
