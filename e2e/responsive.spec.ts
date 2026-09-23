import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures/authenticated';

// tasks/02-app-shell-navigation/spec.md kriteria penerimaan: "Test
// responsif lulus di 360/375/390/430/768/1024/1440 tanpa horizontal
// overflow." Lebar ini mencakup ponsel kecil, ponsel besar, tablet, dan
// dua lebar desktop (docs/07 §7 breakpoint table).
const WIDTHS = [360, 375, 390, 430, 768, 1024, 1440];
const HEIGHT = 844;

// Empat rute placeholder task ini (tasks/02/todo.md "Halaman Placeholder"),
// plus setiap rute lain yang tidak butuh setup khusus di luar sesi
// authedUserId (tanpa household, tanpa entitas kekayaan yang dibuat) —
// tasks/23-hardening-and-launch's "Audit Aksesibilitas"/"Audit Performa"
// menuntut seluruh rute, bukan sampel. Rute yang butuh data seed (halaman
// household, detail dompet/deposito/target tabungan, /onboarding,
// /invite/[token]) punya cakupan sendiri di describe block/spec file lain
// — lihat e2e/helpers/a11y-check.ts dan file-file yang mengimpornya.
const ROUTES = [
  '/',
  '/transactions',
  '/wealth',
  '/settings',
  '/activity',
  '/budgets',
  '/wallets',
  '/household',
  '/household/new',
];

for (const route of ROUTES) {
  test.describe(`Responsif — ${route}`, () => {
    for (const width of WIDTHS) {
      test(`${width}px tanpa horizontal overflow`, async ({ page }) => {
        await page.setViewportSize({ width, height: HEIGHT });
        await page.goto(route);
        const hasOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(hasOverflow, `${route} @ ${width}px punya horizontal overflow`).toBe(false);
      });
    }

    test('axe melaporkan nol pelanggaran (360px, mode terang & gelap)', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: HEIGHT });
      await page.goto(route);
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        await page.reload();
        // Rute punya `loading.tsx` (skeleton, tanpa heading) — tunggu
        // konten final ter-render dulu, supaya axe tidak memindai fallback
        // Suspense yang sengaja tak lengkap (bukan pelanggaran sungguhan).
        await page.getByRole('heading', { level: 1 }).waitFor();
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
      }
    });
  });
}
