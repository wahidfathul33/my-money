import { expect, test } from './fixtures/authenticated';

/**
 * tasks/05-wallets/spec.md verification: "buat dompet → saldo awal muncul →
 * arsipkan". Extended with the balance-adjustment step from the task
 * briefing ("create wallet -> balance shows -> adjust -> archive").
 * Authenticated via e2e/fixtures/authenticated.ts (auto-seeds a real,
 * onboarded session — the seeded user already has a starter "Tunai" wallet
 * with balance 0, see src/lib/db/seed.ts).
 *
 * Every assertion that follows a Server Action (real `dbWrite.transaction`
 * round trip to Neon) or a full page navigation (a Server Component doing a
 * real `dbRead` query) uses a generous explicit timeout — the suite's
 * default 5s `expect` timeout is comfortably enough on a quiet connection,
 * but not once several DB integration test files or another worktree's dev
 * server are hitting the same Neon branch concurrently (see
 * vitest.config.ts's identical rationale for `retry: 2` on the integration
 * suite).
 */
const DB_TIMEOUT = { timeout: 20000 };

test.describe('Dompet', () => {
  test('buat dompet -> saldo awal tampil -> sesuaikan saldo -> arsipkan', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/wallets');

    await page.getByRole('button', { name: 'Tambah dompet' }).click();

    const sheet = page.getByRole('dialog', { name: 'Tambah dompet' });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel('Nama dompet').fill('BCA Utama');
    await sheet.getByLabel('Saldo awal (Rp)').fill('500000');
    await sheet.getByRole('button', { name: 'Tambah dompet' }).click();
    await expect(sheet).not.toBeVisible(DB_TIMEOUT);

    const walletLink = page.getByRole('link', { name: /BCA Utama/ });
    await expect(walletLink).toBeVisible(DB_TIMEOUT);
    await expect(walletLink).toContainText('Rp500.000');

    await walletLink.click();
    await expect(page).toHaveURL(/\/wallets\/[^/]+$/, DB_TIMEOUT);
    // The hero balance (non-credit-card wallets show an explicit sign — see
    // wallet-card.tsx's doc comment) and the opening_balance ledger entry
    // below both render "+Rp500.000" identically — .first() targets the
    // hero specifically, which appears first in the DOM.
    await expect(page.getByText('+Rp500.000').first()).toBeVisible(DB_TIMEOUT);

    await page.getByRole('button', { name: 'Sesuaikan saldo' }).click();
    const adjustSheet = page.getByRole('dialog', { name: 'Sesuaikan saldo' });
    await expect(adjustSheet).toBeVisible();
    await adjustSheet.getByLabel('Saldo sebenarnya (Rp)').fill('450000');
    await expect(adjustSheet.getByText('−Rp50.000')).toBeVisible();
    await adjustSheet.getByRole('button', { name: 'Simpan penyesuaian' }).click();
    await expect(adjustSheet).not.toBeVisible(DB_TIMEOUT);

    await expect(page.getByText('+Rp450.000', { exact: true })).toBeVisible(DB_TIMEOUT);

    await page.getByRole('button', { name: 'Arsipkan' }).click();
    await expect(page.getByRole('button', { name: 'Pulihkan' })).toBeVisible(DB_TIMEOUT);

    await page.goto('/wallets');
    await expect(page.getByRole('heading', { name: 'Diarsipkan' })).toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('BCA Utama')).toBeVisible();
    await expect(page.getByRole('link', { name: /BCA Utama/ })).toHaveCount(0);
  });

  test('kartu kredit dengan saldo awal positif ditolak', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/wallets');

    await page.getByRole('button', { name: 'Tambah dompet' }).click();
    const sheet = page.getByRole('dialog', { name: 'Tambah dompet' });
    await sheet.getByLabel('Nama dompet').fill('Visa Nakal');

    await sheet.getByRole('combobox', { name: 'Jenis dompet' }).click();
    await page.getByRole('option', { name: 'Liabilitas' }).click();
    await sheet.getByLabel('Saldo awal (Rp)').fill('100000');
    await sheet.getByRole('button', { name: 'Tambah dompet' }).click();

    await expect(sheet.getByRole('alert')).toBeVisible(DB_TIMEOUT);
    await expect(sheet).toBeVisible(); // Still open — the submission was rejected.
  });
});
