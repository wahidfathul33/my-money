import { deleteTestUser } from '../src/lib/db/__tests__/test-helpers';
import { seedSessionUser, setSessionCookie, sessionExists } from './helpers/auth-session';
import { test, expect } from './fixtures/base';

/**
 * e2e/auth.spec.ts — login → onboarding → dashboard, logout revokes the
 * session, session persists on reload (tasks/04-authentication/todo.md
 * "Test" section).
 *
 * WHY NOT A REAL GOOGLE LOGIN: Google's OAuth consent screen actively
 * resists automation (it's designed to), and driving it from Playwright
 * with real credentials isn't something this environment can do safely or
 * reliably. What IS tested here, against the real running app and the real
 * database, is everything downstream of "a session cookie exists": the
 * exact mechanism Auth.js's database strategy relies on regardless of which
 * provider produced the session — a `sessions` row is inserted directly
 * (the same table/shape the Google and magic-link callbacks write to), the
 * matching `__Secure-` prefixed cookie is set in the browser, and from
 * there every assertion (onboarding gate, dashboard render, reload
 * persistence, logout revocation) exercises real app code:
 * src/proxy.ts → src/app/(app)/layout.tsx → requireUser() →
 * src/lib/services/onboarding.ts → src/lib/auth/actions.ts's signOutAction.
 *
 * The Google provider's OAuth wiring itself (client id/secret, authorize
 * URL, callback route) is verified structurally instead — see
 * src/lib/auth/__tests__/require-user.test.ts and this task's report for
 * what was and wasn't exercised end-to-end.
 */

test.describe('authentication', () => {
  // Several tests here open real dbWrite.transaction calls against the
  // live Neon database (see playwright.config.ts's Mobile Chrome project
  // comment for the full rationale) — serial keeps them from contending
  // with each other within this file too.
  test.describe.configure({ mode: 'serial' });

  test('unauthenticated request to a protected route redirects to /signin with callbackUrl', async ({
    page,
  }) => {
    await page.goto('/wallets');
    await expect(page).toHaveURL(/\/signin\?callbackUrl=/);
  });

  test('excluded paths stay reachable without a session (no /signin redirect)', async ({ page }) => {
    // Neither route has a page.tsx/route.ts yet (task 10 / cron tasks own
    // them) — a 404 is expected and is exactly the proof needed here: the
    // request reached Next's router instead of being redirected by
    // src/proxy.ts, which is the one thing this test asserts.
    await page.goto('/invite/some-token');
    await expect(page).not.toHaveURL(/\/signin/);

    const cronResponse = await page.goto('/api/cron/reconcile');
    expect(cronResponse?.url()).not.toContain('/signin');
  });

  test('signin page validates an empty/invalid email before sending a magic link', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByRole('heading', { name: 'Masuk ke MyMoney' })).toBeVisible();

    await page.getByLabel('Email').fill('not-an-email');
    await page.getByRole('button', { name: 'Kirim tautan masuk' }).click();

    // Not `getByRole('alert')` — Next's own route announcer
    // (`#__next-route-announcer__`) also has role="alert" and matches first.
    await expect(page.getByText('Masukkan alamat email yang valid')).toBeVisible();
  });

  test('authenticated but not-yet-onboarded user is redirected to /onboarding, completing it lands on a functional dashboard, and the session survives a reload', async ({
    page,
    context,
    baseURL,
  }) => {
    // A Server Action's route is compiled on-demand by `next dev`/Turbopack
    // the FIRST time it's hit in a freshly started dev server (the one
    // spawned for this whole e2e run) — observed to occasionally take
    // longer than the default 30s test budget by itself, on top of the
    // real dbWrite.transaction round trip below. Bumping the test-level
    // timeout, not just individual assertions, since it's that first-hit
    // compile — not any single step — that occasionally eats most of it.
    test.setTimeout(60_000);

    const { userId, sessionToken } = await seedSessionUser({ onboarded: false });

    try {
      await setSessionCookie(context, sessionToken);

      await page.goto('/');
      await expect(page).toHaveURL(/\/onboarding/);

      await page.getByLabel('Nama dompet').fill('BCA');
      await page.getByLabel('Jenis dompet').selectOption('bank');
      await page.getByLabel('Saldo saat ini (Rp)').fill('150000');
      await page.getByRole('button', { name: 'Lanjutkan' }).click();

      // completeOnboarding() writes a ledger entry + updates two rows in one
      // dbWrite transaction over the real Neon connection.
      await page.waitForURL(baseURL + '/', { timeout: 45_000 });

      // Onboarding done -> functional dashboard, real data from the DB.
      await expect(page).toHaveURL(baseURL + '/');
      await expect(page.getByText('BCA')).toBeVisible();
      await expect(page.getByText('Rp150.000').first()).toBeVisible();

      // Session persists after refresh — no bounce back to /signin.
      await page.reload();
      await expect(page).toHaveURL(baseURL + '/');
      await expect(page.getByText('BCA')).toBeVisible();
    } finally {
      await deleteTestUser(userId);
    }
  });

  test('logout deletes the session row in the database (not just the cookie), and the route becomes protected again', async ({
    page,
    context,
    baseURL,
  }) => {
    // See the onboarding test's comment above — same first-hit Turbopack
    // compile + real dbWrite round trip for signOutAction.
    test.setTimeout(60_000);

    const { userId, sessionToken } = await seedSessionUser({ onboarded: true });

    try {
      await setSessionCookie(context, sessionToken);

      await page.goto('/');
      await expect(page).toHaveURL(baseURL + '/');
      await expect(await sessionExists(sessionToken)).toBe(true);

      await page.getByRole('button', { name: 'Keluar' }).click();
      // signOutAction deletes the DB row before redirecting.
      await page.waitForURL(/\/signin/, { timeout: 45_000 });

      // The actual acceptance bar: the DB row is gone, not just the cookie.
      await expect(await sessionExists(sessionToken)).toBe(false);

      // And access is denied again, proving revocation — not just a
      // logged-out-looking UI state — is what's blocking the route.
      await page.goto('/');
      await expect(page).toHaveURL(/\/signin/);
    } finally {
      await deleteTestUser(userId);
    }
  });
});
