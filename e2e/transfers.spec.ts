import { expect, test } from './fixtures/authenticated';

/**
 * e2e/transfers.spec.ts — tasks/08-transfers-self/spec.md's own
 * verification: "transfer → cek kedua saldo", plus todo.md's "E2E: transfer
 * → kedua saldo benar → tampil netral di riwayat".
 *
 * `authedUserId` (e2e/fixtures/authenticated.ts) already ran `seedNewUser`,
 * so the caller starts with a "Tunai" wallet at balance 0 — a second wallet
 * ("BCA", opening balance Rp500.000) is created here through the same UI
 * flow e2e/wallets.spec.ts uses, so the transfer has two real wallets to
 * move money between.
 */
const DB_TIMEOUT = { timeout: 20_000 };

test.describe('Transfer antar dompet sendiri', () => {
  test.describe.configure({ retries: 2 });

  // Pin to a mobile viewport so the Add Transaction trigger is BottomNav's
  // FAB ("Tambah transaksi") rather than Sidebar's "+ Tambah" — same
  // Desktop-Chrome-defaults-to-≥1024px reasoning as e2e/transactions.spec.ts.
  test.use({ viewport: { width: 390, height: 844 } });

  test('transfer BCA -> Tunai: kedua saldo benar, tampil netral tanpa tanda di riwayat, void membalikkan keduanya', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Seed a second wallet with an opening balance to transfer FROM. Given
    // a "Bank" type explicitly — the default is "Tunai" (cash), which would
    // make BCA's own group-label text collide with the seeded "Tunai"
    // wallet's NAME in accessible-name matching below.
    await page.goto('/wallets');
    await page.getByRole('button', { name: 'Tambah dompet' }).click();
    const walletSheet = page.getByRole('dialog', { name: 'Tambah dompet' });
    await walletSheet.getByLabel('Nama dompet').fill('BCA');
    await walletSheet.getByRole('combobox', { name: 'Jenis dompet' }).click();
    await page.getByRole('option', { name: 'Bank' }).click();
    await walletSheet.getByLabel('Saldo awal (Rp)').fill('500000');
    await walletSheet.getByRole('button', { name: 'Tambah dompet' }).click();
    await expect(walletSheet).not.toBeVisible(DB_TIMEOUT);

    const bcaCard = page.getByRole('link', { name: /BCA/ });
    const tunaiCard = page.getByRole('link', { name: /Tunai/ });
    await expect(bcaCard).toContainText('Rp500.000', DB_TIMEOUT);
    await expect(tunaiCard).toContainText('Rp0');

    // Open the Add Transaction sheet and switch to the Transfer tab.
    await page.getByRole('button', { name: 'Tambah transaksi' }).click();
    const sheet = page.getByRole('dialog', { name: 'Tambah transaksi' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('tab', { name: 'Transfer' }).click();
    await expect(sheet.getByRole('tab', { name: 'Transfer' })).toHaveAttribute('data-state', 'active');

    // The category row is gone entirely in Transfer mode.
    await expect(sheet.getByRole('button', { name: 'Makan & Minum' })).toHaveCount(0);

    // Amount: Rp100.000.
    const amountDisplay = sheet.getByRole('status', { name: 'Jumlah' });
    for (const digit of ['1', '0', '0', '0', '0', '0']) {
      await sheet.getByRole('button', { name: digit, exact: true }).click();
    }
    await expect(amountDisplay).toHaveText('100.000');

    // From defaults to the default wallet (Tunai) — switch it to BCA, then
    // pick Tunai as the destination.
    await sheet.getByRole('button', { name: /^Dompet asal:/ }).click();
    await page.getByRole('dialog', { name: 'Pilih dompet' }).getByRole('button', { name: 'BCA' }).click();

    await sheet.getByRole('button', { name: /^Dompet tujuan:/ }).click();
    await page.getByRole('dialog', { name: 'Pilih dompet' }).getByRole('button', { name: 'Tunai' }).click();

    await sheet.getByRole('button', { name: 'Simpan' }).click();
    await expect(sheet).not.toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Tersimpan', { exact: true })).toBeVisible(DB_TIMEOUT);

    // Both balances moved by exactly Rp100.000.
    await expect(bcaCard).toContainText('Rp400.000', DB_TIMEOUT);
    await expect(tunaiCard).toContainText('Rp100.000', DB_TIMEOUT);

    // History shows it neutrally: "BCA → Tunai", no +/− prefix.
    await page.goto('/transactions');
    const transferRow = page.getByText('BCA → Tunai', { exact: true });
    await expect(transferRow).toBeVisible(DB_TIMEOUT);
    const rowAmount = page.getByText('Rp100.000', { exact: true });
    await expect(rowAmount).toBeVisible();
    await expect(page.getByText('+Rp100.000')).toHaveCount(0);
    await expect(page.getByText('−Rp100.000')).toHaveCount(0);

    // Void reverses BOTH entries atomically.
    await transferRow.click();
    const detailSheet = page.getByRole('dialog', { name: 'Detail transaksi' });
    await expect(detailSheet).toBeVisible();
    await detailSheet.getByRole('button', { name: 'Hapus' }).click();
    await expect(detailSheet).not.toBeVisible(DB_TIMEOUT);

    await page.goto('/wallets');
    await expect(page.getByRole('link', { name: /BCA/ })).toContainText('Rp500.000', DB_TIMEOUT);
    await expect(page.getByRole('link', { name: /Tunai/ })).toContainText('Rp0', DB_TIMEOUT);
  });

  test('menolak dompet asal = tujuan (dompet tujuan tidak menampilkan dompet asal)', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/');

    await page.getByRole('button', { name: 'Tambah transaksi' }).click();
    const sheet = page.getByRole('dialog', { name: 'Tambah transaksi' });
    await sheet.getByRole('tab', { name: 'Transfer' }).click();

    // The default source wallet ("Tunai") must not appear in the
    // destination picker's list — spec.md "Validasi menolak: dompet asal =
    // tujuan" enforced structurally by the picker's own options.
    await sheet.getByRole('button', { name: /^Dompet tujuan:/ }).click();
    const destSheet = page.getByRole('dialog', { name: 'Pilih dompet' });
    await expect(destSheet).toBeVisible();
    await expect(destSheet.getByRole('button', { name: 'Tunai' })).toHaveCount(0);
  });
});
