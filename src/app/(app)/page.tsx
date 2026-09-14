import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { MoneyText } from '@/components/finance/money-text';
import { dbRead } from '@/lib/db/read';
import { wallets } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/require-user';
import { signOutAction } from '@/lib/auth/actions';
import { ownedBy } from '@/lib/db/scoped';
import { deserializeMoney } from '@/lib/finance/money';
import { getUpcomingDue, getUserTimezone } from '@/features/obligations/queries';
import { toUpcomingClientData } from '@/features/obligations/client-types';

/**
 * Minimal placeholder dashboard — task 04's onboarding flow needs a real,
 * functional landing page to redirect to after "create first wallet"
 * (tasks/04-authentication/spec.md acceptance: "mendarat di dashboard
 * fungsional"). The full dashboard is a separate task's scope; this
 * demonstrates the `requireUser()` + `ownedBy()` pattern this task
 * establishes with a real, auth-scoped query rather than static markup.
 *
 * MERGE NOTE (task 02 — app-shell-navigation): if task 02 also adds
 * `src/app/(app)/page.tsx`, this content should be treated as disposable —
 * keep task 02's version and preserve only the `requireUser()` +
 * `ownedBy()` query pattern if useful.
 *
 * Task 18 (debts-receivables) adds the "Perlu Perhatian" section below,
 * self-contained per docs/09-screen-specs.md §1's own rule for this exact
 * card ("hanya bila ada yang jatuh tempo ≤7 hari / telat") — hidden
 * entirely when empty, never an empty-but-visible section.
 */
export default async function DashboardPage() {
  const user = await requireUser();

  const myWallets = await dbRead
    .select({ id: wallets.id, name: wallets.name, type: wallets.type, balance: wallets.balance })
    .from(wallets)
    .where(ownedBy(wallets, user.id))
    .orderBy(wallets.sortOrder);

  const total = myWallets.reduce((sum, w) => sum + w.balance, 0n);

  const tz = await getUserTimezone(user.id);
  const upcoming = (await getUpcomingDue(user.id, 7, new Date(), tz)).map(toUpcomingClientData);

  return (
    <>
      <PageHeader title={`Halo, ${user.name ?? user.email}`} />
      <div className="px-page-x flex flex-col gap-6 pb-8">
        <div className="flex flex-col gap-1">
          <p className="text-text-muted text-sm">Total saldo dompet</p>
          <MoneyText amount={total} tone="plain" size="display" />
        </div>

        <ul className="border-border divide-border rounded-card divide-y border">
          {myWallets.map((w) => (
            <li key={w.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-text text-sm font-medium">{w.name}</span>
              <MoneyText amount={w.balance} tone="plain" size="sm" />
            </li>
          ))}
        </ul>

        {upcoming.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-text text-sm font-medium">Perlu Perhatian</h2>
            <div className="flex flex-col gap-2">
              {upcoming.map((item) => (
                <Link
                  key={item.id}
                  href={`/wealth/debts?tab=${item.kind === 'debt' ? 'debts' : 'receivables'}`}
                  className="pressable-tint bg-surface rounded-card flex items-center gap-3 p-4"
                >
                  <span className="bg-negative-subtle text-negative flex size-10 shrink-0 items-center justify-center rounded-full">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-text truncate text-sm font-medium">{item.name}</span>
                    <span className={item.overdue ? 'text-negative text-xs font-medium' : 'text-text-muted text-xs'}>
                      {item.overdue ? 'Telat' : 'Jatuh tempo segera'}
                    </span>
                  </span>
                  <MoneyText amount={deserializeMoney(item.remainingAmount)} tone="plain" size="sm" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Keluar
          </Button>
        </form>
      </div>
    </>
  );
}
