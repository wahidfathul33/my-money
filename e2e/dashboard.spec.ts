import { expect, test } from './fixtures/authenticated';

/**
 * tasks/20-dashboard e2e coverage — the conditional-display rules
 * (spec.md's "Aturan Tampil Kondisional"), the transaction-recorded ->
 * dashboard-numbers-update loop, and the FAB-visible-without-scroll
 * check at 360px. Axe/horizontal-overflow for `/` itself is already
 * covered generically by e2e/responsive.spec.ts (task 02) — not
 * duplicated here.
 *
 * Authenticated via e2e/fixtures/authenticated.ts (auto-seeds a real,
 * onboarded session with a starter "Tunai" wallet at balance 0, no
 * transactions yet) — same fixture every other feature e2e suite uses.
 */
const DB_TIMEOUT = { timeout: 20_000 };

test.describe('Dashboard — kondisi awal', () => {
  test('dompet baru tanpa transaksi: hero, tile, dan empty state transaksi tampil; bagian kondisional tersembunyi', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(DB_TIMEOUT);

    // Hero + tiles always render once there's at least one wallet.
    await expect(page.getByText('Kas', { exact: true })).toBeVisible();
    await expect(page.getByText('Bulan Ini', { exact: true })).toBeVisible();

    // No transactions recorded yet -> the transaction empty state, not the list.
    await expect(page.getByText('Belum ada transaksi', { exact: true })).toBeVisible();

    // Nothing conditional has data yet -> every conditional section is absent.
    await expect(page.getByRole('heading', { name: 'Anggaran' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Perlu Perhatian' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Tabungan' })).toHaveCount(0);
  });
});

test.describe('Dashboard — catat transaksi memperbarui angka', () => {
  test.describe.configure({ retries: 2 });
  test.use({ viewport: { width: 390, height: 844 } }); // FAB, same rationale as e2e/transactions.spec.ts

  test('catat pengeluaran -> muncul di Transaksi Terakhir, tile Bulan Ini berubah', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');

    await page.getByRole('button', { name: 'Tambah transaksi' }).click();
    const sheet = page.getByRole('dialog', { name: 'Tambah transaksi' });
    await expect(sheet).toBeVisible();
    for (const digit of ['4', '5', '0', '0', '0']) {
      await sheet.getByRole('button', { name: digit, exact: true }).click();
    }
    await sheet.getByRole('button', { name: 'Makan & Minum' }).click();
    await sheet.getByRole('button', { name: 'Simpan' }).click();
    await expect(sheet).not.toBeVisible(DB_TIMEOUT);

    await page.goto('/'); // fresh Server Component render — same pattern e2e/wallets.spec.ts uses
    await expect(page.getByText('Belum ada transaksi')).toHaveCount(0);
    await expect(page.getByText('Makan & Minum')).toBeVisible(DB_TIMEOUT);
    // Appears twice by design — once in the "Bulan Ini" tile's expense
    // figure, once in the Transaksi Terakhir row (same amount, since this
    // is the month's only expense) — `.first()` just proves it rendered.
    await expect(page.getByText('−Rp45.000').first()).toBeVisible();
  });
});

test.describe('Dashboard — Anggaran kondisional', () => {
  test.describe.configure({ retries: 2 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('budget sehat (<80%) -> bagian Anggaran tersembunyi; setelah 85% -> muncul', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/budgets');
    await page.getByRole('button', { name: 'Buat Anggaran' }).click();
    const createSheet = page.getByRole('dialog', { name: 'Tambah anggaran' });
    await expect(createSheet).toBeVisible();
    await createSheet.getByRole('combobox', { name: 'Kategori' }).click();
    await page.getByRole('option', { name: 'Makan & Minum' }).click();
    await createSheet.getByLabel('Nominal (Rp)').fill('1000000');
    await createSheet.getByRole('button', { name: 'Tambah anggaran' }).click();
    await expect(createSheet).not.toBeVisible(DB_TIMEOUT);

    // 30% used — still "safe", so the dashboard's Anggaran section stays hidden.
    await page.getByRole('button', { name: 'Tambah transaksi' }).click();
    let sheet = page.getByRole('dialog', { name: 'Tambah transaksi' });
    await expect(sheet).toBeVisible();
    for (const digit of ['3', '0', '0', '0', '0', '0']) {
      await sheet.getByRole('button', { name: digit, exact: true }).click();
    }
    await sheet.getByRole('button', { name: 'Makan & Minum' }).click();
    await sheet.getByRole('button', { name: 'Simpan' }).click();
    await expect(sheet).not.toBeVisible(DB_TIMEOUT);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Anggaran' })).toHaveCount(0);

    // Push to 85% — the dashboard's Anggaran section must now appear.
    await page.getByRole('button', { name: 'Tambah transaksi' }).click();
    sheet = page.getByRole('dialog', { name: 'Tambah transaksi' });
    await expect(sheet).toBeVisible();
    for (const digit of ['5', '5', '0', '0', '0', '0']) {
      await sheet.getByRole('button', { name: digit, exact: true }).click();
    }
    await sheet.getByRole('button', { name: 'Makan & Minum' }).click();
    await sheet.getByRole('button', { name: 'Simpan' }).click();
    await expect(sheet).not.toBeVisible(DB_TIMEOUT);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Anggaran' })).toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('85%')).toBeVisible();
  });
});

test.describe('Dashboard — Perlu Perhatian kondisional', () => {
  test.describe.configure({ retries: 2 });

  test('tanpa jatuh tempo -> tersembunyi; hutang jatuh tempo dekat -> muncul', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Perlu Perhatian' })).toHaveCount(0);

    await page.goto('/wealth/debts');
    await page.getByRole('button', { name: 'Tambah hutang', exact: true }).click();
    const createSheet = page.getByRole('dialog', { name: 'Hutang baru' });
    await expect(createSheet).toBeVisible();
    await createSheet.getByLabel('Nama pemberi pinjaman').fill('Cicilan motor');
    await createSheet.getByLabel('Nominal (Rp)').fill('1250000');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);
    await createSheet.locator('input[name="dueDate"]').fill(dueDate.toISOString().slice(0, 10));
    await createSheet.getByRole('button', { name: 'Buat hutang' }).click();
    await expect(createSheet).not.toBeVisible(DB_TIMEOUT);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Perlu Perhatian' })).toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Cicilan motor')).toBeVisible();
  });
});

test.describe('Dashboard — FAB tanpa scroll', () => {
  test('FAB terlihat tanpa scroll di 360px meski konten dashboard panjang', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(DB_TIMEOUT);

    const fab = page.getByRole('button', { name: 'Tambah transaksi' });
    await expect(fab).toBeVisible();

    const box = await fab.boundingBox();
    expect(box).not.toBeNull();
    // Entirely within the viewport's vertical bounds WITHOUT any scroll —
    // spec.md "FAB selalu terlihat tanpa scroll".
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(640);

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });
});
