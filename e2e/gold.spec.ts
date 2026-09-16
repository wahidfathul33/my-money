import { expect, test } from './fixtures/authenticated';

/**
 * tasks/16-assets-gold/spec.md verification: "beli → saldo turun → update
 * harga → gain berubah → jual → saldo naik". Authenticated via
 * e2e/fixtures/authenticated.ts (auto-seeds a real, onboarded session with
 * a starter "Tunai" wallet at balance 0 — a second, funded wallet is
 * created here to buy/sell from/into, same setup
 * e2e/savings.spec.ts uses).
 *
 * UI copy follows docs/08-copywriting.md's glossary: `Berat` · `Harga
 * beli` · `Nilai saat ini` · `Keuntungan` (§8's gold field list).
 */
const DB_TIMEOUT = { timeout: 20000 };

test.describe('Gold holdings', () => {
  test.describe.configure({ retries: 2 });

  test('beli emas -> saldo turun -> perbarui harga -> gain berubah -> jual -> saldo naik', async ({ page }) => {
    test.setTimeout(120_000);

    // A funded wallet to buy FROM and sell back INTO.
    await page.goto('/wallets');
    await page.getByRole('button', { name: 'Tambah dompet' }).click();
    const walletSheet = page.getByRole('dialog', { name: 'Tambah dompet' });
    await walletSheet.getByLabel('Nama dompet').fill('BCA');
    await walletSheet.getByLabel('Saldo awal (Rp)').fill('50000000');
    await walletSheet.getByRole('button', { name: 'Tambah dompet' }).click();
    await expect(walletSheet).not.toBeVisible(DB_TIMEOUT);
    await expect(page.getByRole('link', { name: /BCA/ })).toContainText('Rp50.000.000', DB_TIMEOUT);

    // Empty state -> "Tambah Emas" opens the buy sheet.
    await page.goto('/wealth/assets/gold');
    await expect(page.getByText('Catat kepemilikan emas')).toBeVisible(DB_TIMEOUT);
    await page.getByRole('button', { name: 'Tambah Emas' }).click();

    const buySheet = page.getByRole('dialog', { name: 'Beli emas' });
    await expect(buySheet).toBeVisible();
    await buySheet.getByLabel('Berat (gram)').fill('10');
    await buySheet.getByLabel('Harga beli per gram (Rp)').fill('1000000');
    await buySheet.getByRole('button', { name: /^Dompet sumber:/ }).click();
    await page.getByRole('dialog', { name: 'Pilih dompet' }).getByRole('button', { name: 'BCA' }).click();
    await buySheet.getByRole('button', { name: 'Beli Emas' }).click();
    await expect(buySheet).not.toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Pembelian emas tersimpan', { exact: true })).toBeVisible(DB_TIMEOUT);

    // Wallet balance moved by EXACTLY weight x price: 10g x Rp1.000.000 = Rp10.000.000.
    await page.goto('/wallets');
    await expect(page.getByRole('link', { name: /BCA/ })).toContainText('Rp40.000.000', DB_TIMEOUT);

    // Back on the gold page: no price recorded yet -> valuation hidden, CTA shown.
    await page.goto('/wealth/assets/gold');
    // exact: true disambiguates from the per-lot row's own fallback text
    // ("Nilai belum tersedia — masukkan harga saat ini"), which is ALSO
    // visible at this point since the one lot has no price to compute a
    // gain against either.
    await expect(page.getByText('Nilai belum tersedia', { exact: true })).toBeVisible(DB_TIMEOUT);
    await page.getByRole('button', { name: 'Masukkan harga saat ini' }).click();

    const priceSheet = page.getByRole('dialog', { name: 'Perbarui harga emas' });
    await expect(priceSheet).toBeVisible();
    await priceSheet.getByLabel('Harga jual per gram (Rp)').fill('1100000');
    await priceSheet.getByLabel('Harga buyback per gram (Rp)').fill('1050000');
    await priceSheet.getByRole('button', { name: 'Simpan Harga' }).click();
    await expect(priceSheet).not.toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Harga emas diperbarui', { exact: true })).toBeVisible(DB_TIMEOUT);

    // Valuation now visible, using the BUYBACK price (never the sell price):
    // current value = 10g x Rp1.050.000 = Rp10.500.000; cost basis was
    // Rp10.000.000 -> unrealized gain +Rp500.000 (ADR-007).
    // .first(): with exactly one lot, its own current-value figure equals
    // the header total, so the same "Rp10.500.000" text legitimately
    // appears twice (header hero + the one lot's row) — either instance
    // proves the buyback valuation rendered.
    await expect(page.getByText('Rp10.500.000', { exact: false }).first()).toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('+Rp500.000', { exact: false })).toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Rp1.050.000', { exact: false }).first()).toBeVisible();

    // Sell 4g -> confirmation dialog shows proceeds + realized gain BEFORE
    // committing (docs/10-ux-states.md §5.1).
    await page.getByRole('button', { name: 'Jual Emas' }).click();
    const sellSheet = page.getByRole('dialog', { name: 'Jual emas' });
    await expect(sellSheet).toBeVisible();
    await sellSheet.getByLabel('Berat (gram)').fill('4');
    // Price/gram is prefilled from the latest buyback price already.
    await sellSheet.getByRole('button', { name: /^Dompet tujuan:/ }).click();
    await page.getByRole('dialog', { name: 'Pilih dompet' }).getByRole('button', { name: 'BCA' }).click();
    await sellSheet.getByRole('button', { name: 'Jual Emas' }).click();

    const confirmDialog = page.getByRole('dialog', { name: 'Konfirmasi penjualan emas' });
    await expect(confirmDialog).toBeVisible();
    // Proceeds: 4g x Rp1.050.000 = Rp4.200.000. Realized gain: proceeds -
    // (4g x avg cost Rp1.000.000) = Rp4.200.000 - Rp4.000.000 = +Rp200.000.
    await expect(confirmDialog.getByText('Rp4.200.000', { exact: false })).toBeVisible();
    await expect(confirmDialog.getByText('Keuntungan direalisasi')).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Jual' }).click();
    await expect(confirmDialog).not.toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Penjualan emas tersimpan', { exact: true })).toBeVisible(DB_TIMEOUT);

    // Wallet balance rose by EXACTLY the proceeds.
    await page.goto('/wallets');
    await expect(page.getByRole('link', { name: /BCA/ })).toContainText('Rp44.200.000', DB_TIMEOUT);

    // Remaining holdings: 10g - 4g = 6g, still shown (not fully liquidated).
    await page.goto('/wealth/assets/gold');
    await expect(page.getByText('Total 6', { exact: false })).toBeVisible(DB_TIMEOUT);
  });

  test('menjual melebihi kepemilikan ditolak', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/wallets');
    await page.getByRole('button', { name: 'Tambah dompet' }).click();
    const walletSheet = page.getByRole('dialog', { name: 'Tambah dompet' });
    await walletSheet.getByLabel('Nama dompet').fill('Mandiri');
    await walletSheet.getByLabel('Saldo awal (Rp)').fill('20000000');
    await walletSheet.getByRole('button', { name: 'Tambah dompet' }).click();
    await expect(walletSheet).not.toBeVisible(DB_TIMEOUT);

    await page.goto('/wealth/assets/gold');
    await page.getByRole('button', { name: 'Tambah Emas' }).click();
    const buySheet = page.getByRole('dialog', { name: 'Beli emas' });
    await buySheet.getByLabel('Berat (gram)').fill('5');
    await buySheet.getByLabel('Harga beli per gram (Rp)').fill('1000000');
    await buySheet.getByRole('button', { name: /^Dompet sumber:/ }).click();
    await page.getByRole('dialog', { name: 'Pilih dompet' }).getByRole('button', { name: 'Mandiri' }).click();
    await buySheet.getByRole('button', { name: 'Beli Emas' }).click();
    await expect(buySheet).not.toBeVisible(DB_TIMEOUT);

    // Attempt to sell MORE than the 5g held — rejected client-side before
    // the confirm dialog ever opens, with the exact available figure named.
    await page.getByRole('button', { name: 'Jual Emas' }).click();
    const sellSheet = page.getByRole('dialog', { name: 'Jual emas' });
    await sellSheet.getByLabel('Berat (gram)').fill('10');
    await sellSheet.getByLabel('Harga buyback per gram (Rp)').fill('900000');
    await sellSheet.getByRole('button', { name: /^Dompet tujuan:/ }).click();
    await page.getByRole('dialog', { name: 'Pilih dompet' }).getByRole('button', { name: 'Mandiri' }).click();
    await sellSheet.getByRole('button', { name: 'Jual Emas' }).click();

    await expect(sellSheet.getByText('Melebihi kepemilikan emas Anda')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Konfirmasi penjualan emas' })).not.toBeVisible();
  });
});
