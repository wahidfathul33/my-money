import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '../src/lib/db/write';
import { households, householdMembers } from '../src/lib/db/schema/households';
import { wallets } from '../src/lib/db/schema/wallets';
import { deleteTestHousehold, deleteTestUser } from '../src/lib/db/__tests__/test-helpers';
import { seedSessionUser, setSessionCookie } from './helpers/auth-session';
import { test, expect, suppressDevOverlay, waitForDomToSettle } from './fixtures/base';

/**
 * tasks/23-hardening-and-launch — "Audit Privasi Household (tiga akun
 * nyata)" (todo.md). Every prior household e2e suite (tasks 11, 12, 13, 19)
 * uses exactly TWO concurrent sessions. Two of todo.md's seven assertions
 * specifically need a genuinely non-participating THIRD account (C: never
 * shares, never tags anything) sitting in the SAME household as a sharing
 * owner (A) and a sharing member (B) — this file is the first to seed three
 * real sessions into one household at once, matching todo.md's own A/B/C
 * naming.
 *
 * Every individual MECHANISM exercised here already has its own two-context
 * or integration proof elsewhere (default privacy: household-membership.spec.ts;
 * the sharing row's own "Belum berbagi" branch and coverage counting:
 * net-worth-household.spec.ts; tag-gated household-expense visibility:
 * sharing.spec.ts; the transfer-target picker never returning a balance:
 * src/lib/visibility/__tests__/transfer-targets.integration.test.ts). This
 * file's job is only to prove those mechanisms hold TOGETHER, live, with a
 * third account that never touches the household at all.
 */
const DB_TIMEOUT = { timeout: 20_000 };

async function seedHouseholdTrio() {
  const owner = await seedSessionUser({ onboarded: true, name: 'Owner A' });
  const member = await seedSessionUser({ onboarded: true, name: 'Member B' });
  const outsider = await seedSessionUser({ onboarded: true, name: 'Member C' });

  const householdId = uuidv7();
  await dbWrite
    .insert(households)
    .values({ id: householdId, name: 'Keluarga Audit Privasi', createdBy: owner.userId });
  await dbWrite.insert(householdMembers).values([
    {
      id: uuidv7(),
      householdId,
      userId: owner.userId,
      role: 'owner',
      status: 'active',
      joinedAt: new Date(),
      shareWealth: true,
    },
    {
      id: uuidv7(),
      householdId,
      userId: member.userId,
      role: 'member',
      status: 'active',
      joinedAt: new Date(),
      shareWealth: true,
    },
    // C: default privacy, completely untouched — never shares, never tags
    // anything. `shareWealth` deliberately omitted — the schema default
    // (false) is the thing under test.
    { id: uuidv7(), householdId, userId: outsider.userId, role: 'member', status: 'active', joinedAt: new Date() },
  ]);

  return { owner, member, outsider, householdId };
}

test.describe('Household privacy audit — three real accounts, one household', () => {
  test.describe.configure({ mode: 'serial' });

  test('a member who never shares or tags anything never surfaces financially to A or B, only by name; per-member breakdown lists everyone ahead of the total', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(150_000);

    const { owner, member, outsider, householdId } = await seedHouseholdTrio();

    // Distinctive, easy-to-grep balances. C's is the one that must NEVER
    // surface in anyone else's session.
    await dbWrite.update(wallets).set({ balance: 1_000_000_00n }).where(eq(wallets.userId, owner.userId));
    await dbWrite.update(wallets).set({ balance: 2_000_000_00n }).where(eq(wallets.userId, member.userId));
    await dbWrite.update(wallets).set({ balance: 9_999_000_00n }).where(eq(wallets.userId, outsider.userId));

    const ownerContext = await browser.newContext({ baseURL });
    const memberContext = await browser.newContext({ baseURL });
    await suppressDevOverlay(ownerContext);
    await suppressDevOverlay(memberContext);

    try {
      await setSessionCookie(ownerContext, owner.sessionToken);
      await setSessionCookie(memberContext, member.sessionToken);
      const ownerPage = await ownerContext.newPage();
      const memberPage = await memberContext.newPage();

      for (const page of [ownerPage, memberPage]) {
        await page.goto(`/household/${householdId}/net-worth`);
        await waitForDomToSettle(page);

        // Per-member breakdown comes FIRST, ahead of the total —
        // docs/09-screen-specs.md §16 / ADR-029.
        await expect(page.getByRole('heading', { name: 'Per Anggota' })).toBeVisible(DB_TIMEOUT);
        await expect(page.getByText('Owner A')).toBeVisible();
        await expect(page.getByText('Member B')).toBeVisible();

        // C's identity is listed (member-list.tsx's own contract: identity
        // is never secret, only financial figures are) but flagged as not
        // sharing — never a number, on this row or anywhere else.
        await expect(page.getByText('Member C')).toBeVisible();
        await expect(page.getByText('Belum berbagi')).toBeVisible();
        await expect(page.getByText('Rp9.999.000')).toHaveCount(0);

        // Coverage and total are exactly A + B — C excluded from both.
        await expect(page.getByText('2 dari 3 anggota')).toBeVisible();
        await expect(page.getByText('Rp3.000.000').first()).toBeVisible();

        // Household expenses page — C never tagged anything, so C never
        // appears there at all, financial or otherwise.
        await page.goto(`/household/${householdId}/transactions`);
        await waitForDomToSettle(page);
        await expect(page.getByText('Member C')).toHaveCount(0);
        await expect(page.getByText('Rp9.999.000')).toHaveCount(0);
      }
    } finally {
      await ownerContext.close();
      await memberContext.close();
      await deleteTestHousehold(householdId);
      await deleteTestUser(owner.userId);
      await deleteTestUser(member.userId);
      await deleteTestUser(outsider.userId);
    }
  });

  test('owner cannot see a non-sharing member private wallet balance anywhere, only their name in the member-transfer target picker', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    const { owner, member, outsider, householdId } = await seedHouseholdTrio();
    // B keeps a private wallet, untouched — exactly todo.md's "dompet
    // pribadi B" scenario. (C is seeded by the shared helper but unused
    // here — irrelevant to this test's assertions, still cleaned up below.)
    await dbWrite
      .update(householdMembers)
      .set({ shareWealth: false })
      .where(eq(householdMembers.userId, member.userId));
    await dbWrite
      .update(wallets)
      .set({ balance: 7_500_000_00n, name: 'Rekening Pribadi B' })
      .where(eq(wallets.userId, member.userId));

    const ownerContext = await browser.newContext({ baseURL });
    await suppressDevOverlay(ownerContext);

    try {
      await setSessionCookie(ownerContext, owner.sessionToken);
      const ownerPage = await ownerContext.newPage();
      await ownerPage.setViewportSize({ width: 390, height: 844 });

      // A opens the member-transfer target picker — sees B's NAME, picks
      // B's wallet by NAME, but the dialog never renders a balance at all
      // (src/lib/visibility/transfer-targets.ts's own contract, already
      // unit/integration-tested — this proves it end to end).
      await ownerPage.goto('/');
      await ownerPage.getByRole('button', { name: 'Tambah transaksi' }).click();
      const sheet = ownerPage.getByRole('dialog', { name: 'Tambah transaksi' });
      await expect(sheet).toBeVisible();
      await sheet.getByRole('tab', { name: 'Transfer' }).click();
      await sheet.getByRole('tab', { name: 'Ke anggota keluarga' }).click();
      await sheet.getByRole('button', { name: /^Dompet tujuan:/ }).click();
      const memberSheet = ownerPage.getByRole('dialog', { name: 'Pilih anggota' });
      await expect(memberSheet).toBeVisible();
      await expect(memberSheet.getByText('Member B')).toBeVisible();
      await memberSheet.getByRole('button', { name: /Member B/ }).click();
      const walletSheet = ownerPage.getByRole('dialog', { name: 'Rekening Member B' });
      await expect(walletSheet).toBeVisible();
      await expect(walletSheet.getByRole('button', { name: 'Rekening Pribadi B' })).toBeVisible();
      await expect(walletSheet.getByText('Rp7.500.000')).toHaveCount(0);
      await expect(walletSheet.getByText('Saldo')).toHaveCount(0);

      // Nowhere else in A's app does B's balance surface either.
      await ownerPage.goto(`/household/${householdId}/net-worth`);
      await waitForDomToSettle(ownerPage);
      await expect(ownerPage.getByText('Rp7.500.000')).toHaveCount(0);
      await ownerPage.goto(`/household/${householdId}/transactions`);
      await waitForDomToSettle(ownerPage);
      await expect(ownerPage.getByText('Rp7.500.000')).toHaveCount(0);
    } finally {
      await ownerContext.close();
      await deleteTestHousehold(householdId);
      await deleteTestUser(owner.userId);
      await deleteTestUser(member.userId);
      await deleteTestUser(outsider.userId);
    }
  });
});
