import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth/require-user';
import { requireHouseholdAccess } from '@/lib/services/households';
import { NotFoundError } from '@/lib/api/errors';
import { HouseholdNav } from '@/features/household/components/household-nav';

/**
 * `requireHouseholdAccess` throws `NotFoundError` for a non-member (see its
 * doc comment in src/lib/services/households.ts) — caught here and turned
 * into `notFound()` so a guessed UUID and an actually-nonexistent household
 * are indistinguishable to the caller, same as
 * src/app/(app)/wallets/[id]/page.tsx's `if (!wallet) notFound()`.
 */
async function requireHouseholdOrNotFound(userId: string, householdId: string) {
  try {
    return await requireHouseholdAccess(userId, householdId);
  } catch (err) {
    if (err instanceof NotFoundError) {
      notFound();
    }
    throw err;
  }
}

/**
 * Guards `/household/[id]` and everything nested under it —
 * tasks/10-household-core/spec.md acceptance: "`/household/[id]/layout.tsx`
 * memanggil guard; non-anggota menerima 404, bukan 403." Every page added
 * under this segment (task 11's Anggota, task 12's Pengeluaran, …) is
 * protected automatically by virtue of rendering inside this layout — no
 * page needs its own membership check.
 */
export default async function HouseholdLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ householdId: string }>;
}) {
  const { householdId } = await params;
  const user = await requireUser();
  const { household } = await requireHouseholdOrNotFound(user.id, householdId);

  return (
    <>
      <HouseholdNav householdId={householdId} name={household.name} />
      {children}
    </>
  );
}
