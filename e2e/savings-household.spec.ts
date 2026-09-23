import { uuidv7 } from 'uuidv7';
import { dbWrite } from '../src/lib/db/write';
import { householdMembers } from '../src/lib/db/schema';
import { deleteTestHousehold, deleteTestUser } from '../src/lib/db/__tests__/test-helpers';
import { seedSessionUser, setSessionCookie } from './helpers/auth-session';
import { test, expect, suppressDevOverlay, waitForDomToSettle } from './fixtures/base';

/**
 * tasks/15-savings-goals — two real user sessions contributing to the SAME
 * shared goal, docs/14-testing-strategy.md §7's two-context pattern (same
 * technique as e2e/household-membership.spec.ts). Proves spec.md's shared-
 * goal example table for real: each member's contribution draws from THEIR
 * OWN wallet, the goal's total and per-member breakdown are both correct
 * from either session, and a member's withdraw sheet only ever offers up to
 * THEIR OWN net-funded amount — never the goal's total.
 *
 * UI copy follows docs/08-copywriting.md's glossary: a savings goal is a
 * "target" in user-facing text, never "goal" — "Buat target", "Tambah
 * dana", "Tarik dana".
 *
 * The household membership is seeded directly (status='active') rather than
 * through the invitation flow — same reasoning as
 * household-membership.spec.ts's second test: this suite isn't exercising
 * invitations, just what two already-joined members can do with a shared
 * goal.
 */
const DB_TIMEOUT = { timeout: 20000 };

test.describe('shared savings goal — two-context flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('two members contribute to the same shared goal from their own wallets; total and per-member breakdown are correct from both sessions', async ({
    browser,
    baseURL,
  }) => {
    // Two full contribution flows (each: open sheet, switch wallet picker,
    // type 7 keypad digits, save) across two real wallet-funding steps, a
    // goal creation, two breakdown re-reads, and a withdraw-sheet check —
    // genuinely more real browser/DB round trips than any single-context
    // spec in this suite. 120s was observed to be tight specifically on the
    // Mobile Chrome (Pixel 5) project under concurrent load (this exact
    // test passed in 1.2m on Desktop Chrome the same run) — same
    // "legitimately heavy flow" reasoning as household-membership.spec.ts's
    // own generous timeouts, just for a bigger flow.
    test.setTimeout(180_000);

    const owner = await seedSessionUser({ onboarded: true, name: 'Wahid E2E' });
    const member = await seedSessionUser({ onboarded: true, name: 'Istri E2E' });

    const ownerContext = await browser.newContext({ baseURL });
    const memberContext = await browser.newContext({ baseURL });
    // A manually-created browser.newContext() never runs fixtures/base.ts's
    // `page` fixture override, so the dev overlay's issues badge — which
    // sits exactly where AmountKeypad renders (contribute-sheet.tsx uses
    // the same shared keypad as the Add Transaction sheet) — silently
    // intercepts every keypad tap, hanging for the full test timeout with
    // no application error at all (same root cause fixed in
    // e2e/sharing.spec.ts and e2e/transfers-member.spec.ts).
    await suppressDevOverlay(ownerContext);
    await suppressDevOverlay(memberContext);

    try {
      await setSessionCookie(ownerContext, owner.sessionToken);
      await setSessionCookie(memberContext, member.sessionToken);

      const ownerPage = await ownerContext.newPage();
      const memberPage = await memberContext.newPage();

      // Owner creates the household via the real UI.
      await ownerPage.goto('/household/new');
      await waitForDomToSettle(ownerPage);
      await ownerPage.getByLabel('Nama keluarga').fill('Keluarga Tabungan E2E');
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

        // Each side funds their own wallet to contribute from.
        async function fundWallet(page: typeof ownerPage, name: string, amount: string) {
          await page.goto('/wallets');
          await page.getByRole('button', { name: 'Tambah dompet' }).click();
          const sheet = page.getByRole('dialog', { name: 'Tambah dompet' });
          await sheet.getByLabel('Nama dompet').fill(name);
          await sheet.getByLabel('Saldo awal (Rp)').fill(amount);
          await sheet.getByRole('button', { name: 'Tambah dompet' }).click();
          await expect(sheet).not.toBeVisible(DB_TIMEOUT);
        }
        await fundWallet(ownerPage, 'BCA Wahid', '10000000');
        await fundWallet(memberPage, 'BRI Istri', '10000000');

        // Owner creates the shared goal from the household's savings page.
        await ownerPage.goto(`/household/${householdId}/savings`);
        await ownerPage.getByRole('button', { name: 'Buat target' }).click();
        const createSheet = ownerPage.getByRole('dialog', { name: 'Target tabungan baru' });
        await createSheet.getByLabel('Nama target').fill('Liburan Keluarga');
        await createSheet.getByLabel('Target (Rp)').fill('20000000');
        await createSheet.getByRole('button', { name: 'Buat target' }).click();
        await expect(createSheet).not.toBeVisible(DB_TIMEOUT);

        // Member sees the SAME shared goal on their own household savings page.
        await memberPage.goto(`/household/${householdId}/savings`);
        await expect(memberPage.getByRole('link', { name: /Liburan Keluarga/ })).toBeVisible(DB_TIMEOUT);

        async function contribute(page: typeof ownerPage, walletName: string, digits: string[]) {
          await page.getByRole('link', { name: /Liburan Keluarga/ }).click();
          await expect(page).toHaveURL(/\/wealth\/savings\/[^/]+$/, DB_TIMEOUT);
          await page.getByRole('button', { name: 'Tambah dana' }).click();
          const sheet = page.getByRole('dialog', { name: /^Tambah dana ke/ });
          await expect(sheet).toBeVisible();
          await sheet.getByRole('button', { name: /^Dompet sumber:/ }).click();
          await page.getByRole('dialog', { name: 'Pilih dompet' }).getByRole('button', { name: walletName }).click();
          for (const digit of digits) {
            await sheet.getByRole('button', { name: digit, exact: true }).click();
          }
          await sheet.getByRole('button', { name: 'Simpan' }).click();
          await expect(sheet).not.toBeVisible(DB_TIMEOUT);
        }

        // Owner contributes Rp5.000.000, member contributes Rp3.000.000 —
        // spec.md's own example numbers.
        await ownerPage.goto(`/household/${householdId}/savings`);
        await contribute(ownerPage, 'BCA Wahid', ['5', '0', '0', '0', '0', '0', '0']);

        await memberPage.goto(`/household/${householdId}/savings`);
        await contribute(memberPage, 'BRI Istri', ['3', '0', '0', '0', '0', '0', '0']);

        // Each wallet moved by EXACTLY its own contribution — never the other's.
        await ownerPage.goto('/wallets');
        await expect(ownerPage.getByRole('link', { name: /BCA Wahid/ })).toContainText('Rp5.000.000', DB_TIMEOUT);
        await memberPage.goto('/wallets');
        await expect(memberPage.getByRole('link', { name: /BRI Istri/ })).toContainText('Rp7.000.000', DB_TIMEOUT);

        // Total and per-member breakdown are correct from BOTH sessions —
        // spec.md's table: Wahid Rp5jt, Istri Rp3jt, Total Rp8jt -> 40%.
        // Scoped to the breakdown region specifically (not a page-wide text
        // search): the contribution-history section below it repeats each
        // name and a SIGNED version of their amount ("Kontribusi — Wahid
        // E2E" / "+Rp5.000.000"), which would substring-match the same
        // plain-text queries and make them ambiguous.
        async function assertBreakdown(page: typeof ownerPage) {
          await page.goto(`/household/${householdId}/savings`);
          await page.getByRole('link', { name: /Liburan Keluarga/ }).click();
          await expect(page).toHaveURL(/\/wealth\/savings\/[^/]+$/, DB_TIMEOUT);
          const breakdown = page.getByRole('region', { name: 'Kontribusi per anggota' });
          await expect(breakdown).toBeVisible(DB_TIMEOUT);
          await expect(breakdown.getByText('Wahid E2E')).toBeVisible();
          await expect(breakdown.getByText('Istri E2E')).toBeVisible();
          await expect(breakdown.getByText('Rp5.000.000')).toBeVisible();
          await expect(breakdown.getByText('Rp3.000.000')).toBeVisible();
          await expect(breakdown.getByText('→ 40%')).toBeVisible();
        }
        await assertBreakdown(ownerPage);
        await assertBreakdown(memberPage);

        // Isolation: the member's own withdraw sheet offers only THEIR OWN
        // Rp3.000.000 — never the goal's Rp8.000.000 total.
        await memberPage.getByRole('button', { name: 'Tarik dana' }).click();
        const withdrawSheet = memberPage.getByRole('dialog', { name: /^Tarik dana dari/ });
        await expect(withdrawSheet).toBeVisible();
        await expect(withdrawSheet.getByText('Rp3.000.000')).toBeVisible();
        await expect(withdrawSheet.getByText('Rp8.000.000')).toHaveCount(0);
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
