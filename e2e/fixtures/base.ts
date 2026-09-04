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
 *
 * ---
 *
 * `waitForDomToSettle` (below) absorbs a second, unrelated class of
 * transient state: immediately after a fresh navigation, an element can
 * briefly exist TWICE — confirmed against both a `data-testid`-bearing
 * div and a plain `<input>` found only via `getByLabel` (no testid at
 * all), in BOTH `next dev` and a real `next start` production build, with
 * zero console/page errors either way. This is React 19 streaming SSR's
 * hydration handoff on this Next.js 16.3.4 build, not an application bug
 * — a real user could never notice or act inside the window — but
 * Playwright's own polling assertions can catch it mid-flight and
 * hard-fail on a strict-mode "resolved to 2 elements" before the
 * transient state resolves.
 *
 * The naive fix (poll until the element count stops changing, on
 * `requestAnimationFrame`) returns too early: the page can look stable
 * for a few frames BEFORE the second render pass even starts, so the
 * check passes right before the duplicate appears, not after it resolves.
 * Requiring true wall-clock stability — the count unchanged for a fixed
 * span, not just N frames — reliably straddles both the "before" and
 * "during" states.
 */
const SETTLE_STABLE_MS = 800;
const SETTLE_POLL_MS = 100;
const SETTLE_TIMEOUT_MS = 10_000; // real concurrent load (many e2e workers + integration
// tests sharing the dev server and Neon connection) widens the window well past what
// isolation testing showed — bounded so a REAL, persistent duplication bug still surfaces
// as a normal timeout failure downstream instead of silently passing.

/**
 * Auto-invoked after every `page.goto()` (below) — but that wrapper can't
 * see a CLIENT-SIDE transition (a Server Action's `redirect()`, or a Next
 * `<Link>` click), which goes through the router without ever calling
 * `page.goto`. Exported so a test can await it explicitly right after
 * triggering one of those, at the same spot it would otherwise hit a
 * strict-mode "resolved to 2 elements" on the next assertion.
 */
export async function waitForDomToSettle(page: import('@playwright/test').Page): Promise<void> {
  await page
    .waitForFunction(
      (args: { stableMs: number; pollMs: number }) => {
        const w = window as unknown as { __domSettleSince?: number; __domSettleLast?: number };
        // Total element count, not just `[data-testid]` — the duplication
        // isn't testid-specific, so narrowly watching testid'd elements
        // missed it entirely on a page whose duplicated element had none.
        const current = document.querySelectorAll('*').length;
        const now = Date.now();
        if (current !== w.__domSettleLast) {
          w.__domSettleLast = current;
          w.__domSettleSince = now;
          return false;
        }
        return now - (w.__domSettleSince ?? now) >= args.stableMs - args.pollMs / 2;
      },
      { stableMs: SETTLE_STABLE_MS, pollMs: SETTLE_POLL_MS },
      { polling: SETTLE_POLL_MS, timeout: SETTLE_TIMEOUT_MS },
    )
    .catch(() => {}); // best-effort — a genuinely unstable page still fails at the real assertion below
}

/** The actual portal-neutralizing script — factored out so
 * `suppressDevOverlay` (below) can apply the exact same fix to a manually
 * created `BrowserContext`, not just the `page` fixture's own context. */
function neutralizeDevOverlayPortal(): void {
  // A plain `<style>` node appended to the document gets wiped the
  // moment React hydrates (it reconciles <html> against the
  // server-rendered tree and discards children it didn't render) —
  // confirmed by inspecting the live DOM, the node was gone post-
  // hydration. `adoptedStyleSheets` lives outside the DOM tree
  // entirely, so it survives hydration.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('nextjs-portal { pointer-events: none !important; }');
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(neutralizeDevOverlayPortal);

    const originalGoto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await originalGoto(url, options);
      await waitForDomToSettle(page);
      return response;
    };

    await use(page);
  },
});

/**
 * The SAME `<nextjs-portal>` fix as the `page` fixture above, exposed for
 * specs that need MULTIPLE independent sessions at once (two or more
 * `browser.newContext()` calls, e.g. e2e/household-membership.spec.ts and
 * e2e/transfers-member.spec.ts) and therefore never request the single
 * `page` fixture at all — so its override above never runs for them. Call
 * once per manually-created context, before `context.newPage()`.
 *
 * Without this, a two-context spec that clicks anything near where the dev
 * overlay's issues badge renders (confirmed: the Add Transaction sheet's
 * bottom-aligned amount keypad) hangs on that click, retrying for the
 * full test timeout, with no application-level error — see
 * e2e/transfers-member.spec.ts's own doc comment for how this was
 * root-caused.
 */
export async function suppressDevOverlay(context: import('@playwright/test').BrowserContext): Promise<void> {
  await context.addInitScript(neutralizeDevOverlayPortal);
}

export { expect };
