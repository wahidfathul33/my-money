import { uuidv7 } from 'uuidv7';
import { dbWrite } from '../src/lib/db/write';
import { households, householdMembers } from '../src/lib/db/schema';
import { deleteTestHousehold, deleteTestUser } from '../src/lib/db/__tests__/test-helpers';
import { checkAxeCleanAtEveryColorScheme, checkNoHorizontalOverflow } from './helpers/a11y-check';
import { seedSessionUser, setSessionCookie } from './helpers/auth-session';
import { suppressDevOverlay, test } from './fixtures/base';

/**
 * tasks/23-hardening-and-launch's route audit: every `/household/[id]/*`
 * page had a `page.goto` somewhere in the suite (household.spec.ts,
 * household-membership.spec.ts, net-worth-household.spec.ts,
 * savings-household.spec.ts, household-privacy-audit.spec.ts,
 * reports.spec.ts) but NONE of them ran an axe scan, and only
 * reports.spec.ts's household test checked for horizontal overflow (on
 * `/household/[id]/reports` specifically) — see this task's own audit
 * notes. This file closes that gap for every household sub-page in one
 * place, using the plain single-owner household creation pattern
 * e2e/household.spec.ts already establishes (direct DB insert, same shape
 * `createInvitation`'s real code path produces — see
 * e2e/household-membership.spec.ts's file header for why direct insert is
 * the right call here, not driving the real "Buat Keluarga" form each
 * time).
 *
 * Uses e2e/fixtures/base directly (not fixtures/authenticated) because
 * each test needs its OWN manually created session/context tied to a
 * freshly seeded owner — the same two-context pattern
 * e2e/household-membership.spec.ts and e2e/reports.spec.ts's household
 * test already use, just with a single context since no second member is
 * needed for these checks.
 */

async function seedOwnedHousehold(name: string): Promise<{ ownerId: string; sessionToken: string; householdId: string }> {
  const owner = await seedSessionUser({ onboarded: true, name: `${name} — Pemilik` });
  const householdId = uuidv7();
  await dbWrite.insert(households).values({ id: householdId, name, createdBy: owner.userId });
  await dbWrite.insert(householdMembers).values({
    id: uuidv7(),
    householdId,
    userId: owner.userId,
    role: 'owner',
    status: 'active',
    joinedAt: new Date(),
  });
  return { ownerId: owner.userId, sessionToken: owner.sessionToken, householdId };
}

test.describe('Household sub-pages — aksesibilitas & responsif', () => {
  test.describe.configure({ mode: 'serial' });

  test('/household/[id] — tanpa horizontal overflow, axe nol pelanggaran', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    const { ownerId, sessionToken, householdId } = await seedOwnedHousehold('Rumah Audit Utama');
    try {
      const context = await browser.newContext({ baseURL });
      await suppressDevOverlay(context);
      await setSessionCookie(context, sessionToken);
      const page = await context.newPage();

      const url = `/household/${householdId}`;
      await checkNoHorizontalOverflow(page, url);
      await checkAxeCleanAtEveryColorScheme(page, url);

      await context.close();
    } finally {
      await deleteTestHousehold(householdId);
      await deleteTestUser(ownerId);
    }
  });

  test('/household/[id]/budgets — tanpa horizontal overflow, axe nol pelanggaran', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    const { ownerId, sessionToken, householdId } = await seedOwnedHousehold('Rumah Audit Anggaran');
    try {
      const context = await browser.newContext({ baseURL });
      await suppressDevOverlay(context);
      await setSessionCookie(context, sessionToken);
      const page = await context.newPage();

      const url = `/household/${householdId}/budgets`;
      await checkNoHorizontalOverflow(page, url);
      await checkAxeCleanAtEveryColorScheme(page, url);

      await context.close();
    } finally {
      await deleteTestHousehold(householdId);
      await deleteTestUser(ownerId);
    }
  });

  test('/household/[id]/members — tanpa horizontal overflow, axe nol pelanggaran', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    const { ownerId, sessionToken, householdId } = await seedOwnedHousehold('Rumah Audit Anggota');
    try {
      const context = await browser.newContext({ baseURL });
      await suppressDevOverlay(context);
      await setSessionCookie(context, sessionToken);
      const page = await context.newPage();

      const url = `/household/${householdId}/members`;
      await checkNoHorizontalOverflow(page, url);
      await checkAxeCleanAtEveryColorScheme(page, url);

      await context.close();
    } finally {
      await deleteTestHousehold(householdId);
      await deleteTestUser(ownerId);
    }
  });

  test('/household/[id]/net-worth — tanpa horizontal overflow, axe nol pelanggaran', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    const { ownerId, sessionToken, householdId } = await seedOwnedHousehold('Rumah Audit Kekayaan');
    try {
      const context = await browser.newContext({ baseURL });
      await suppressDevOverlay(context);
      await setSessionCookie(context, sessionToken);
      const page = await context.newPage();

      const url = `/household/${householdId}/net-worth`;
      await checkNoHorizontalOverflow(page, url);
      await checkAxeCleanAtEveryColorScheme(page, url);

      await context.close();
    } finally {
      await deleteTestHousehold(householdId);
      await deleteTestUser(ownerId);
    }
  });

  // Overflow already covered for this specific route by
  // e2e/reports.spec.ts's "Reports — household" test — axe only here, to
  // avoid duplicating that check (this suite's own "don't duplicate
  // coverage" rule).
  test('/household/[id]/reports — axe nol pelanggaran', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    const { ownerId, sessionToken, householdId } = await seedOwnedHousehold('Rumah Audit Laporan');
    try {
      const context = await browser.newContext({ baseURL });
      await suppressDevOverlay(context);
      await setSessionCookie(context, sessionToken);
      const page = await context.newPage();

      await checkAxeCleanAtEveryColorScheme(page, `/household/${householdId}/reports`);

      await context.close();
    } finally {
      await deleteTestHousehold(householdId);
      await deleteTestUser(ownerId);
    }
  });

  test('/household/[id]/savings — tanpa horizontal overflow, axe nol pelanggaran', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    const { ownerId, sessionToken, householdId } = await seedOwnedHousehold('Rumah Audit Tabungan');
    try {
      const context = await browser.newContext({ baseURL });
      await suppressDevOverlay(context);
      await setSessionCookie(context, sessionToken);
      const page = await context.newPage();

      const url = `/household/${householdId}/savings`;
      await checkNoHorizontalOverflow(page, url);
      await checkAxeCleanAtEveryColorScheme(page, url);

      await context.close();
    } finally {
      await deleteTestHousehold(householdId);
      await deleteTestUser(ownerId);
    }
  });

  test('/household/[id]/settings — tanpa horizontal overflow, axe nol pelanggaran', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    const { ownerId, sessionToken, householdId } = await seedOwnedHousehold('Rumah Audit Pengaturan');
    try {
      const context = await browser.newContext({ baseURL });
      await suppressDevOverlay(context);
      await setSessionCookie(context, sessionToken);
      const page = await context.newPage();

      const url = `/household/${householdId}/settings`;
      await checkNoHorizontalOverflow(page, url);
      await checkAxeCleanAtEveryColorScheme(page, url);

      await context.close();
    } finally {
      await deleteTestHousehold(householdId);
      await deleteTestUser(ownerId);
    }
  });

  test('/household/[id]/transactions — tanpa horizontal overflow, axe nol pelanggaran', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(60_000);
    const { ownerId, sessionToken, householdId } = await seedOwnedHousehold('Rumah Audit Transaksi');
    try {
      const context = await browser.newContext({ baseURL });
      await suppressDevOverlay(context);
      await setSessionCookie(context, sessionToken);
      const page = await context.newPage();

      const url = `/household/${householdId}/transactions`;
      await checkNoHorizontalOverflow(page, url);
      await checkAxeCleanAtEveryColorScheme(page, url);

      await context.close();
    } finally {
      await deleteTestHousehold(householdId);
      await deleteTestUser(ownerId);
    }
  });
});
