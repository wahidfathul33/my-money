import { test as base, expect } from '@playwright/test';

/**
 * Drop-in replacement for `@playwright/test`'s `test` that neutralizes
 * Next.js's dev-mode devtools indicator (the "N" badge / Issues panel,
 * rendered as a <nextjs-portal> custom element). It's a dev-only tool with
 * no production equivalent — not part of the app under test — but it can
 * sit on top of real UI and swallow clicks; confirmed via Playwright's own
 * action log ("<nextjs-portal> ... intercepts pointer events"),
 * reproduced deterministically against the desktop sidebar's "+ Tambah"
 * button. `next.config.ts`'s `devIndicators: false` only covers the
 * legacy build-activity dot, not this newer Issues panel, and the
 * server-side `/__nextjs_disable_dev_indicator` endpoint the badge's own
 * "Collapse" button calls didn't reliably suppress it either — so this is
 * fixed at the test-infra layer instead of chasing Next's devtools
 * internals: `pointer-events: none` on the portal, not `display: none`, so
 * it stays visible in screenshots/traces but can never intercept a click.
 *
 * Every other e2e fixture (see `authenticated.ts`) builds on this one —
 * import `test`/`expect` from here (or from `authenticated.ts`) instead of
 * `@playwright/test` directly in every spec file.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      // A plain `<style>` node appended to the document gets wiped the
      // moment React hydrates (it reconciles <html> against the
      // server-rendered tree and discards children it didn't render) —
      // confirmed by inspecting the live DOM, the node was gone post-
      // hydration. `adoptedStyleSheets` lives outside the DOM tree
      // entirely, so it survives hydration.
      const sheet = new CSSStyleSheet();
      sheet.replaceSync('nextjs-portal { pointer-events: none !important; }');
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    });
    await use(page);
  },
});

export { expect };
