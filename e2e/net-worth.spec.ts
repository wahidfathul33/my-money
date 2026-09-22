import { eq } from 'drizzle-orm';
import { dbWrite } from '../src/lib/db/write';
import { wallets } from '../src/lib/db/schema';
import { createTestDebt } from '../src/lib/db/__tests__/test-helpers';
import { auditRouteA11y } from './helpers/a11y-check';
import { test, expect } from './fixtures/authenticated';

/**
 * tasks/19-net-worth — personal `/wealth/net-worth`. todo.md's E2E section:
 * "rincian menjumlah ke total di layar" and "tap baris komposisi → menuju
 * modul sumber".
 *
 * Data is seeded directly (starter wallet balance bumped, a debt inserted)
 * rather than driven through every module's own create UI — those flows
 * are already covered end to end by e2e/wallets.spec.ts and
 * e2e/debts.spec.ts; this suite's job is proving the NET WORTH PAGE's own
 * math and navigation, not re-proving wallet/debt creation.
 */
const DB_TIMEOUT = { timeout: 20_000 };

test.describe('Net worth — personal', () => {
  test('composition sums to the displayed total, and every composition row taps through to its source module', async ({
    page,
    authedUserId,
  }) => {
    test.setTimeout(60_000);

    // authedUserId (e2e/fixtures/authenticated.ts) already has one starter
    // "Tunai" wallet at balance 0 — bump it so there's a real cash asset.
    const [starterWallet] = await dbWrite
      .select({ id: wallets.id })
      .from(wallets)
      .where(eq(wallets.userId, authedUserId));
    await dbWrite.update(wallets).set({ balance: 2_000_000_00n }).where(eq(wallets.id, starterWallet!.id));

    // A liability: `affectsWallet: false` (test-helpers' default) so this
    // debt's own creation doesn't also touch the wallet balance above —
    // keeps the expected net worth an exact, easy-to-assert number.
    await createTestDebt(authedUserId, { initialAmount: 500_000_00n, remainingAmount: 500_000_00n });

    await page.goto('/wealth/net-worth');

    // Rp2.000.000 kas − Rp500.000 hutang = Rp1.500.000.
    await expect(page.getByText('Rp1.500.000', { exact: true })).toBeVisible(DB_TIMEOUT);

    await expect(page.getByRole('heading', { name: 'Komposisi Aset' })).toBeVisible();
    const kasRow = page.getByRole('link', { name: 'Lihat Kas' });
    await expect(kasRow).toBeVisible();
    await expect(kasRow).toContainText('Rp2.000.000');

    await expect(page.getByRole('heading', { name: 'Liabilitas' })).toBeVisible();
    const debtRow = page.getByRole('link', { name: 'Lihat Hutang' });
    await expect(debtRow).toBeVisible();
    await expect(debtRow).toContainText('Rp500.000');

    // Tap the Kas row -> /wallets (the source module for that composition line).
    await kasRow.click();
    await expect(page).toHaveURL(/\/wallets$/, DB_TIMEOUT);

    // Tap the Hutang row -> /wealth/debts.
    await page.goto('/wealth/net-worth');
    await page.getByRole('link', { name: 'Lihat Hutang' }).click();
    await expect(page).toHaveURL(/\/wealth\/debts$/, DB_TIMEOUT);
  });

  test('/wealth hub shows a Kekayaan Bersih entry that taps through to the detail page', async ({ page, authedUserId }) => {
    const [starterWallet] = await dbWrite
      .select({ id: wallets.id })
      .from(wallets)
      .where(eq(wallets.userId, authedUserId));
    await dbWrite.update(wallets).set({ balance: 750_000_00n }).where(eq(wallets.id, starterWallet!.id));

    await page.goto('/wealth');
    const netWorthCard = page.getByRole('link', { name: /Kekayaan Bersih/ });
    await expect(netWorthCard).toBeVisible(DB_TIMEOUT);
    await expect(netWorthCard).toContainText('Rp750.000');

    await netWorthCard.click();
    await expect(page).toHaveURL(/\/wealth\/net-worth$/, DB_TIMEOUT);
  });

  // /wealth/net-worth has no overflow or axe coverage anywhere
  // (tasks/23-hardening-and-launch's route audit). The default zero-balance
  // starter wallet is enough real content to audit.
  test('/wealth/net-worth — tanpa horizontal overflow, axe nol pelanggaran', async ({ page }) => {
    test.setTimeout(60_000);
    await auditRouteA11y(page, '/wealth/net-worth');
  });
});
