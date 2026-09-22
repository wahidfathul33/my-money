import AxeBuilder from '@axe-core/playwright';
import { deleteTestUser } from '../src/lib/db/__tests__/test-helpers';
import { A11Y_WIDTHS, checkAxeCleanAtEveryColorScheme, checkNoHorizontalOverflow } from './helpers/a11y-check';
import { seedSessionUser, setSessionCookie } from './helpers/auth-session';
import { test, expect } from './fixtures/base';

/**
 * tasks/23-hardening-and-launch's route audit: three real routes that
 * can't use e2e/fixtures/authenticated.ts's auto-onboarded session, each
 * for a different reason, so none of them ever got an axe/overflow check
 * anywhere in the suite before this file:
 *
 *  - /signin — src/app/(auth)/signin/page.tsx redirects an already-signed-in
 *    user straight to `/` (see its own `if (session?.user) redirect('/')`),
 *    so the authenticated fixture can never actually reach this page's
 *    content. Audited fully unauthenticated instead, the same way
 *    e2e/auth.spec.ts's own signin test does.
 *
 *  - /onboarding — only renders for a session that exists but hasn't
 *    completed onboarding yet (src/lib/services/onboarding.ts via
 *    src/app/(app)/layout.tsx). e2e/fixtures/authenticated.ts always seeds
 *    `onboarded: true`, so this route needs its own
 *    `seedSessionUser({ onboarded: false })` — the exact pattern
 *    e2e/auth.spec.ts's "redirected to /onboarding" test already
 *    establishes.
 *
 *  - /invite/[token] — excluded from the auth guard entirely (src/proxy.ts,
 *    docs/12-security-and-auth.md §3 Layer 1) and reachable by a recipient
 *    with NO account yet. The invalid/expired/used-token branch
 *    (`InvalidInvite`, src/app/invite/[token]/page.tsx) needs no seeding at
 *    all — any token that doesn't match a real `household_invitations` row
 *    renders it, the same "no real token" case e2e/auth.spec.ts's
 *    `/invite/some-token` check already exercises for the auth-guard-bypass
 *    assertion. The valid-invitation branch is already covered end to end
 *    (including its own heading) by
 *    e2e/household-membership.spec.ts — not duplicated here.
 *
 *  - /privacy and /terms — added after this file's first pass (task 23's
 *    own "Audit Legal" section, src/app/privacy/page.tsx and
 *    src/app/terms/page.tsx), also excluded from the auth guard so they're
 *    reachable pre-sign-in — simple static pages, no seeding needed.
 */

test.describe('/signin — aksesibilitas & responsif', () => {
  test('tanpa horizontal overflow, axe nol pelanggaran', async ({ page }) => {
    test.setTimeout(60_000);
    await checkNoHorizontalOverflow(page, '/signin');
    await checkAxeCleanAtEveryColorScheme(page, '/signin');
  });
});

test.describe('/privacy — aksesibilitas & responsif', () => {
  test('tanpa horizontal overflow, axe nol pelanggaran', async ({ page }) => {
    test.setTimeout(60_000);
    await checkNoHorizontalOverflow(page, '/privacy');
    await checkAxeCleanAtEveryColorScheme(page, '/privacy');
  });
});

test.describe('/terms — aksesibilitas & responsif', () => {
  test('tanpa horizontal overflow, axe nol pelanggaran', async ({ page }) => {
    test.setTimeout(60_000);
    await checkNoHorizontalOverflow(page, '/terms');
    await checkAxeCleanAtEveryColorScheme(page, '/terms');
  });
});

test.describe('/onboarding — aksesibilitas & responsif', () => {
  test('tanpa horizontal overflow, axe nol pelanggaran', async ({ page, context }) => {
    test.setTimeout(60_000);
    const { userId, sessionToken } = await seedSessionUser({ onboarded: false });
    try {
      await setSessionCookie(context, sessionToken);
      await checkNoHorizontalOverflow(page, '/onboarding');
      await checkAxeCleanAtEveryColorScheme(page, '/onboarding');
    } finally {
      await deleteTestUser(userId);
    }
  });
});

test.describe('/invite/[token] (token tidak valid) — aksesibilitas & responsif', () => {
  // Deliberately NOT using the shared checkNoHorizontalOverflow /
  // checkAxeCleanAtEveryColorScheme helpers here — both re-navigate per
  // width/color-scheme (8-10 real page loads total), and every load of
  // this route counts as one attempt against
  // src/lib/auth/invitation-rate-limit.ts's assertInviteTokenRateLimit:
  // "10 percobaan token / jam per IP", fail-closed, one in-memory bucket
  // shared by the whole e2e run's single dev-server process (also hit by
  // e2e/auth.spec.ts's own `/invite/some-token` check and
  // e2e/household-membership.spec.ts's real accept flow). A single
  // navigation here, with widths/color-schemes checked against the
  // already-loaded page (resize + emulateMedia both recompute live via
  // CSS, no reload needed for this route — a plain server-rendered page
  // with no client-side theme detection logic), keeps this test's whole
  // budget to ONE attempt.
  test('tanpa horizontal overflow, axe nol pelanggaran', async ({ page }) => {
    test.setTimeout(60_000);
    const url = `/invite/tidak-valid-${Date.now()}`;

    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Undangan tidak berlaku' })).toBeVisible();

    for (const width of A11Y_WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasOverflow, `${url} @ ${width}px punya horizontal overflow`).toBe(false);
    }

    await page.setViewportSize({ width: 360, height: 844 });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    }
  });
});
