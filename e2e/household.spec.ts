import { expect, test } from './fixtures/authenticated';

/**
 * tasks/10-household-core/spec.md verification: "buat household → switcher
 * muncul → berpindah konteks" + "/household/<uuid-acak> → halaman 404".
 * `authedUserId` (e2e/fixtures/authenticated.ts) starts with zero
 * households — the "no trace" side of the acceptance criteria is covered in
 * e2e/app-shell.spec.ts (the file task 10's briefing calls out as the one
 * to update for that check); this file covers the household lifecycle
 * itself.
 */
const DB_TIMEOUT = { timeout: 20_000 };
const MOBILE = { width: 390, height: 844 };

test.describe('Household — buat, switcher, isolasi', () => {
  test.use({ viewport: MOBILE });

  test('buat household -> jadi owner -> switcher muncul -> berpindah konteks mengubah URL', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto('/household/new');
    await page.getByLabel('Nama keluarga').fill('Keluarga Uji');
    await page.getByRole('button', { name: 'Buat Keluarga' }).click();

    await expect(page).toHaveURL(/\/household\/(?!new$)[^/]+$/, DB_TIMEOUT);
    await expect(page.getByRole('heading', { name: 'Keluarga Uji' })).toBeVisible(DB_TIMEOUT);

    // Ringkasan keluarga baru — docs/10-ux-states.md §2.1: setup steps list.
    await expect(page.getByText('Keluarga Uji siap digunakan')).toBeVisible();
    await expect(page.getByText('Undang anggota')).toBeVisible();
    await expect(page.getByText('Tandai pengeluaran keluarga')).toBeVisible();

    // The context switcher now exists (task 10's hardest requirement, in
    // reverse: it MUST show once there's at least one household) — its
    // trigger reflects the active context's name.
    const switcherTrigger = page.getByRole('button', { name: 'Keluarga Uji' });
    await expect(switcherTrigger).toBeVisible();

    // Switching context is plain navigation — no app state, just a Link.
    await switcherTrigger.click();
    const sheet = page.getByRole('dialog', { name: 'Ganti konteks' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('link', { name: /Keluarga Uji/ })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await sheet.getByRole('link', { name: 'Keuangan Saya' }).click();
    await expect(page).toHaveURL(/\/$/, DB_TIMEOUT);
    await expect(page.getByRole('button', { name: 'Personal' })).toBeVisible();

    // And back into the household via the switcher again.
    await page.getByRole('button', { name: 'Personal' }).click();
    await page
      .getByRole('dialog', { name: 'Ganti konteks' })
      .getByRole('link', { name: /Keluarga Uji/ })
      .click();
    await expect(page).toHaveURL(/\/household\/(?!new$)[^/]+$/, DB_TIMEOUT);
  });

  test('owner dapat mengubah nama & zona waktu, lalu mengarsipkan household', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/household/new');
    await page.getByLabel('Nama keluarga').fill('Sebelum Ubah');
    await page.getByRole('button', { name: 'Buat Keluarga' }).click();
    await expect(page).toHaveURL(/\/household\/(?!new$)[^/]+$/, DB_TIMEOUT);
    const householdUrl = page.url();

    await page.getByRole('link', { name: 'Pengaturan' }).click();
    await expect(page).toHaveURL(/\/settings$/, DB_TIMEOUT);

    await page.getByLabel('Nama keluarga').fill('Sesudah Ubah');
    await page.getByRole('button', { name: 'Simpan perubahan' }).click();
    // exact:true — Radix Toast also renders a visually-hidden live-region
    // announcer ("Notification Tersimpan"), which a substring match on
    // 'Tersimpan' alone also resolves to (see e2e/transactions.spec.ts's
    // identical fix).
    await expect(page.getByText('Tersimpan', { exact: true })).toBeVisible(DB_TIMEOUT);

    await page.goto(householdUrl);
    await expect(page.getByRole('heading', { name: 'Sesudah Ubah' })).toBeVisible(DB_TIMEOUT);

    // Archive — hides it from the switcher/list without touching anything
    // else. Confirmation dialog names the household (docs/10-ux-states.md §5.1).
    await page.getByRole('link', { name: 'Pengaturan' }).click();
    await page.getByRole('button', { name: 'Arsipkan keluarga' }).click();
    const confirmDialog = page.getByRole('dialog', { name: 'Arsipkan Sesudah Ubah?' });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Arsipkan' }).click();

    await expect(page).toHaveURL(/\/household$/, DB_TIMEOUT);
    // Archived -> back to zero visible households -> the empty state, no
    // switcher trace anywhere (same rule as a user who never had one).
    await expect(page.getByText('Kelola keuangan bersama')).toBeVisible(DB_TIMEOUT);
    await expect(page.getByRole('button', { name: /Personal/ })).toHaveCount(0);
  });

  test('household acak / tidak ada -> 404, bukan error', async ({ page }) => {
    await page.goto('/household/00000000-0000-0000-0000-000000000000');
    await expect(page.getByText('Keluarga tidak ditemukan')).toBeVisible();
  });
});
