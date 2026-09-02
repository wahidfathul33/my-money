import { dbRead } from '@/lib/db/read';
import { wallets } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/require-user';
import { signOutAction } from '@/lib/auth/actions';
import { ownedBy } from '@/lib/db/scoped';
import { formatIDR } from '@/lib/finance/money';

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
    // <div>, not <main> — this renders inside AppShell's own <main>
    // (src/components/layout/app-shell.tsx); a nested <main> is a duplicate
    // landmark (axe: landmark-no-duplicate-main) and broke task 02's
    // max-w-5xl content-width assertion, which targets the outer <main>.
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-lg font-semibold">Halo, {user.name ?? user.email}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Total saldo dompet</p>
      <p className="text-2xl font-bold">{formatIDR(total)}</p>

      <ul className="mt-6 space-y-2">
        {myWallets.map((w) => (
          <li key={w.id} className="flex justify-between rounded-lg border p-3 text-sm">
            <span>{w.name}</span>
            <span>{formatIDR(w.balance)}</span>
          </li>
        ))}
      </ul>

      <form action={signOutAction} className="mt-8">
        {/* text-muted-foreground, not text-zinc-500 — the latter is an
            unchecked raw Tailwind color and fails WCAG AA contrast in dark
            mode (4.06:1 vs the required 4.5:1); see src/test/tokens.ts for
            the tokens this design system actually verifies. */}
        <button type="submit" className="text-sm text-muted-foreground underline">
          Keluar
        </button>
      </form>
    </div>
  );
}
