'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/require-user';
import { completeOnboarding } from '@/lib/services/onboarding';
import { fromRupiah } from '@/lib/finance/money';

const onboardingSchema = z.object({
  walletName: z.string().trim().min(1, 'Nama dompet wajib diisi').max(60, 'Nama dompet terlalu panjang'),
  walletType: z.enum(['cash', 'bank', 'ewallet'], { message: 'Jenis dompet tidak valid' }),
  openingBalance: z.string().trim(),
});

export interface OnboardingFormState {
  error: string | null;
}

export async function completeOnboardingAction(
  _prevState: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  // requireUser() first, per docs/12-security-and-auth.md §3 — never rely on
  // proxy.ts alone; it doesn't protect Server Actions.
  const user = await requireUser();

  const parsed = onboardingSchema.safeParse({
    walletName: formData.get('walletName'),
    walletType: formData.get('walletType'),
    openingBalance: (formData.get('openingBalance') as string | null) || '0',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  let openingBalance: bigint;
  try {
    openingBalance = fromRupiah(parsed.data.openingBalance);
  } catch {
    return { error: 'Saldo awal tidak valid' };
  }
  if (openingBalance < 0n) {
    return { error: 'Saldo awal tidak boleh negatif' };
  }

  await completeOnboarding(user.id, {
    walletName: parsed.data.walletName,
    walletType: parsed.data.walletType,
    openingBalance,
  });

  redirect('/');
}
