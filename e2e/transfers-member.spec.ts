import { uuidv7 } from 'uuidv7';
import { dbWrite } from '../src/lib/db/write';
import { households, householdMembers } from '../src/lib/db/schema/households';
import { wallets } from '../src/lib/db/schema/wallets';
import { deleteTestHousehold, deleteTestUser } from '../src/lib/db/__tests__/test-helpers';
import { seedSessionUser, setSessionCookie } from './helpers/auth-session';
import { test, expect, suppressDevOverlay } from './fixtures/base';

/**
 * tasks/13-transfers-member — the two-context flow: docs/03-domain-model.md
 * §9.3's whole premise ("penerima diberi tahu, bukan dimintai persetujuan")
 * only means something if it's proven with TWO real, independent sessions
 * driving the SAME running app — same pattern as
 * e2e/household-membership.spec.ts (task 11's own doc comment there explains
 * why this two-context technique exists at all).
 *
 * WHY THE HOUSEHOLD IS SEEDED DIRECTLY, NOT VIA THE REAL INVITE UI: task 11's
 * invite/accept flow is already covered end-to-end by
 * household-membership.spec.ts; re-running it here would only slow this
 * suite down without adding coverage. Both users are seeded straight into
 * `household_members` as active — `createHousehold` (the service) for the
 * owner row, a direct INSERT for the second membership, mirroring
 * household-membership.spec.ts's own "member has access before removal"
 * test.
 *
 * Both users start with a "Tunai" wallet (balance 0) from `seedNewUser` —
 * see src/lib/db/seed.ts's `STARTER_WALLET_NAME` — which is what this suite
 * transfers between without needing to create any wallet through the UI.
 *
 * ROOT-CAUSED HANG, FIXED HERE: a manually-created `browser.newContext()`
 * (required for a SECOND independent session) never runs `fixtures/base.ts`'s
 * `page` fixture override, so its `<nextjs-portal>` pointer-events fix never
 * applies either. This suite is the first two-context spec that clicks the
 * Add Transaction sheet's bottom-aligned amount keypad — confirmed (via a
 * standalone repro script with console/pageerror listeners, bypassing
 * Playwright's own retry-and-hide-the-log behavior) that the dev overlay's
 * issues badge sits exactly there and silently intercepts every keypad tap,
 * so Playwright's actionability check retries the SAME click for the full
 * test timeout with no application error at all. `suppressDevOverlay`
 * (fixtures/base.ts) applies the identical CSS fix to each manually-created
 * context below, before its first page is created.
 */

const DB_TIMEOUT = { timeout: 20_000 };

async function seedHouseholdPair(ownerName: string, memberName: string) {
  const owner = await seedSessionUser({ onboarded: true, name: ownerName });
  const member = await seedSessionUser({ onboarded: true, name: memberName });

  const householdId = uuidv7();
  await dbWrite.insert(households).values({ id: householdId, name: 'Keluarga E2E', createdBy: owner.userId });
  await dbWrite.insert(householdMembers).values([
    { id: uuidv7(), householdId, userId: owner.userId, role: 'owner', status: 'active', joinedAt: new Date() },
    { id: uuidv7(), householdId, userId: member.userId, role: 'member', status: 'active', joinedAt: new Date() },
  ]);

  return { owner, member, householdId };
}

async function tunaiBalanceText(page: import('@playwright/test').Page) {
  await page.goto('/wallets');
  return page.getByRole('link', { name: /Tunai/ });
}

test.describe('Transfer ke anggota keluarga — two-context flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('sender records a member transfer -> both balances correct immediately -> appears in receiver Activity -> Oke acknowledges it', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    const { owner: sender, member: receiver, householdId } = await seedHouseholdPair('Suami E2E', 'Istri E2E');

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

      // --- Sender records the transfer -------------------------------
      await senderPage.goto('/');
      await senderPage.getByRole('button', { name: 'Tambah transaksi' }).click();
      const sheet = senderPage.getByRole('dialog', { name: 'Tambah transaksi' });
      await expect(sheet).toBeVisible();
      await sheet.getByRole('tab', { name: 'Transfer' }).click();

      // The inner segment only appears because the sender has a household.
      await sheet.getByRole('tab', { name: 'Ke anggota keluarga' }).click();

      const amountDisplay = sheet.getByRole('status', { name: 'Jumlah' });
      for (const digit of ['1', '0', '0', '0', '0', '0', '0']) {
        await sheet.getByRole('button', { name: digit, exact: true }).click();
      }
      await expect(amountDisplay).toHaveText('1.000.000');

      // Pick the recipient, then their wallet.
      await sheet.getByRole('button', { name: /^Dompet tujuan:/ }).click();
      const memberSheet = senderPage.getByRole('dialog', { name: 'Pilih anggota' });
      await expect(memberSheet).toBeVisible();
      await memberSheet.getByRole('button', { name: /Istri E2E/ }).click();
      const walletSheet = senderPage.getByRole('dialog', { name: 'Rekening Istri E2E' });
      await expect(walletSheet).toBeVisible();
      await walletSheet.getByRole('button', { name: 'Tunai' }).click();

      // Note text states the effect plainly.
      await expect(sheet.getByText(/Saldo Istri E2E langsung berubah/)).toBeVisible();

      await sheet.getByRole('button', { name: 'Simpan' }).click();

      // A member transfer confirms first — docs/10-ux-states.md §5.2.
      const confirmDialog = senderPage.getByRole('dialog', { name: /Catat transfer/ });
      await expect(confirmDialog).toBeVisible();
      await expect(confirmDialog.getByText(/Saldo Tunai Anda berkurang/)).toBeVisible();
      await expect(confirmDialog.getByText(/Saldo Tunai Istri E2E bertambah, seketika/)).toBeVisible();
      await confirmDialog.getByRole('button', { name: 'Catat', exact: true }).click();

      await expect(sheet).not.toBeVisible(DB_TIMEOUT);
      await expect(senderPage.getByText('Tersimpan', { exact: true })).toBeVisible(DB_TIMEOUT);

      // --- Both balances are correct, immediately, from BOTH sessions -
      // Sender's Tunai started at 0 and sent 1.000.000 out — the wallet
      // card shows the negative sign as-is (src/features/wallets/components/wallet-card.tsx
      // "a negative balance ... is a meaningful, must-be-visible state").
      const senderTunai = await tunaiBalanceText(senderPage);
      await expect(senderTunai).toContainText('−Rp1.000.000', DB_TIMEOUT);

      const receiverTunai = await tunaiBalanceText(receiverPage);
      await expect(receiverTunai).toContainText('Rp1.000.000', DB_TIMEOUT);

      // --- It shows up in the RECEIVER's Activity, unreviewed ---------
      await receiverPage.goto('/activity');
      await expect(receiverPage.getByRole('heading', { name: /Belum ditinjau/ })).toBeVisible(DB_TIMEOUT);
      await expect(receiverPage.getByText('Suami E2E mencatat')).toBeVisible();
      await expect(receiverPage.getByText('Transfer masuk ke Tunai')).toBeVisible();
      await expect(receiverPage.getByText('+Rp1.000.000')).toBeVisible();

      // The badge is visible on the receiver's context switcher.
      await receiverPage.goto('/');
      await expect(receiverPage.getByRole('button', { name: /aktivitas belum ditinjau/ }).first()).toBeVisible(
        DB_TIMEOUT,
      );

      // --- "Oke" acknowledges it — badge clears, card moves sections --
      await receiverPage.goto('/activity');
      await receiverPage.getByRole('button', { name: 'Oke' }).click();
      await expect(receiverPage.getByRole('heading', { name: /Belum ditinjau/ })).toHaveCount(0, DB_TIMEOUT);
      await expect(receiverPage.getByRole('heading', { name: 'Sebelumnya' })).toBeVisible();

      // The SENDER's own ledger is completely unaffected by the receiver
      // acknowledging — a read-only action on the receiver's own row.
      const senderTunaiAfter = await tunaiBalanceText(senderPage);
      await expect(senderTunaiAfter).toContainText('−Rp1.000.000', DB_TIMEOUT);
    } finally {
      await senderContext.close();
      await receiverContext.close();
      await deleteTestHousehold(householdId);
      await deleteTestUser(sender.userId);
      await deleteTestUser(receiver.userId);
    }
  });

  test('receiver moves an incoming transfer to another wallet, then deletes it — sender untouched', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    const { owner: sender, member: receiver, householdId } = await seedHouseholdPair('Wahid E2E', 'Adi E2E');

    // A second wallet for the receiver to move the entry INTO — seeded
    // directly, the same shortcut e2e/transfers.spec.ts's OWN sibling test
    // takes for wallet setup that isn't the thing under test here.
    const receiverSecondWalletId = uuidv7();
    await dbWrite.insert(wallets).values({
      id: receiverSecondWalletId,
      userId: receiver.userId,
      name: 'GoPay E2E',
      type: 'ewallet',
    });

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

      // Sender records Rp250.000 -> receiver's Tunai.
      await senderPage.goto('/');
      await senderPage.getByRole('button', { name: 'Tambah transaksi' }).click();
      const sheet = senderPage.getByRole('dialog', { name: 'Tambah transaksi' });
      await sheet.getByRole('tab', { name: 'Transfer' }).click();
      await sheet.getByRole('tab', { name: 'Ke anggota keluarga' }).click();
      for (const digit of ['2', '5', '0', '0', '0', '0']) {
        await sheet.getByRole('button', { name: digit, exact: true }).click();
      }
      await sheet.getByRole('button', { name: /^Dompet tujuan:/ }).click();
      await senderPage.getByRole('dialog', { name: 'Pilih anggota' }).getByRole('button', { name: /Adi E2E/ }).click();
      await senderPage.getByRole('dialog', { name: 'Rekening Adi E2E' }).getByRole('button', { name: 'Tunai' }).click();
      await sheet.getByRole('button', { name: 'Simpan' }).click();
      await senderPage.getByRole('dialog', { name: /Catat transfer/ }).getByRole('button', { name: 'Catat', exact: true }).click();
      await expect(senderPage.getByText('Tersimpan', { exact: true })).toBeVisible(DB_TIMEOUT);

      // --- Receiver: "Pindahkan" from the full unreviewed card --------
      await receiverPage.goto('/activity');
      // Scoped by the "Belum ditinjau" section (not a fragile DOM-depth
      // walk up from the sender-name text) — only one card exists here.
      const unreviewedSection = receiverPage
        .locator('section')
        .filter({ has: receiverPage.getByRole('heading', { name: /Belum ditinjau/ }) });
      await expect(unreviewedSection.getByText('Wahid E2E mencatat')).toBeVisible(DB_TIMEOUT);
      await unreviewedSection.getByRole('button', { name: 'Pindahkan' }).click();
      const moveSheet = receiverPage.getByRole('dialog', { name: 'Pindahkan ke dompet' });
      await expect(moveSheet).toBeVisible();
      await moveSheet.getByRole('button', { name: 'GoPay E2E' }).click();
      await expect(receiverPage.getByText('Dipindahkan', { exact: true })).toBeVisible(DB_TIMEOUT);

      await receiverPage.goto('/wallets');
      await expect(receiverPage.getByRole('link', { name: /Tunai/ })).toContainText('Rp0', DB_TIMEOUT);
      await expect(receiverPage.getByRole('link', { name: /GoPay E2E/ })).toContainText('Rp250.000', DB_TIMEOUT);

      // --- Receiver: "Hapus" — void biasa + undo, sender untouched ----
      await receiverPage.goto('/activity');
      await receiverPage.getByRole('button', { name: 'Hapus' }).click();
      await expect(receiverPage.getByText('Dihapus dari Aktivitas', { exact: true })).toBeVisible(DB_TIMEOUT);

      await receiverPage.goto('/wallets');
      await expect(receiverPage.getByRole('link', { name: /GoPay E2E/ })).toContainText('Rp0', DB_TIMEOUT);

      const senderTunai = await tunaiBalanceText(senderPage);
      await expect(senderTunai).toContainText('−Rp250.000', DB_TIMEOUT);
    } finally {
      await senderContext.close();
      await receiverContext.close();
      await deleteTestHousehold(householdId);
      await deleteTestUser(sender.userId);
      await deleteTestUser(receiver.userId);
    }
  });
});
