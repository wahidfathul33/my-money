import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { MoneyText } from '@/components/finance/money-text';
import { dbRead } from '@/lib/db/read';
import { wallets } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/require-user';
import { signOutAction } from '@/lib/auth/actions';
import { ownedBy } from '@/lib/db/scoped';

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
 */
export default async function DashboardPage() {
  const user = await requireUser();

  const myWallets = await dbRead
    .select({ id: wallets.id, name: wallets.name, type: wallets.type, balance: wallets.balance })
    .from(wallets)
    .where(ownedBy(wallets, user.id))
    .orderBy(wallets.sortOrder);

  const total = myWallets.reduce((sum, w) => sum + w.balance, 0n);

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

        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Keluar
          </Button>
        </form>
      </div>
    </>
  );
}
