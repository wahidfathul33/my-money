import { expect, test } from './fixtures/authenticated';

/**
 * tasks/18-debts-receivables/spec.md verification: "buat hutang → cicil →
 * sisa turun → lunas → pindah ke bagian Selesai" — the exact flow this
 * suite's first test drives end to end, including the wallet-balance side
 * effects at every step (creation moves the wallet UP, each payment moves
 * it DOWN by the same amount), since spec.md is explicit those must be
 * proven together, not as two separate halves.
 *
 * The other two tests target the two things the task brief calls out as
 * "easiest to get wrong": `affects_wallet` gating whether creation touches
 * a wallet at all, and the `OVERPAYMENT` guard naming the actual remaining
 * figure rather than a bare rejection — proven here at the UI level as
 * defense in depth alongside src/lib/services/__tests__/obligations.integration.test.ts's
 * deeper coverage of the same two properties.
 *
 * Authenticated via e2e/fixtures/authenticated.ts (auto-seeds a real,
 * onboarded session with a starter "Tunai" wallet at balance 0), same
 * fixture e2e/savings.spec.ts and e2e/budgets.spec.ts use.
 */
const DB_TIMEOUT = { timeout: 20_000 };

test.describe('Debts & receivables', () => {
  test.describe.configure({ retries: 2 });

  test('buat hutang -> cicil -> sisa turun -> lunas -> pindah ke bagian Selesai', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/wealth/debts');
    await expect(page.getByRole('tab', { name: 'Hutang' })).toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Tidak ada hutang', { exact: true })).toBeVisible();

    // Create — "Adira Finance" lends Rp3.000.000, affecting the wallet
    // (default ON), onto the seeded "Tunai" wallet (the only one, so it's
    // already the default selection — no picker interaction needed).
    // Exact + specific aria-label — the app shell's own global "+ Tambah"
    // (add-transaction) sidebar/FAB entry is present on every page,
    // including this one, and its accessible name also contains "Tambah".
    await page.getByRole('button', { name: 'Tambah hutang', exact: true }).click();
    const createSheet = page.getByRole('dialog', { name: 'Hutang baru' });
    await expect(createSheet).toBeVisible();
    await createSheet.getByLabel('Nama pemberi pinjaman').fill('Adira Finance');
    await createSheet.getByLabel('Nominal (Rp)').fill('3000000');
    await createSheet.getByRole('button', { name: 'Buat hutang' }).click();
    await expect(createSheet).not.toBeVisible(DB_TIMEOUT);

    await expect(page.getByText('Adira Finance')).toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Total hutang')).toBeVisible();

    // Creation moved the wallet UP by the full amount — "saya meminjam",
    // cash comes in (docs/03 §12's table).
    await page.goto('/wallets');
    await expect(page.getByRole('link', { name: /Tunai/ })).toContainText('Rp3.000.000', DB_TIMEOUT);
    await page.goto('/wealth/debts');

    // Cicil (partial payment) — clear the keypad's default-to-full-remaining
    // prefill and pay Rp1.000.000 instead.
    await page.getByRole('button', { name: 'Catat Bayar' }).click();
    const paySheet = page.getByRole('dialog', { name: 'Catat pembayaran hutang' });
    await expect(paySheet).toBeVisible();
    for (let i = 0; i < 10; i++) {
      await paySheet.getByRole('button', { name: 'Hapus' }).click();
    }
    for (const digit of ['1', '0', '0', '0', '0', '0', '0']) {
      await paySheet.getByRole('button', { name: digit, exact: true }).click();
    }
    await paySheet.getByRole('button', { name: 'Simpan' }).click();
    await expect(paySheet).not.toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Pembayaran tersimpan', { exact: true })).toBeVisible(DB_TIMEOUT);

    // Sisa turun — wallet moved DOWN by exactly the installment; the debt
    // is not fully settled yet, so it must NOT show "Lunas".
    await page.goto('/wallets');
    await expect(page.getByRole('link', { name: /Tunai/ })).toContainText('Rp2.000.000', DB_TIMEOUT);
    await page.goto('/wealth/debts');
    await expect(page.getByText('Lunas', { exact: true })).toHaveCount(0);

    // Lunas — pay off the remaining Rp2.000.000 (the keypad already
    // defaults to the full remaining amount, so no digits needed this time).
    await page.getByRole('button', { name: 'Catat Bayar' }).click();
    const finalPaySheet = page.getByRole('dialog', { name: 'Catat pembayaran hutang' });
    await expect(finalPaySheet).toBeVisible();
    await finalPaySheet.getByRole('button', { name: 'Simpan' }).click();
    await expect(finalPaySheet).not.toBeVisible(DB_TIMEOUT);

    // Wallet fully returned to zero: 3.000.000 in, 3.000.000 out across
    // both installments.
    await page.goto('/wallets');
    await expect(page.getByRole('link', { name: /Tunai/ })).toContainText('Rp0', DB_TIMEOUT);
    await page.goto('/wealth/debts');

    // Pindah ke bagian Selesai.
    await expect(page.getByText('Lunas', { exact: true })).toBeVisible(DB_TIMEOUT);
    await expect(page.getByRole('heading', { name: 'Selesai' })).toBeVisible();
  });

  test('affects_wallet = false tidak menulis ledger entry — saldo dompet tidak berubah saat dibuat', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.goto('/wealth/debts');
    await page.getByRole('button', { name: 'Tambah hutang', exact: true }).click();
    const createSheet = page.getByRole('dialog', { name: 'Hutang baru' });
    await expect(createSheet).toBeVisible();
    await createSheet.getByLabel('Nama pemberi pinjaman').fill('Teman (dibelikan barang)');
    await createSheet.getByLabel('Nominal (Rp)').fill('250000');
    // Turn OFF "Pengaruhi saldo dompet" — a friend bought something for
    // you; no cash ever moved.
    await createSheet.getByRole('switch', { name: 'Pengaruhi saldo dompet' }).click();
    await createSheet.getByRole('button', { name: 'Buat hutang' }).click();
    await expect(createSheet).not.toBeVisible(DB_TIMEOUT);

    await expect(page.getByText('Teman (dibelikan barang)')).toBeVisible(DB_TIMEOUT);

    // The debt exists, but the wallet is untouched — still Rp0.
    await page.goto('/wallets');
    await expect(page.getByRole('link', { name: /Tunai/ })).toContainText('Rp0', DB_TIMEOUT);
  });

  test('kelebihan bayar ditolak dengan pesan yang menyebut sisa hutang', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/wealth/debts');
    await page.getByRole('button', { name: 'Tambah hutang', exact: true }).click();
    const createSheet = page.getByRole('dialog', { name: 'Hutang baru' });
    await createSheet.getByLabel('Nama pemberi pinjaman').fill('Kecil');
    await createSheet.getByLabel('Nominal (Rp)').fill('100000');
    await createSheet.getByRole('switch', { name: 'Pengaruhi saldo dompet' }).click(); // off — irrelevant to this test, keeps it simple
    await createSheet.getByRole('button', { name: 'Buat hutang' }).click();
    await expect(createSheet).not.toBeVisible(DB_TIMEOUT);

    await page.getByRole('button', { name: 'Catat Bayar' }).click();
    const paySheet = page.getByRole('dialog', { name: 'Catat pembayaran hutang' });
    await expect(paySheet).toBeVisible();
    // Keypad defaults to the full remaining (Rp100.000) — add Rp1 more via
    // the "+" operator to push it one rupiah over.
    await paySheet.getByRole('button', { name: 'Tambah' }).click();
    await paySheet.getByRole('button', { name: '1', exact: true }).click();
    await paySheet.getByRole('button', { name: 'Simpan' }).click();

    await expect(paySheet.getByText(/Pembayaran melebihi sisa hutang/)).toBeVisible(DB_TIMEOUT);
    await expect(paySheet.getByText(/Rp100\.000/)).toBeVisible();
    // Rejected — the sheet stays open, nothing was recorded.
    await expect(paySheet).toBeVisible();
  });
});
