import { and, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '../src/lib/db/write';
import { householdMembers, transactions, wallets } from '../src/lib/db/schema';
import { deleteTestHousehold, deleteTestUser } from '../src/lib/db/__tests__/test-helpers';
import { seedSessionUser, setSessionCookie } from './helpers/auth-session';
import { test, expect } from './fixtures/base';

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

    try {
      await setSessionCookie(ownerContext, owner.sessionToken);
      await setSessionCookie(memberContext, member.sessionToken);
      const ownerPage = await ownerContext.newPage();
      const memberPage = await memberContext.newPage();

      await ownerPage.goto('/household/new');
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

        expect(await isWalletVisibleToHousehold()).toBe(true);

        // Turning OFF — frictionless, no dialog at all.
        await shareSwitch.click();
        await expect(shareSwitch).toHaveAttribute('aria-checked', 'false', DB_TIMEOUT);
        await expect(memberPage.getByRole('dialog')).toHaveCount(0);

        expect(await isWalletVisibleToHousehold()).toBe(false);
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

    try {
      await setSessionCookie(ownerContext, owner.sessionToken);
      await setSessionCookie(memberContext, member.sessionToken);
      const ownerPage = await ownerContext.newPage();
      const memberPage = await memberContext.newPage();

      await ownerPage.goto('/household/new');
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
        await ownerPage.getByRole('button', { name: 'Tambah transaksi' }).click();
        await expect(addSheet).toBeVisible();
        for (const digit of ['2', '0', '0', '0', '0']) {
          await addSheet.getByRole('button', { name: digit, exact: true }).click();
        }
        await addSheet.getByRole('button', { name: 'Makan & Minum' }).click();
        await addSheet.getByRole('button', { name: 'Simpan' }).click();
        await expect(addSheet).not.toBeVisible(DB_TIMEOUT);

        // Member visits the household expenses page — never navigated there
        // by the owner, proving the tag (not context) drives visibility.
        await memberPage.goto(`/household/${householdId}/transactions`);
        await expect(memberPage.getByText('Rp45.000')).toBeVisible(DB_TIMEOUT);
        await expect(memberPage.getByText('Owner Pengeluaran').first()).toBeVisible();
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

    try {
      await setSessionCookie(ownerContext, owner.sessionToken);
      const page = await ownerContext.newPage();

      await page.goto('/household/new');
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

        await expect(page.getByText('2 transaksi ditandai ke Keluarga Massal')).toBeVisible(DB_TIMEOUT);

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
});
