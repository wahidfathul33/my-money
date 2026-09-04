import { expect, test } from './fixtures/authenticated';
import { createTestWallet } from '../src/lib/db/__tests__/test-helpers';
import {
  getDefaultWalletAndCategory,
  seedExpenseTransactions,
  seedSelfTransfer,
} from './helpers/transactions-seed';

/**
 * e2e/transactions-history.spec.ts — tasks/09-transaction-history/spec.md's
 * own verification section: filter state survives a reload (proof it
 * really lives in the URL, not React state), infinite scroll loads a
 * second batch, and swipe-to-delete + undo work against a real browser
 * pointer-drag gesture.
 *
 * `authedUserId` (e2e/fixtures/authenticated.ts) already ran `seedNewUser`,
 * so the caller has a starter "Tunai" wallet and the 16 canonical
 * categories before any test starts.
 */
const DB_TIMEOUT = { timeout: 20_000 };

test.describe('Riwayat transaksi', () => {
  test.describe.configure({ retries: 2 });

  test('filter tipe berubah di URL, bertahan lewat reload dan back-navigation, dan dapat direset', async ({
    page,
    authedUserId,
  }) => {
    const { walletId, categoryId } = await getDefaultWalletAndCategory(authedUserId);
    await seedExpenseTransactions(authedUserId, walletId, categoryId, 1, { note: 'Filter target' });

    await page.goto('/transactions');
    await expect(page.getByTestId('transaction-list')).toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Filter target 0')).toBeVisible();

    // FilterBar's chips are `<Chip variant="filter">`, which render
    // `role="checkbox"` (src/components/ui/chip.tsx) — NOT `role="button"`,
    // even though the underlying element is a `<button>`.
    await page.getByRole('checkbox', { name: 'Tipe', exact: true }).click();
    await page.getByRole('dialog', { name: 'Pilih tipe' }).getByRole('button', { name: 'Pengeluaran' }).click();

    await expect(page).toHaveURL(/type=expense/);
    await expect(page.getByRole('checkbox', { name: 'Pengeluaran', exact: true })).toBeVisible();

    // Reload — proves the state really lives in the URL, not just React state.
    await page.reload();
    await expect(page).toHaveURL(/type=expense/);
    await expect(page.getByRole('checkbox', { name: 'Pengeluaran', exact: true })).toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Filter target 0')).toBeVisible();

    // router.replace, not push, for the filter change itself — navigating
    // away and back lands on the PRE-filter history entry, not a stack of
    // one entry per filter toggle.
    await page.goto('/wallets');
    await page.goBack();
    await expect(page).toHaveURL(/type=expense/, DB_TIMEOUT);
    await expect(page.getByRole('checkbox', { name: 'Pengeluaran', exact: true })).toBeVisible(DB_TIMEOUT);

    // "Semua" resets every filter — URL param disappears.
    await page.getByRole('checkbox', { name: 'Semua', exact: true }).click();
    await expect(page).not.toHaveURL(/type=expense/);
    await expect(page.getByRole('checkbox', { name: 'Tipe', exact: true })).toBeVisible();
  });

  test('infinite scroll memuat batch berikutnya melewati 30 item', async ({ page, authedUserId }) => {
    test.setTimeout(120_000);
    const { walletId, categoryId } = await getDefaultWalletAndCategory(authedUserId);
    await seedExpenseTransactions(authedUserId, walletId, categoryId, 35, { note: 'Scroll' });

    await page.goto('/transactions');
    const rows = page.getByTestId('transaction-row');
    await expect(rows.first()).toBeVisible(DB_TIMEOUT);

    await expect(async () => {
      expect(await rows.count()).toBe(30);
    }).toPass(DB_TIMEOUT);

    // Scroll the last visible row into view repeatedly — crosses the
    // IntersectionObserver sentinel's rootMargin and triggers `loadMore()`.
    await expect(async () => {
      await rows.last().scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, 2000);
      expect(await rows.count()).toBe(35);
    }).toPass({ timeout: 30_000 });
  });

  test('geser kiri untuk hapus cepat, lalu urungkan mengembalikannya', async ({ page, authedUserId }) => {
    test.setTimeout(60_000);
    const { walletId, categoryId } = await getDefaultWalletAndCategory(authedUserId);
    await seedExpenseTransactions(authedUserId, walletId, categoryId, 1, { note: 'Swipe target' });

    await page.goto('/transactions');
    const row = page.getByTestId('transaction-row').filter({ hasText: 'Swipe target 0' });
    await expect(row).toBeVisible(DB_TIMEOUT);

    const box = await row.boundingBox();
    if (!box) throw new Error('row has no bounding box');

    await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 60, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();

    const hapusButton = row.getByRole('button', { name: /Hapus/ });
    await expect(hapusButton).toBeVisible();
    await hapusButton.click();

    await expect(page.getByText('Transaksi dihapus', { exact: true })).toBeVisible(DB_TIMEOUT);
    await expect(page.getByTestId('transaction-row').filter({ hasText: 'Swipe target 0' })).toHaveCount(0);

    const undoButton = page.getByRole('button', { name: 'Urungkan' });
    await expect(undoButton).toBeVisible();
    await undoButton.click();

    await expect(page.getByTestId('transaction-row').filter({ hasText: 'Swipe target 0' })).toBeVisible(DB_TIMEOUT);
  });

  test('transfer antar dompet tampil netral: "A → B", tanpa tanda, tanpa swipe-hapus', async ({
    page,
    authedUserId,
  }) => {
    const { walletId: fromWalletId } = await getDefaultWalletAndCategory(authedUserId);
    const toWalletId = await createTestWallet(authedUserId, { name: 'GoPay E2E' });
    await seedSelfTransfer(authedUserId, fromWalletId, toWalletId, 250_000_00n, new Date(), 'Transfer e2e');

    await page.goto('/transactions');
    const row = page.getByTestId('transaction-row').filter({ hasText: 'Transfer' });
    await expect(row).toBeVisible(DB_TIMEOUT);
    await expect(row).toContainText('GoPay E2E');
    await expect(row).not.toContainText('+Rp');
    await expect(row).not.toContainText('−Rp');
    await expect(row).toContainText('Rp250.000');

    // Transfers never reveal a swipe-to-delete action — void explicitly
    // refuses type: 'transfer' (src/lib/services/transactions.ts).
    const box = await row.boundingBox();
    if (!box) throw new Error('row has no bounding box');
    await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 60, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(row.getByRole('button', { name: /Hapus/ })).toHaveCount(0);

    // Tapping opens the read-only detail sheet — no Edit/Hapus offered.
    await row.click();
    const sheet = page.getByRole('dialog', { name: 'Detail transaksi' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Hapus' })).toHaveCount(0);
  });
});
