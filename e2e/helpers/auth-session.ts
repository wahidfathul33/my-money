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

export async function seedSessionUser(opts: { onboarded: boolean }) {
  const userId = uuidv7();
  await dbWrite.insert(users).values({
    id: userId,
    email: `e2e-${userId}@example.invalid`,
    name: 'E2E User',
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

  return { userId, sessionToken };
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
