import { expect, test } from './fixtures/base';

// task 00's placeholder `src/app/page.tsx` (bootstrap) is superseded by
// `src/app/(app)/page.tsx` (the real, protected dashboard — task 04) at the
// same route ('/'). Route groups don't add a URL segment, so '/' now goes
// through the (app) auth guard: an unauthenticated visit redirects to
// /signin instead of rendering a public "MyMoney" heading directly.
test('halaman utama tanpa sesi dialihkan ke /signin', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/signin/);
  await expect(page.getByRole('heading', { name: 'Masuk ke MyMoney' })).toBeVisible();
});
