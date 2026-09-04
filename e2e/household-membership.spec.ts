import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '../src/lib/db/write';
import { householdInvitations, householdMembers } from '../src/lib/db/schema';
import { hashToken } from '../src/lib/auth/invitation-token';
import { deleteTestHousehold, deleteTestUser } from '../src/lib/db/__tests__/test-helpers';
import { seedSessionUser, setSessionCookie } from './helpers/auth-session';
import { test, expect } from './fixtures/base';

/**
 * tasks/11-household-membership — the first task involving two REAL user
 * sessions in the same test. docs/14-testing-strategy.md §7's two-context
 * pattern: two `browserContext`s, each with its own session cookie, driving
 * the SAME running app + SAME real database from "different people".
 *
 * WHY THE INVITATION IS SEEDED DIRECTLY, NOT SENT THROUGH THE REAL UI: the
 * whole point of this task's token design (src/lib/auth/invitation-token.ts,
 * src/lib/services/invitations.ts) is that the DATABASE NEVER HOLDS THE RAW
 * TOKEN — only its SHA-256 hash. The raw token exists exactly once, in the
 * outgoing email. That's correct and desired security behavior, but it also
 * means there is no way for a test process to recover a real token from a
 * real sent email without an IMAP client polling a real inbox — the same
 * class of "can't safely automate a real third-party service" problem
 * e2e/auth.spec.ts documents for Google's OAuth consent screen, solved the
 * same way: bypass ONLY the unautomatable third-party step (Google's login
 * UI there, email delivery here) by writing the exact row the real code
 * path would produce directly to the database, using the SAME
 * `hashToken`/token shape the real `createInvitation` uses, and then drive
 * EVERY user-facing step downstream of that — the accept button, the
 * redirect, the members list on both sides — for real, against the real
 * running app.
 *
 * `sendInvitationEmail`'s real SMTP wiring (task 04's real Gmail account) is
 * verified separately, deliberately, a small number of times, NOT as part
 * of this repeatable suite — see this task's final report.
 */

const DB_TIMEOUT = { timeout: 20_000 };

test.describe('household membership — two-context flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('owner creates a household, an invited user accepts in a second session, and both sides see the new member', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);

    const owner = await seedSessionUser({ onboarded: true, name: 'Owner E2E' });
    const invitee = await seedSessionUser({
      onboarded: true,
      email: `e2e-invitee-${uuidv7()}@example.invalid`,
      emailVerified: new Date(),
      name: 'Invitee E2E',
    });

    const ownerContext = await browser.newContext({ baseURL });
    const inviteeContext = await browser.newContext({ baseURL });

    try {
      await setSessionCookie(ownerContext, owner.sessionToken);
      await setSessionCookie(inviteeContext, invitee.sessionToken);

      const ownerPage = await ownerContext.newPage();
      const inviteePage = await inviteeContext.newPage();

      // Owner creates the household — real UI, real Server Action, real DB write.
      await ownerPage.goto('/household/new');
      await ownerPage.getByLabel('Nama keluarga').fill('Keluarga E2E');
      await ownerPage.getByRole('button', { name: 'Buat Keluarga' }).click();
      await expect(ownerPage).toHaveURL(/\/household\/(?!new$)[^/]+$/, DB_TIMEOUT);
      const householdId = ownerPage.url().split('/household/')[1]!.split(/[/?]/)[0]!;

      try {
        // Seed the invitation row exactly as `createInvitation` would —
        // see the file-level doc comment for why the raw token can't come
        // from a real sent email in an automated test.
        const rawToken = uuidv7();
        await dbWrite.insert(householdInvitations).values({
          id: uuidv7(),
          householdId,
          email: invitee.email,
          role: 'member',
          invitedBy: owner.userId,
          tokenHash: hashToken(rawToken),
          status: 'pending',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        // Invitee opens the real invite link — already signed in (second
        // session), so the confirmation-to-accept branch renders.
        await inviteePage.goto(`/invite/${rawToken}`);
        await expect(
          inviteePage.getByRole('heading', { name: /Keluarga E2E/ }),
        ).toBeVisible();
        await expect(
          inviteePage.getByText('Bergabung tidak membagikan data keuangan Anda.').first(),
        ).toBeVisible();

        // First hit of acceptInvitationAction in this dev-server process —
        // same on-demand Turbopack compile cost noted below for
        // removeMemberAction, on top of the real dbWrite.transaction round trip.
        await inviteePage.getByRole('button', { name: 'Terima Undangan' }).click();
        await expect(inviteePage).toHaveURL(`/household/${householdId}/members`, { timeout: 45_000 });

        // Invitee's own members-page render shows both people. `.first()`
        // below sidesteps a Next.js 16 dev-mode quirk observed here: a
        // prefetched sibling route can leave a second, `hidden` (not in the
        // accessibility tree, never visible to a real user) copy of a
        // segment's text in the DOM — `getByRole('heading', ...)` already
        // excludes it structurally; plain-text matches need `.first()`.
        await expect(inviteePage.getByRole('heading', { name: 'Aktif (2)' })).toBeVisible(DB_TIMEOUT);
        await expect(inviteePage.getByText(invitee.email).first()).toBeVisible();
        await expect(inviteePage.getByText(owner.email).first()).toBeVisible();

        // Owner's independent session, reloaded, shows the same thing —
        // the join is visible from BOTH sides without either refreshing
        // their login.
        await ownerPage.goto(`/household/${householdId}/members`);
        await expect(ownerPage.getByRole('heading', { name: 'Aktif (2)' })).toBeVisible(DB_TIMEOUT);
        await expect(ownerPage.getByText(invitee.email).first()).toBeVisible();

        // Privacy default, asserted at the DB level: joining shared nothing.
        const [membership] = await dbWrite
          .select()
          .from(householdMembers)
          .where(eq(householdMembers.userId, invitee.userId));
        expect(membership?.shareWealth).toBe(false);
      } finally {
        await deleteTestHousehold(householdId);
      }
    } finally {
      await ownerContext.close();
      await inviteeContext.close();
      await deleteTestUser(owner.userId);
      await deleteTestUser(invitee.userId);
    }
  });

  test('a removed member loses access on their very next request', async ({ browser, baseURL }) => {
    test.setTimeout(90_000);

    const owner = await seedSessionUser({ onboarded: true, name: 'Owner E2E' });
    const member = await seedSessionUser({ onboarded: true, name: 'Member ToRemove' });

    const ownerContext = await browser.newContext({ baseURL });
    const memberContext = await browser.newContext({ baseURL });

    try {
      await setSessionCookie(ownerContext, owner.sessionToken);
      await setSessionCookie(memberContext, member.sessionToken);

      const ownerPage = await ownerContext.newPage();
      const memberPage = await memberContext.newPage();

      await ownerPage.goto('/household/new');
      await ownerPage.getByLabel('Nama keluarga').fill('Keluarga Keluarkan');
      await ownerPage.getByRole('button', { name: 'Buat Keluarga' }).click();
      await expect(ownerPage).toHaveURL(/\/household\/(?!new$)[^/]+$/, DB_TIMEOUT);
      const householdId = ownerPage.url().split('/household/')[1]!.split(/[/?]/)[0]!;

      try {
        await dbWrite.insert(householdMembers).values({
          id: uuidv7(),
          householdId,
          userId: member.userId,
          role: 'member',
          status: 'active',
          joinedAt: new Date(),
        });

        // Member has access before removal.
        await memberPage.goto(`/household/${householdId}`);
        await expect(memberPage.getByRole('heading', { name: 'Keluarga Keluarkan' })).toBeVisible(
          DB_TIMEOUT,
        );

        // Owner removes them via the real Members page UI. Each step waits
        // for the NEXT Radix Sheet/Dialog to actually be open before acting
        // on it — same fix as e2e/transactions.spec.ts's keyboard-nav test,
        // which raced Radix Dialog's async open/close transition.
        await ownerPage.goto(`/household/${householdId}/members`);
        await ownerPage.getByRole('button', { name: 'Aksi untuk Member ToRemove' }).click();
        const actionSheet = ownerPage.getByRole('dialog', { name: 'Aksi untuk Member ToRemove' });
        await expect(actionSheet).toBeVisible();
        await actionSheet.getByRole('button', { name: 'Keluarkan dari keluarga' }).click();

        const confirmDialog = ownerPage.getByRole('dialog', {
          name: 'Keluarkan Member ToRemove dari keluarga?',
        });
        await expect(confirmDialog).toBeVisible();
        // First hit of removeMemberAction in this dev-server process — same
        // on-demand Turbopack compile cost e2e/auth.spec.ts documents for a
        // Server Action's first invocation, on top of the real
        // dbWrite.transaction round trip. A longer timeout here, not just
        // DB_TIMEOUT everywhere else.
        await confirmDialog.getByRole('button', { name: 'Keluarkan', exact: true }).click();
        await expect(
          ownerPage.getByText('Member ToRemove dikeluarkan', { exact: true }),
        ).toBeVisible({ timeout: 45_000 });

        // The member's VERY NEXT request — no re-login, no cache-bust — is denied.
        await memberPage.goto(`/household/${householdId}`);
        await expect(memberPage.getByText('Keluarga tidak ditemukan').first()).toBeVisible(
          DB_TIMEOUT,
        );
      } finally {
        await deleteTestHousehold(householdId);
      }
    } finally {
      await ownerContext.close();
      await memberContext.close();
      await deleteTestUser(owner.userId);
      await deleteTestUser(member.userId);
    }
  });
});
