import { expect, test } from '@playwright/test';

test('halaman utama memuat', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'MyMoney' })).toBeVisible();
});
