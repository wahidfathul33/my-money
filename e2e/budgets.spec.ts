import { expect, test } from './fixtures/authenticated';
import { waitForDomToSettle } from './fixtures/base';

/**
 * tasks/14-budgets/spec.md verification: "buat budget → catat pengeluaran →
 * progres bergerak" and "lewati 100% → status over + warna danger".
 * `authedUserId` (e2e/fixtures/authenticated.ts) already ran `seedNewUser`,
 * so the caller has the 16 canonical categories AND a starter "Tunai"
 * wallet before either test starts — "Makan & Minum" is both the first
 * seeded expense category (src/lib/db/seed/categories.ts) and, with no
 * usage history yet, the Add Transaction sheet's first quick-pick chip
 * (same fallback e2e/transactions.spec.ts relies on).
 */
const DB_TIMEOUT = { timeout: 20_000 };

async function recordExpense(page: import('@playwright/test').Page, rupiahDigits: string[]): Promise<void> {
  await page.getByRole('button', { name: 'Tambah transaksi' }).click();
  const sheet = page.getByRole('dialog', { name: 'Tambah transaksi' });
  await expect(sheet).toBeVisible();
  for (const digit of rupiahDigits) {
    await sheet.getByRole('button', { name: digit, exact: true }).click();
  }
  await sheet.getByRole('button', { name: 'Makan & Minum' }).click();
  await sheet.getByRole('button', { name: 'Simpan' }).click();
  await expect(sheet).not.toBeVisible(DB_TIMEOUT);
}

test.describe('Anggaran pribadi', () => {
  test.describe.configure({ retries: 2 });
  test.use({ viewport: { width: 390, height: 844 } }); // FAB, same rationale as e2e/transactions.spec.ts

  test('buat anggaran -> catat pengeluaran -> progres bergerak -> lewati 100% -> status over', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto('/budgets');
    // EmptyState's title renders as a <p>, not a heading element.
    await expect(page.getByText('Belum ada anggaran', { exact: true })).toBeVisible(DB_TIMEOUT);

    await page.getByRole('button', { name: 'Buat Anggaran' }).click();
    const createSheet = page.getByRole('dialog', { name: 'Tambah anggaran' });
    await expect(createSheet).toBeVisible();

    await createSheet.getByRole('combobox', { name: 'Kategori' }).click();
    await page.getByRole('option', { name: 'Makan & Minum' }).click();
    await createSheet.getByLabel('Nominal (Rp)').fill('1000000');
    await createSheet.getByRole('button', { name: 'Tambah anggaran' }).click();
    await expect(createSheet).not.toBeVisible(DB_TIMEOUT);

    // Fresh budget: 0% used, full amount still "sisa".
    await expect(page.getByText('Makan & Minum')).toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Rp0 dari Rp1.000.000')).toBeVisible();

    // Record Rp850.000 of expense in the SAME category -> 85% (still "safe"
    // by the 80% threshold's own boundary, so push comfortably into
    // "warning" territory without relying on an exact-80% edge case here).
    await recordExpense(page, ['8', '5', '0', '0', '0', '0']);

    await page.goto('/budgets'); // fresh Server Component render — see e2e/wallets.spec.ts for the same re-fetch-via-navigation pattern
    await expect(page.getByText('85%')).toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Waspada')).toBeVisible();
    await expect(page.getByText('Rp850.000 dari Rp1.000.000')).toBeVisible();

    // Push it past 100% with another Rp300.000 (total Rp1.150.000 / 115%).
    await recordExpense(page, ['3', '0', '0', '0', '0', '0']);

    await page.goto('/budgets');
    await expect(page.getByText('115%')).toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Terlampaui')).toBeVisible();
    await expect(page.getByText('Rp1.150.000 dari Rp1.000.000')).toBeVisible();
  });
});

test.describe('Anggaran keluarga', () => {
  test.use({ viewport: { width: 390, height: 844 } }); // mobile sub-nav (HouseholdNav) is md:hidden

  test('buat keluarga -> buka Anggaran lewat nav -> buat anggaran keluarga', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/household/new');
    await page.getByLabel('Nama keluarga').fill('Keluarga Anggaran');
    await page.getByRole('button', { name: 'Buat Keluarga' }).click();
    await expect(page).toHaveURL(/\/household\/(?!new$)[^/]+$/, DB_TIMEOUT);
    await waitForDomToSettle(page);

    // Exercises the nav wiring this task activates
    // (src/features/household/household-menu-items.ts) — not just a direct
    // page.goto to the route.
    await page.getByRole('link', { name: 'Anggaran' }).click();
    await expect(page).toHaveURL(/\/household\/[^/]+\/budgets$/, DB_TIMEOUT);
    await waitForDomToSettle(page);
    await expect(page.getByText('Belum ada anggaran keluarga', { exact: true })).toBeVisible(DB_TIMEOUT);

    await page.getByRole('button', { name: 'Buat Anggaran' }).click();
    const sheet = page.getByRole('dialog', { name: 'Tambah anggaran' });
    await expect(sheet).toBeVisible();

    await sheet.getByRole('combobox', { name: 'Kategori' }).click();
    await page.getByRole('option', { name: 'Makan & Minum' }).click();
    await sheet.getByLabel('Nominal (Rp)').fill('2000000');
    await sheet.getByRole('button', { name: 'Tambah anggaran' }).click();
    await expect(sheet).not.toBeVisible(DB_TIMEOUT);

    await expect(page.getByText('Makan & Minum')).toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Rp0 dari Rp2.000.000')).toBeVisible();
  });
});
