import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import type { ReactNode } from 'react';
import { auth } from '@/lib/auth';
import { dbRead } from '@/lib/db/read';
import { users } from '@/lib/db/schema';
import { AppShell } from '@/components/layout/app-shell';
import { getAddTransactionSheetData } from '@/features/transactions/sheet-data';

/**
 * Session guard for every route under `(app)` — docs/12-security-and-auth.md
 * §3 "Lapisan 1" is `src/proxy.ts`; this is defense in depth at the layout
 * level, per tasks/04-authentication/todo.md "Guard Sesi". Calls `auth()`
 * directly (not `requireUser()`, which throws) because a layout's job here
 * is to redirect cleanly, not surface an error boundary. Wraps children in
 * task 02's `<AppShell>` (nav chrome) once the guard passes.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/signin');
  }

  const [record] = await dbRead
    .select({ onboardedAt: users.onboardedAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!record?.onboardedAt) {
    redirect('/onboarding');
  }

  // Fetched once per layout render (wallets + both types' quick/full
  // category lists) so the FAB / "+ Tambah" sheet opens with everything
  // already in hand — no loading state between the tap and a usable keypad
  // (tasks/07-transactions-core/spec.md "Tidak ada tap tambahan").
  const addTransactionSheetData = await getAddTransactionSheetData(session.user.id);

  return <AppShell addTransactionSheetData={addTransactionSheetData}>{children}</AppShell>;
}
