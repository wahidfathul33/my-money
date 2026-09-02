import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures/authenticated';

// tasks/02-app-shell-navigation/spec.md kriteria penerimaan: "Test
// responsif lulus di 360/375/390/430/768/1024/1440 tanpa horizontal
// overflow." Lebar ini mencakup ponsel kecil, ponsel besar, tablet, dan
// dua lebar desktop (docs/07 §7 breakpoint table).
const WIDTHS = [360, 375, 390, 430, 768, 1024, 1440];
const HEIGHT = 844;

// Empat rute placeholder task ini (tasks/02/todo.md "Halaman Placeholder").
const ROUTES = ['/', '/transactions', '/wealth', '/settings'];

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
