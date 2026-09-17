import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '../src/lib/db/write';
import { households, householdMembers, wallets } from '../src/lib/db/schema';
import { deleteTestHousehold, deleteTestUser } from '../src/lib/db/__tests__/test-helpers';
import { seedSessionUser, setSessionCookie } from './helpers/auth-session';
import { test, expect, suppressDevOverlay, waitForDomToSettle } from './fixtures/base';

/**
 * tasks/19-net-worth — the two-context flows todo.md names explicitly:
 *
 *   - "satu anggota mengaktifkan share_wealth → cakupan berubah 1/2 → 2/2"
 *   - "transfer ke anggota → kedua saldo benar, kekayaan keluarga tetap"
 *
 * Same two-real-sessions technique as e2e/sharing.spec.ts and
 * e2e/transfers-member.spec.ts (both cited here for the exact patterns
 * reused): two real Playwright `BrowserContext`s driving the SAME running
 * app against the SAME database, membership seeded directly rather than
 * through the invite/accept UI (already covered end to end by
 * e2e/household-membership.spec.ts).
 */
const DB_TIMEOUT = { timeout: 20_000 };

async function seedHouseholdPair(ownerName: string, memberName: string) {
  const owner = await seedSessionUser({ onboarded: true, name: ownerName });
  const member = await seedSessionUser({ onboarded: true, name: memberName });

  const householdId = uuidv7();
  await dbWrite.insert(households).values({ id: householdId, name: 'Keluarga Net Worth E2E', createdBy: owner.userId });
  await dbWrite.insert(householdMembers).values([
    { id: uuidv7(), householdId, userId: owner.userId, role: 'owner', status: 'active', joinedAt: new Date(), shareWealth: true },
    { id: uuidv7(), householdId, userId: member.userId, role: 'member', status: 'active', joinedAt: new Date(), shareWealth: false },
  ]);

  return { owner, member, householdId };
}

test.describe('Net worth — household two-context flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('a second member turning on share_wealth moves coverage from 1/2 to 2/2, and the total updates to include them', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    const { owner, member, householdId } = await seedHouseholdPair('Pemilik NW E2E', 'Anggota NW E2E');

    // Give both a real cash balance so the coverage change also visibly
    // moves the total, not just the coverage count.
    await dbWrite.update(wallets).set({ balance: 1_000_000_00n }).where(eq(wallets.userId, owner.userId));
    await dbWrite.update(wallets).set({ balance: 4_000_000_00n }).where(eq(wallets.userId, member.userId));

    const ownerContext = await browser.newContext({ baseURL });
    const memberContext = await browser.newContext({ baseURL });
    await suppressDevOverlay(ownerContext);
    await suppressDevOverlay(memberContext);

    try {
      await setSessionCookie(ownerContext, owner.sessionToken);
      await setSessionCookie(memberContext, member.sessionToken);
      const ownerPage = await ownerContext.newPage();
      const memberPage = await memberContext.newPage();

      // Before the second member shares: coverage is 1 of 2, total is
      // ONLY the owner's Rp1.000.000 — the member's Rp4.000.000 is real
      // money but not yet visible in this aggregate (ADR-029's whole point).
      await ownerPage.goto(`/household/${householdId}/net-worth`);
      await waitForDomToSettle(ownerPage);
      await expect(ownerPage.getByText('1 dari 2 anggota')).toBeVisible(DB_TIMEOUT);
      await expect(ownerPage.getByText('Belum berbagi')).toBeVisible();
      await expect(ownerPage.getByText('Rp1.000.000').first()).toBeVisible();

      // The member turns sharing ON via the real settings UI (same flow
      // e2e/sharing.spec.ts proves the mechanism for).
      await memberPage.goto('/settings/sharing');
      const shareSwitch = memberPage.getByRole('switch', { name: 'Bagikan kekayaan ke Keluarga Net Worth E2E' });
      await expect(shareSwitch).toHaveAttribute('aria-checked', 'false');
      await shareSwitch.click();
      const confirmDialog = memberPage.getByRole('dialog', { name: 'Bagikan kekayaan Anda ke Keluarga Net Worth E2E?' });
      await expect(confirmDialog).toBeVisible();
      await confirmDialog.getByRole('button', { name: 'Bagikan' }).click();
      await expect(shareSwitch).toHaveAttribute('aria-checked', 'true', DB_TIMEOUT);
      // The switch flips OPTIMISTICALLY on click, before the server action
      // (and its `router.refresh()`) has actually settled — see
      // src/features/sharing/components/share-wealth-toggle.tsx's
      // `confirmShare`. Waiting for it to become enabled again (its
      // `disabled={isPending}` only clears once that whole transition
      // resolves) proves the DB write has actually committed before the
      // OWNER's page navigates and reads it — without this, the owner's
      // very next `goto` can race the write and still observe 1/2.
      await expect(shareSwitch).toBeEnabled(DB_TIMEOUT);

      // Coverage is now 2 of 2, and the total includes BOTH balances.
      await ownerPage.goto(`/household/${householdId}/net-worth`);
      await waitForDomToSettle(ownerPage);
      await expect(ownerPage.getByText('2 dari 2 anggota')).toBeVisible(DB_TIMEOUT);
      await expect(ownerPage.getByText('Belum berbagi')).toHaveCount(0);
      // Rp1.000.000 + Rp4.000.000 = Rp5.000.000.
      await expect(ownerPage.getByText('Rp5.000.000').first()).toBeVisible();
    } finally {
      await ownerContext.close();
      await memberContext.close();
      await deleteTestHousehold(householdId);
      await deleteTestUser(owner.userId);
      await deleteTestUser(member.userId);
    }
  });

  test('a member transfer moves money between two personal balances but never changes the household net worth total — I13', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    const { owner: sender, member: receiver, householdId } = await seedHouseholdPair('Pengirim NW E2E', 'Penerima NW E2E');
    // Both need to share for the total to reflect either of them at all —
    // the receiver defaults to NOT sharing from `seedHouseholdPair`.
    await dbWrite.update(householdMembers).set({ shareWealth: true }).where(eq(householdMembers.userId, receiver.userId));

    await dbWrite.update(wallets).set({ balance: 3_000_000_00n }).where(eq(wallets.userId, sender.userId));
    // Receiver's starter wallet stays at 0 — the transfer creates it.

    const senderContext = await browser.newContext({ baseURL });
    const receiverContext = await browser.newContext({ baseURL });
    await suppressDevOverlay(senderContext);
    await suppressDevOverlay(receiverContext);

    try {
      await setSessionCookie(senderContext, sender.sessionToken);
      await setSessionCookie(receiverContext, receiver.sessionToken);
      const senderPage = await senderContext.newPage();
      const receiverPage = await receiverContext.newPage();
      await senderPage.setViewportSize({ width: 390, height: 844 });
      await receiverPage.setViewportSize({ width: 390, height: 844 });

      await senderPage.goto(`/household/${householdId}/net-worth`);
      await waitForDomToSettle(senderPage);
      // Rp3.000.000 (sender) + Rp0 (receiver) = Rp3.000.000.
      await expect(senderPage.getByText('Rp3.000.000').first()).toBeVisible(DB_TIMEOUT);

      // Sender records a member transfer of Rp1.000.000 to the receiver —
      // same flow e2e/transfers-member.spec.ts proves end to end.
      await senderPage.goto('/');
      await senderPage.getByRole('button', { name: 'Tambah transaksi' }).click();
      const sheet = senderPage.getByRole('dialog', { name: 'Tambah transaksi' });
      await expect(sheet).toBeVisible();
      await sheet.getByRole('tab', { name: 'Transfer' }).click();
      await sheet.getByRole('tab', { name: 'Ke anggota keluarga' }).click();
      for (const digit of ['1', '0', '0', '0', '0', '0', '0']) {
        await sheet.getByRole('button', { name: digit, exact: true }).click();
      }
      await sheet.getByRole('button', { name: /^Dompet tujuan:/ }).click();
      await senderPage.getByRole('dialog', { name: 'Pilih anggota' }).getByRole('button', { name: /Penerima NW E2E/ }).click();
      await senderPage.getByRole('dialog', { name: 'Rekening Penerima NW E2E' }).getByRole('button', { name: 'Tunai' }).click();
      await sheet.getByRole('button', { name: 'Simpan' }).click();
      await senderPage.getByRole('dialog', { name: /Catat transfer/ }).getByRole('button', { name: 'Catat', exact: true }).click();
      await expect(senderPage.getByText('Tersimpan', { exact: true })).toBeVisible(DB_TIMEOUT);

      // Both personal balances moved — sender down, receiver up, same amount.
      await senderPage.goto('/wallets');
      await expect(senderPage.getByRole('link', { name: /Tunai/ })).toContainText('Rp2.000.000', DB_TIMEOUT);
      await receiverPage.goto('/wallets');
      await expect(receiverPage.getByRole('link', { name: /Tunai/ })).toContainText('Rp1.000.000', DB_TIMEOUT);

      // The household TOTAL is exactly what it was before — I13, proven
      // live through the real UI, not just the pure property test.
      await senderPage.goto(`/household/${householdId}/net-worth`);
      await waitForDomToSettle(senderPage);
      await expect(senderPage.getByText('Rp3.000.000').first()).toBeVisible(DB_TIMEOUT);
    } finally {
      await senderContext.close();
      await receiverContext.close();
      await deleteTestHousehold(householdId);
      await deleteTestUser(sender.userId);
      await deleteTestUser(receiver.userId);
    }
  });
});
