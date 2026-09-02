import { expect, test } from './fixtures/authenticated';

/**
 * e2e/transactions.spec.ts — tasks/07-transactions-core/spec.md's own
 * verification section: "alur 3 tap, ukur durasi < 5 detik" and "undo
 * memulihkan transaksi & saldo".
 *
 * `authedUserId` (e2e/fixtures/authenticated.ts) already ran `seedNewUser`,
 * so the caller has the 16 canonical categories AND a starter "Tunai"
 * wallet (balance 0, set as `users.default_wallet_id`) before either test
 * starts — exactly the state a genuinely new user is in, which is the
 * scenario the "3 tap" budget has to hold up under (no transaction history
 * yet to seed the quick-pick chips from — they fall back to catalog order,
 * see src/features/transactions/queries.ts `getQuickCategories`).
 */
const DB_TIMEOUT = { timeout: 20_000 };

test.describe('Catat transaksi', () => {
  test.describe.configure({ retries: 2 });

  // The FAB (docs/09 §2) is BottomNav's mobile trigger specifically — the
  // Desktop Chrome project (playwright.config.ts) renders at a ≥1024px
  // viewport where CSS switches to Sidebar's "+ Tambah" trigger instead
  // (same underlying <AddTransactionSheet>, different accessible name).
  // Pinning the viewport here keeps this spec exercising the actual FAB
  // regardless of which project runs it — also simply correct, since the
  // "3 tap, one-handed" budget this spec measures is a mobile scenario
  // (tasks/07 spec.md verification: "periksa manual di 360px, satu tangan").
  test.use({ viewport: { width: 390, height: 844 } });

  test('alur 3 tap (FAB, kategori, Simpan) < 5 detik; toast + Urungkan; saldo dompet terbarui; undo memulihkan', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto('/wallets');
    const tunaiCard = page.getByRole('link', { name: /Tunai/ });
    await expect(tunaiCard).toBeVisible(DB_TIMEOUT);
    await expect(tunaiCard).toContainText('Rp0');

    const start = Date.now();

    // Tap 1: FAB.
    await page.getByRole('button', { name: 'Tambah transaksi' }).click();
    const sheet = page.getByRole('dialog', { name: 'Tambah transaksi' });
    await expect(sheet).toBeVisible();

    // "Pengeluaran" is the default active tab — docs/09 §2.
    await expect(sheet.getByRole('tab', { name: 'Pengeluaran' })).toHaveAttribute(
      'data-state',
      'active',
    );

    // Typing the amount doesn't count against the 3-tap budget
    // (tasks/07 spec.md: "di luar mengetik nominal").
    const amountDisplay = sheet.getByRole('status', { name: 'Jumlah' });
    for (const digit of ['4', '5', '0', '0', '0']) {
      await sheet.getByRole('button', { name: digit, exact: true }).click();
    }
    await expect(amountDisplay).toHaveText('45.000');

    // Tap 2: a quick-pick category chip. A brand new user has no usage
    // history yet, so the chips fall back to catalog order — "Makan &
    // Minum" is the first expense category (src/lib/db/seed/categories.ts).
    await sheet.getByRole('button', { name: 'Makan & Minum' }).click();

    // Tap 3: Simpan (the ✓ key in the keypad grid — there's no separate
    // "Simpan" button elsewhere, matching docs/09 §2's wireframe).
    await sheet.getByRole('button', { name: 'Simpan' }).click();

    await expect(sheet).not.toBeVisible(DB_TIMEOUT);
    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThan(5000);

    await expect(page.getByText('Tersimpan')).toBeVisible(DB_TIMEOUT);
    const undoButton = page.getByRole('button', { name: 'Urungkan' });
    await expect(undoButton).toBeVisible();

    // Dashboard/wallet numbers updated — Tunai went from Rp0 to −Rp45.000.
    await expect(tunaiCard).toContainText('−Rp45.000', DB_TIMEOUT);

    // Undo restores the transaction's ledger entry, atomically — saldo back to Rp0.
    await undoButton.click();
    await expect(tunaiCard).toContainText('Rp0', DB_TIMEOUT);
    await expect(tunaiCard).not.toContainText('−Rp45.000');
  });

  test('menutup sheet dengan nominal terisi meminta konfirmasi "Buang input?"', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/');

    await page.getByRole('button', { name: 'Tambah transaksi' }).click();
    const sheet = page.getByRole('dialog', { name: 'Tambah transaksi' });
    await expect(sheet).toBeVisible();

    const amountDisplay = sheet.getByRole('status', { name: 'Jumlah' });
    await sheet.getByRole('button', { name: '5', exact: true }).click();
    await expect(amountDisplay).toHaveText('5');

    // Attempt to close via the sheet's own close button.
    await sheet.getByRole('button', { name: 'Tutup' }).click();

    const confirm = page.getByRole('dialog', { name: 'Buang input?' });
    await expect(confirm).toBeVisible();

    // "Batal" keeps the sheet open with input intact.
    await confirm.getByRole('button', { name: 'Batal' }).click();
    await expect(confirm).not.toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(amountDisplay).toHaveText('5');

    // Closing again and choosing "Buang" actually discards it.
    await sheet.getByRole('button', { name: 'Tutup' }).click();
    await page.getByRole('dialog', { name: 'Buang input?' }).getByRole('button', { name: 'Buang' }).click();
    await expect(sheet).not.toBeVisible();
  });
});
