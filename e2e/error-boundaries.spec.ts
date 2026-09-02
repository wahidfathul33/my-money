import { expect, test } from '@playwright/test';

test.describe('Batas error & not-found', () => {
  test('404: pesan actionable + tautan kembali ke Beranda', async ({ page }) => {
    await page.goto('/definitely-not-a-real-route-xyz');
    await expect(page.getByRole('heading', { name: 'Halaman tidak ditemukan' })).toBeVisible();
    await page.getByRole('link', { name: 'Kembali ke Beranda' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('app/(app)/error.tsx: shell (nav) tetap utuh, isi diganti error + tombol coba lagi', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/dev-error-test');

    await expect(page.getByRole('heading', { name: 'Halaman ini gagal dimuat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Coba lagi' })).toBeVisible();
    // Shell tetap utuh — sidebar/nav masih ter-render di sekitar error.
    await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Beranda' })).toBeVisible();
  });

  test('app/error.tsx (root): menangkap kegagalan di luar grup (app), tanpa shell', async ({
    page,
  }) => {
    await page.goto('/dev-root-error-test');
    await expect(page.getByRole('heading', { name: 'Halaman gagal dimuat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Coba lagi' })).toBeVisible();
    // Di luar (app) — tidak ada nav shell untuk dijaga.
    await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toHaveCount(0);
  });
});
