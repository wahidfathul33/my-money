import { test as base, expect } from '@playwright/test';
import { deleteTestUser } from '../../src/lib/db/__tests__/test-helpers';
import { seedSessionUser, setSessionCookie } from '../helpers/auth-session';

/**
 * Drop-in replacement for `@playwright/test`'s `test` — every test in a
 * spec file that imports `test` from here runs with a real, onboarded,
 * authenticated session already in place (an `auto` fixture, so no test
 * needs to opt in). Needed because src/proxy.ts + src/app/(app)/layout.tsx
 * (task 04) now guard every route these suites navigate to (task 02's
 * app-shell, responsive, error-boundary, and scroll-performance specs were
 * written before the auth guard existed).
 *
 * Tests that specifically need to exercise the UNauthenticated path (the
 * signin redirect itself) should keep importing straight from
 * `@playwright/test` instead — see e2e/auth.spec.ts.
 */
export const test = base.extend<{ authedUserId: string }>({
  authedUserId: [
    async ({ context }, use) => {
      const { userId, sessionToken } = await seedSessionUser({ onboarded: true });
      await setSessionCookie(context, sessionToken);
      await use(userId);
      await deleteTestUser(userId);
    },
    { auto: true },
  ],
});

export { expect };
