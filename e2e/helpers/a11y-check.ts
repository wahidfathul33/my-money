import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Shared route-audit helpers — factored out of e2e/responsive.spec.ts's
 * original 4-route loop (tasks/02-app-shell-navigation/spec.md kriteria
 * penerimaan) so every OTHER spec that needs to reach a route requiring
 * seeded data (a created household, wallet, deposit, savings goal, debt...)
 * doesn't have to hand-roll the same two checks. tasks/23-hardening-and-launch's
 * "Audit Aksesibilitas" ("axe pada seluruh rute — nol pelanggaran") and
 * "Audit Performa" ("tanpa horizontal overflow pada 7 lebar") sections both
 * require EVERY real route, not a sample — see that task's spec.md/todo.md.
 *
 * Two separate exports (not just one combined function) because some
 * routes already have ONE of the two checks from an earlier task (e.g.
 * e2e/reports.spec.ts's household-reports overflow check) and only need
 * the other added — duplicating an existing check would violate this
 * suite's own "don't duplicate coverage" rule.
 */
export const A11Y_WIDTHS = [360, 375, 390, 430, 768, 1024, 1440];
const A11Y_HEIGHT = 844;

export async function checkNoHorizontalOverflow(page: Page, url: string): Promise<void> {
  for (const width of A11Y_WIDTHS) {
    await page.setViewportSize({ width, height: A11Y_HEIGHT });
    await page.goto(url);
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasOverflow, `${url} @ ${width}px punya horizontal overflow`).toBe(false);
  }
}

/**
 * Scans at 360px (the narrowest, most layout-constrained width — same
 * choice e2e/responsive.spec.ts and e2e/reports.spec.ts already make) in
 * both color schemes. Waits for a level-1 heading before scanning — most
 * routes here have a `loading.tsx` skeleton with no heading, and axe
 * shouldn't be scanning a deliberately-incomplete Suspense fallback.
 */
export async function checkAxeCleanAtEveryColorScheme(page: Page, url: string): Promise<void> {
  await page.setViewportSize({ width: 360, height: A11Y_HEIGHT });
  await page.goto(url);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.reload();
    await page.getByRole('heading', { level: 1 }).waitFor();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  }
}

/** Both checks, in the order responsive.spec.ts's own per-route describe
 * block runs them — the common case, for a route that has neither yet. */
export async function auditRouteA11y(page: Page, url: string): Promise<void> {
  await checkNoHorizontalOverflow(page, url);
  await checkAxeCleanAtEveryColorScheme(page, url);
}
