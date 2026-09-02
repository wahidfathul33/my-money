/**
 * Layer 2 authorization — docs/12-security-and-auth.md §3.
 *
 * The first line of every Server Action and route handler, no exceptions.
 * `proxy.ts` (Layer 1) protects pages, but Server Actions are POSTs to
 * whatever route they're called from — a `proxy.ts` matcher change that
 * excludes a path silently removes its protection too. `requireUser()`
 * doesn't depend on which routes proxy.ts happens to cover.
 */
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { dbRead } from '@/lib/db/read';
import { users } from '@/lib/db/schema';
import { UnauthenticatedError } from '@/lib/api/errors';

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

/** Returns the current user or throws `UnauthenticatedError`. Never returns null. */
export async function requireUser(): Promise<CurrentUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthenticatedError();
  }

  return {
    id: session.user.id,
    email: session.user.email ?? '',
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  };
}

export interface CurrentUserRecord extends CurrentUser {
  onboardedAt: Date | null;
  defaultWalletId: string | null;
}

/**
 * `requireUser()` plus the onboarding fields the app shell
 * (src/app/(app)/layout.tsx) and /onboarding need. A direct `dbRead` lookup
 * by `users.id` — not `ownedBy`, which scopes rows OWNED BY a user
 * (`table.userId = ...`); the `users` row's own primary key already is the
 * user's identity.
 */
export async function requireUserRecord(): Promise<CurrentUserRecord> {
  const user = await requireUser();
  const [record] = await dbRead
    .select({ onboardedAt: users.onboardedAt, defaultWalletId: users.defaultWalletId })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return {
    ...user,
    onboardedAt: record?.onboardedAt ?? null,
    defaultWalletId: record?.defaultWalletId ?? null,
  };
}
