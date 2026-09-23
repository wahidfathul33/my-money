import { and, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '../src/lib/db/write';
import { householdMembers, transactions, wallets } from '../src/lib/db/schema';
import { deleteTestHousehold, deleteTestUser } from '../src/lib/db/__tests__/test-helpers';
import { seedSessionUser, setSessionCookie } from './helpers/auth-session';
import { test, expect, suppressDevOverlay, waitForDomToSettle } from './fixtures/base';

/**
 * tasks/12-sharing-and-privacy — the two-context flows spec.md's
 * verification section names explicitly: "aktifkan berbagi → terlihat →
 * matikan → hilang" and "tandai pengeluaran → muncul di pengeluaran
 * keluarga dengan nama pembayar", plus todo.md's bulk-tagging flow.
 *
 * Same pattern as e2e/household-membership.spec.ts (task 11's): two real
 * sessions, two `browserContext`s, driving the SAME running app against the
 * SAME real database. The second member's ACTIVE membership is seeded
 * directly (`household_members` insert) rather than driven through the
 * real invite/accept UI — that flow is already covered end to end by task
 * 11's own suite; re-running it here would only add time without adding
 * confidence in anything THIS task owns.
 *
 * **Deviation from spec.md's literal "→ terlihat" wording:** the actual
 * household WEALTH DISPLAY page is task 19's ("agregasi kekayaan keluarga"
 * — explicitly out of this task's scope, spec.md "Tidak termasuk"). What
 * this task owns and can prove end to end is the MECHANISM: the toggle UI,
 * its confirmation dialog, and that the underlying visibility predicate
 * (src/lib/visibility/household-items.ts) resolves correctly the instant
 * the switch flips — asserted directly against the database, the same way
 * e2e/household-membership.spec.ts already asserts `share_wealth` at the DB
 * level for the "joining shares nothing" guarantee. See this task's final
 * report for the full reasoning.
 */

const DB_TIMEOUT = { timeout: 20_000 };

test.describe('sharing & privacy — two-context flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('share_wealth: turning ON requires confirmation and is reflected immediately; turning OFF is instant with no dialog', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);

    const owner = await seedSessionUser({ onboarded: true, name: 'Owner E2E' });
    const member = await seedSessionUser({ onboarded: true, name: 'Member E2E' });

    const ownerContext = await browser.newContext({ baseURL });
    const memberContext = await browser.newContext({ baseURL });
    // A manually-created browser.newContext() never runs fixtures/base.ts's
    // `page` fixture override, so the dev overlay's issues badge — which
    // sits exactly where the Add Transaction sheet's amount keypad renders
    // — silently intercepts every keypad tap, and Playwright's actionability
    // check retries the same click for the full test timeout with no
    // application error at all (root-caused in e2e/transfers-member.spec.ts's
    // own header comment; this file just hadn't been patched yet).
    await suppressDevOverlay(ownerContext);
    await suppressDevOverlay(memberContext);

    try {
      await setSessionCookie(ownerContext, owner.sessionToken);
      await setSessionCookie(memberContext, member.sessionToken);
      const ownerPage = await ownerContext.newPage();
      const memberPage = await memberContext.newPage();

      await ownerPage.goto('/household/new');
      // Manually-created context's page never gets the `page` fixture's
      // auto-`waitForDomToSettle` wrapping — same transient duplicate-DOM
      // race as the memberPage navigation further down this file, just at
      // a different spot (getByLabel resolving to 2 elements right after
      // this goto).
      await waitForDomToSettle(ownerPage);
      await ownerPage.getByLabel('Nama keluarga').fill('Keluarga Berbagi');
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

        // Every onboarded user already has a starter "Tunai" wallet
        // (seedNewUser, run by seedSessionUser) — nothing to create here.
        const [memberWallet] = await dbWrite
          .select({ id: wallets.id })
          .from(wallets)
          .where(eq(wallets.userId, member.userId));
        expect(memberWallet).toBeDefined();

        async function isWalletVisibleToHousehold(): Promise<boolean> {
          const rows = await dbWrite
            .select({ id: wallets.id })
            .from(wallets)
            .innerJoin(
              householdMembers,
              and(
                eq(householdMembers.userId, wallets.userId),
                eq(householdMembers.householdId, householdId),
                eq(householdMembers.status, 'active'),
                eq(householdMembers.shareWealth, true),
              ),
            )
            .where(and(eq(wallets.id, memberWallet!.id), eq(wallets.excludeFromHousehold, false)));
          return rows.length > 0;
        }

        expect(await isWalletVisibleToHousehold()).toBe(false); // default privacy

        await memberPage.goto('/settings/sharing');
        await expect(memberPage.getByText('Keluarga Berbagi').first()).toBeVisible(DB_TIMEOUT);

        const shareSwitch = memberPage.getByRole('switch', { name: 'Bagikan kekayaan ke Keluarga Berbagi' });
        await expect(shareSwitch).toHaveAttribute('aria-checked', 'false');

        // Turning ON — must go through the confirmation dialog.
        await shareSwitch.click();
        const confirmDialog = memberPage.getByRole('dialog', {
          name: 'Bagikan kekayaan Anda ke Keluarga Berbagi?',
        });
        await expect(confirmDialog).toBeVisible();
        await expect(confirmDialog.getByText('Mereka TIDAK akan melihat:')).toBeVisible();
        await expect(confirmDialog.getByText('Transaksi Anda')).toBeVisible();
        await confirmDialog.getByRole('button', { name: 'Bagikan' }).click();
        await expect(confirmDialog).not.toBeVisible(DB_TIMEOUT);
        await expect(shareSwitch).toHaveAttribute('aria-checked', 'true', DB_TIMEOUT);

        // `expect.poll`, not a one-shot query: `aria-checked` flips
        // OPTIMISTICALLY, synchronously, the instant the dialog's "Bagikan"
        // is clicked (src/features/sharing/components/share-wealth-toggle.tsx's
        // `confirmShare` sets local state before its `startTransition` async
        // call even begins) — so by the time this line runs, the real
        // `setShareWealthAction` write may genuinely still be in flight.
        // Confirmed by instrumenting this exact spot: a bare one-shot query
        // here loses that race under real (non-instant) Server Action
        // round-trip latency, independent of anything else in the test.
        await expect.poll(isWalletVisibleToHousehold, DB_TIMEOUT).toBe(true);

        // Turning OFF — frictionless, no dialog at all. Same optimistic-
        // flip-before-write shape, same reasoning for polling here too.
        await shareSwitch.click();
        await expect(shareSwitch).toHaveAttribute('aria-checked', 'false', DB_TIMEOUT);
        await expect(memberPage.getByRole('dialog')).toHaveCount(0);

        await expect.poll(isWalletVisibleToHousehold, DB_TIMEOUT).toBe(false);
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

  test('tagging an expense with 🏠 makes it visible on the household expenses page with the payer\'s name; an untagged expense stays private', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);

    const owner = await seedSessionUser({ onboarded: true, name: 'Owner Pengeluaran' });
    const member = await seedSessionUser({ onboarded: true, name: 'Member Pengeluaran' });

    const ownerContext = await browser.newContext({ baseURL });
    const memberContext = await browser.newContext({ baseURL });
    // A manually-created browser.newContext() never runs fixtures/base.ts's
    // `page` fixture override, so the dev overlay's issues badge — which
    // sits exactly where the Add Transaction sheet's amount keypad renders
    // — silently intercepts every keypad tap, and Playwright's actionability
    // check retries the same click for the full test timeout with no
    // application error at all (root-caused in e2e/transfers-member.spec.ts's
    // own header comment; this file just hadn't been patched yet).
    await suppressDevOverlay(ownerContext);
    await suppressDevOverlay(memberContext);

    try {
      await setSessionCookie(ownerContext, owner.sessionToken);
      await setSessionCookie(memberContext, member.sessionToken);
      const ownerPage = await ownerContext.newPage();
      const memberPage = await memberContext.newPage();
      // The mobile/tablet icon-rail sidebar's "Tambah transaksi" button
      // (aria-label, src/components/layout/sidebar.tsx lines ~89-96) only
      // renders below the `lg:` (1024px) breakpoint — the Desktop Chrome
      // project's default 1280px viewport instead renders the wide
      // sidebar's own "+ Tambah" button (visible text, different accessible
      // name, line ~190), so `getByRole('button', { name: 'Tambah transaksi' })`
      // below matches nothing there and hangs for the full test timeout
      // waiting for an element that will never appear — same viewport
      // convention as e2e/transfers-member.spec.ts's own two-context tests.
      await ownerPage.setViewportSize({ width: 390, height: 844 });
      await memberPage.setViewportSize({ width: 390, height: 844 });

      await ownerPage.goto('/household/new');
      await waitForDomToSettle(ownerPage);
      await ownerPage.getByLabel('Nama keluarga').fill('Keluarga Pengeluaran');
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

        // Owner records a TAGGED expense — real Add Transaction sheet, real
        // Server Action. The 🏠 toggle only appears because owner is now an
        // active member of a household (src/features/transactions/sheet-data.ts).
        await ownerPage.goto('/');
        await ownerPage.getByRole('button', { name: 'Tambah transaksi' }).click();
        const addSheet = ownerPage.getByRole('dialog', { name: 'Tambah transaksi' });
        await expect(addSheet).toBeVisible();
        for (const digit of ['4', '5', '0', '0', '0']) {
          await addSheet.getByRole('button', { name: digit, exact: true }).click();
        }
        await addSheet.getByRole('button', { name: 'Makan & Minum' }).click();
        await addSheet.getByRole('button', { name: 'Tandai ke keluarga' }).click();
        await expect(addSheet.getByRole('button', { name: /^Ditandai ke/ })).toBeVisible();
        await addSheet.getByRole('button', { name: 'Simpan' }).click();
        await expect(addSheet).not.toBeVisible(DB_TIMEOUT);
        await expect(ownerPage.getByText('Tersimpan', { exact: true })).toBeVisible(DB_TIMEOUT);
        // The "Tersimpan" toast floats above the bottom nav/FAB (same fixed-
        // viewport region) and only auto-dismisses after 5s
        // (src/components/ui/toast.tsx) — waiting it out first avoids the
        // FAB tap below racing a toast still animating out.
        await expect(ownerPage.getByText('Tersimpan', { exact: true })).not.toBeVisible({ timeout: 8000 });

        // Owner records a SECOND, UNTAGGED expense — the 🏠 toggle stays off.
        // Deliberately a DIFFERENT category than the first transaction
        // (Transportasi, not Makan & Minum): tasks/12-sharing-and-privacy
        // spec.md's "Pilihan household terakhir diingat per kategori"
        // (src/features/transactions/components/add-transaction-sheet.tsx's
        // `handleCategoryChange`) prefills the 🏠 toggle from whatever
        // household was last used for the SAME category — reusing "Makan &
        // Minum" here would auto-tag this expense too, which is the
        // feature working as designed, not something this test should
        // fight by clicking the toggle back off.
        await ownerPage.getByRole('button', { name: 'Tambah transaksi' }).click();
        await expect(addSheet).toBeVisible();
        for (const digit of ['2', '0', '0', '0', '0']) {
          await addSheet.getByRole('button', { name: digit, exact: true }).click();
        }
        await addSheet.getByRole('button', { name: 'Transportasi' }).click();
        await expect(addSheet.getByRole('button', { name: 'Tandai ke keluarga' })).toBeVisible();
        await addSheet.getByRole('button', { name: 'Simpan' }).click();
        await expect(addSheet).not.toBeVisible(DB_TIMEOUT);

        // Member visits the household expenses page — never navigated there
        // by the owner, proving the tag (not context) drives visibility.
        // `memberPage` is a manually-created context's page, so it never got
        // the `page` fixture's auto-`waitForDomToSettle` wrapping (only
        // applied to the `page` fixture itself — see fixtures/base.ts's own
        // doc comment on `waitForDomToSettle`) — without it, the assertion
        // below can race a transient duplicate-render right after
        // navigation and hit a strict-mode "resolved to 2 elements" error.
        await memberPage.goto(`/household/${householdId}/transactions`);
        await waitForDomToSettle(memberPage);
        await expect(memberPage.getByText('Rp45.000')).toBeVisible(DB_TIMEOUT);
        await expect(memberPage.getByText('Owner Pengeluaran').first()).toBeVisible();
        // docs/09-screen-specs.md §13's exact meta row: payer name AND
        // wallet NAME — "Tunai" is every onboarded user's starter wallet
        // (seedNewUser), never its balance.
        await expect(memberPage.getByText('Tunai').first()).toBeVisible();
        await expect(memberPage.getByText('Rp20.000')).toHaveCount(0); // untagged — never shown

        // Never a wallet balance anywhere on this page.
        await expect(memberPage.getByText('Saldo')).toHaveCount(0);
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

  test('bulk-tagging old transactions from personal history', async ({ browser, baseURL }) => {
    test.setTimeout(90_000);

    const owner = await seedSessionUser({ onboarded: true, name: 'Owner Massal' });
    const ownerContext = await browser.newContext({ baseURL });
    await suppressDevOverlay(ownerContext);

    try {
      await setSessionCookie(ownerContext, owner.sessionToken);
      const page = await ownerContext.newPage();
      // See the equivalent comment above (test 2 in this file) — the
      // "Tambah transaksi" accessible name this test clicks below only
      // exists below the `lg:` desktop breakpoint.
      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto('/household/new');
      await waitForDomToSettle(page);
      await page.getByLabel('Nama keluarga').fill('Keluarga Massal');
      await page.getByRole('button', { name: 'Buat Keluarga' }).click();
      await expect(page).toHaveURL(/\/household\/(?!new$)[^/]+$/, DB_TIMEOUT);
      const householdId = page.url().split('/household/')[1]!.split(/[/?]/)[0]!;

      try {
        // Two OLD, untagged expenses — recorded before the household existed
        // conceptually (todo.md's whole reason for this feature).
        for (const digits of [['1', '0', '0', '0', '0'], ['1', '5', '0', '0', '0']]) {
          await page.goto('/');
          await page.getByRole('button', { name: 'Tambah transaksi' }).click();
          const addSheet = page.getByRole('dialog', { name: 'Tambah transaksi' });
          await expect(addSheet).toBeVisible();
          for (const digit of digits) {
            await addSheet.getByRole('button', { name: digit, exact: true }).click();
          }
          await addSheet.getByRole('button', { name: 'Makan & Minum' }).click();
          await addSheet.getByRole('button', { name: 'Simpan' }).click();
          await expect(addSheet).not.toBeVisible(DB_TIMEOUT);
          // See the identical wait in the tagging test above — avoids the
          // next iteration's FAB tap racing the "Tersimpan" toast's exit animation.
          await expect(page.getByText('Tersimpan', { exact: true })).toBeVisible(DB_TIMEOUT);
          await expect(page.getByText('Tersimpan', { exact: true })).not.toBeVisible({ timeout: 8000 });
        }

        await page.goto('/transactions');
        await page.getByRole('button', { name: 'Pilih' }).click();

        const rows = page.getByTestId('transaction-row');
        await expect(rows).toHaveCount(2, DB_TIMEOUT);
        await rows.nth(0).click();
        await rows.nth(1).click();

        await expect(page.getByText('2 dipilih')).toBeVisible();
        await page.getByRole('button', { name: 'Tandai ke keluarga' }).click();

        const confirmDialog = page.getByRole('dialog', { name: 'Tandai 2 transaksi ke Keluarga Massal?' });
        await expect(confirmDialog).toBeVisible();
        await confirmDialog.getByRole('button', { name: 'Tandai', exact: true }).click();

        // `exact: true` — same reasoning as the `Tersimpan` toast assertions
        // above (this file's own established pattern): the toast's
        // aria-live mirror renders "Notification 2 transaksi ditandai ke
        // Keluarga Massal…", which substring-matches this locator too
        // without `exact`.
        await expect(page.getByText('2 transaksi ditandai ke Keluarga Massal', { exact: true })).toBeVisible(
          DB_TIMEOUT,
        );

        const taggedCount = await dbWrite
          .select({ id: transactions.id })
          .from(transactions)
          .where(and(eq(transactions.userId, owner.userId), eq(transactions.householdId, householdId)));
        expect(taggedCount).toHaveLength(2);
      } finally {
        await deleteTestHousehold(householdId);
      }
    } finally {
      await ownerContext.close();
      await deleteTestUser(owner.userId);
    }
  });

  /**
   * tasks/22-settings-sharing-pwa — todo.md's "'Berhenti berbagi semuanya' +
   * konfirmasi jumlah" and "E2E: 'berhenti berbagi semuanya' mencabut
   * seluruh grant". The caller shares wealth to TWO households at once;
   * one confirmed click revokes both, and the confirmation names the count
   * (2) before it happens.
   */
  test('"Berhenti berbagi semuanya" confirms with the exact count and revokes share_wealth in every household at once', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);

    const member = await seedSessionUser({ onboarded: true, name: 'Member Berhenti' });
    const ownerA = await seedSessionUser({ onboarded: true, name: 'Owner A' });
    const ownerB = await seedSessionUser({ onboarded: true, name: 'Owner B' });

    const memberContext = await browser.newContext({ baseURL });
    const ownerAContext = await browser.newContext({ baseURL });
    const ownerBContext = await browser.newContext({ baseURL });
    await suppressDevOverlay(memberContext);
    await suppressDevOverlay(ownerAContext);
    await suppressDevOverlay(ownerBContext);

    try {
      await setSessionCookie(memberContext, member.sessionToken);
      await setSessionCookie(ownerAContext, ownerA.sessionToken);
      await setSessionCookie(ownerBContext, ownerB.sessionToken);

      const ownerAPage = await ownerAContext.newPage();
      const ownerBPage = await ownerBContext.newPage();

      await ownerAPage.goto('/household/new');
      await waitForDomToSettle(ownerAPage);
      await ownerAPage.getByLabel('Nama keluarga').fill('Keluarga Alpha');
      await ownerAPage.getByRole('button', { name: 'Buat Keluarga' }).click();
      await expect(ownerAPage).toHaveURL(/\/household\/(?!new$)[^/]+$/, DB_TIMEOUT);
      const householdA = ownerAPage.url().split('/household/')[1]!.split(/[/?]/)[0]!;

      await ownerBPage.goto('/household/new');
      await waitForDomToSettle(ownerBPage);
      await ownerBPage.getByLabel('Nama keluarga').fill('Keluarga Beta');
      await ownerBPage.getByRole('button', { name: 'Buat Keluarga' }).click();
      await expect(ownerBPage).toHaveURL(/\/household\/(?!new$)[^/]+$/, DB_TIMEOUT);
      const householdB = ownerBPage.url().split('/household/')[1]!.split(/[/?]/)[0]!;

      try {
        // Member joins both, sharing wealth in both — seeded directly
        // (already active + share_wealth true), same shortcut the other
        // tests in this file use for the invite/accept step itself.
        await dbWrite.insert(householdMembers).values([
          {
            id: uuidv7(),
            householdId: householdA,
            userId: member.userId,
            role: 'member',
            status: 'active',
            shareWealth: true,
            joinedAt: new Date(),
          },
          {
            id: uuidv7(),
            householdId: householdB,
            userId: member.userId,
            role: 'member',
            status: 'active',
            shareWealth: true,
            joinedAt: new Date(),
          },
        ]);

        const memberPage = await memberContext.newPage();
        await memberPage.goto('/settings/sharing');
        // A manually-created page bypasses fixtures/base.ts's own
        // auto-`waitForDomToSettle` wrapping (only applied to the `page`
        // fixture Playwright injects into the test callback) — see that
        // file's header comment for the transient double-render this
        // absorbs, and e2e/settings-data-pwa.spec.ts for the identical fix.
        await waitForDomToSettle(memberPage);
        await expect(memberPage.getByText('Keluarga Alpha')).toBeVisible(DB_TIMEOUT);
        await expect(memberPage.getByText('Keluarga Beta')).toBeVisible();

        await memberPage.getByRole('button', { name: 'Berhenti berbagi semuanya' }).click();
        const confirmDialog = memberPage.getByRole('dialog', { name: 'Berhenti berbagi semuanya?' });
        await expect(confirmDialog).toBeVisible();
        // States the exact number of households currently sharing.
        await expect(confirmDialog.getByText('2 keluarga')).toBeVisible();
        await confirmDialog.getByRole('button', { name: 'Berhenti berbagi' }).click();
        await expect(confirmDialog).not.toBeVisible(DB_TIMEOUT);

        // The button itself disappears once nothing is left to stop sharing.
        await expect(memberPage.getByRole('button', { name: 'Berhenti berbagi semuanya' })).toHaveCount(0, DB_TIMEOUT);

        const rows = await dbWrite
          .select({ householdId: householdMembers.householdId, shareWealth: householdMembers.shareWealth })
          .from(householdMembers)
          .where(eq(householdMembers.userId, member.userId));
        expect(rows).toHaveLength(2);
        for (const row of rows) {
          expect(row.shareWealth).toBe(false);
        }
      } finally {
        await deleteTestHousehold(householdA);
        await deleteTestHousehold(householdB);
      }
    } finally {
      await memberContext.close();
      await ownerAContext.close();
      await ownerBContext.close();
      await deleteTestUser(member.userId);
      await deleteTestUser(ownerA.userId);
      await deleteTestUser(ownerB.userId);
    }
  });
});
