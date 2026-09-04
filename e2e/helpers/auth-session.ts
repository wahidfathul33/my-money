import type { BrowserContext } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '../../src/lib/db/write';
import { sessions, users } from '../../src/lib/db/schema/users';
import { seedNewUser } from '../../src/lib/db/seed';

/**
 * Shared e2e auth helpers — extracted from tasks/04-authentication's
 * e2e/auth.spec.ts so every other e2e suite that needs an authenticated
 * session (app-shell, responsive, error-boundaries, scroll-performance —
 * all of which navigate to now-guarded routes) doesn't duplicate it.
 *
 * WHY NOT A REAL GOOGLE LOGIN: see e2e/auth.spec.ts's file header. In
 * short — a `sessions` row is inserted directly (the same table/shape the
 * Google and magic-link callbacks write to), and the matching
 * `__Secure-`-prefixed cookie is set in the browser. Everything downstream
 * of that exercises real app code.
 */

export const SESSION_COOKIE_NAME = '__Secure-authjs.session-token';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function seedSessionUser(opts: {
  onboarded: boolean;
  /** Defaults to a fresh unique `@example.invalid` address. Override for
   * tests that need a KNOWN email — e.g. tasks/11-household-membership's
   * two-context invite/accept flow, where the accepting user's email must
   * exactly match a `household_invitations.email` row for
   * `acceptInvitation` to match it at all. */
  email?: string;
  /** `undefined` (default) leaves the column NULL — matching every other
   * caller's existing behavior. Pass `new Date()` for tests that need a
   * VERIFIED email (invitation acceptance requires one; docs/12 §5 H3). */
  emailVerified?: Date;
  /** Defaults to the generic `'E2E User'` every other caller already
   * relies on. Override when a test needs to tell two seeded users apart
   * in the rendered UI (e.g. an owner-action button labeled by name) —
   * two default-named users in the same household would be ambiguous to
   * assert against. */
  name?: string;
}) {
  const userId = uuidv7();
  const email = opts.email ?? `e2e-${userId}@example.invalid`;
  await dbWrite.insert(users).values({
    id: userId,
    email,
    name: opts.name ?? 'E2E User',
    emailVerified: opts.emailVerified,
  });
  await dbWrite.transaction(async (tx) => {
    await seedNewUser(tx, userId);
  });
  if (opts.onboarded) {
    await dbWrite.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, userId));
  }

  const sessionToken = uuidv7();
  await dbWrite.insert(sessions).values({
    sessionToken,
    userId,
    expires: new Date(Date.now() + THIRTY_DAYS_MS),
  });

  return { userId, sessionToken, email };
}

/**
 * `context.addCookies({ url: baseURL, secure: true, ... })` fails with a
 * hard CDP protocol error ("Invalid cookie fields") when the url's scheme
 * is http — Chrome's "treat http://localhost as a secure context" allowance
 * isn't honored by CDP's `Storage.setCookies` when a `url` is supplied.
 * Passing `domain`/`path` instead of `url` avoids the scheme check and
 * stores it as a real `Secure`, `__Secure-`-prefixed cookie against
 * `localhost`.
 */
export async function setSessionCookie(context: BrowserContext, sessionToken: string): Promise<void> {
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
}

export async function sessionExists(sessionToken: string): Promise<boolean> {
  const [row] = await dbWrite
    .select({ sessionToken: sessions.sessionToken })
    .from(sessions)
    .where(eq(sessions.sessionToken, sessionToken));
  return Boolean(row);
}
