import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

// e2e/auth.spec.ts talks to the real Neon database directly (seeding a
// session row + cookie to bypass the Google OAuth UI, which can't safely be
// automated here — see that file's doc comment) — it needs DATABASE_URL
// from .env in the Playwright test-runner process itself, same as
// vitest.config.ts does for the integration tests.

// Overridable via PLAYWRIGHT_PORT — running several worktrees of this repo
// side by side (task branches under .claude/worktrees/**) means several
// independent `next dev` processes can end up racing for the same fixed
// port on the same machine. `reuseExistingServer` (below) then silently
// attaches this run to WHICHEVER process got there first, including one
// from a completely different worktree/branch — no error, just every
// assertion here running against the wrong app. The default (3100) is
// unchanged for everyone who isn't hitting that collision.
const PORT = Number(process.env.PLAYWRIGHT_PORT) || 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Every spec now authenticates via the real dbWrite session-seed fixture
  // (e2e/fixtures/authenticated.ts), and most navigate through (app) routes
  // that do their own DB reads. Combined with `next dev`/Turbopack's
  // on-demand first-hit compile of a route, this occasionally exceeds the
  // 30s default — e2e/auth.spec.ts already documented and worked around
  // this per-test before the fixture existed; raising it globally now that
  // every spec hits the same real network+compile cost.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Every spec now authenticates via a real dbWrite session-seed (the
  // e2e/fixtures/authenticated.ts auto-fixture, added when task 04's auth
  // guard started protecting the routes task 02's suites navigate to).
  // Unbounded local parallelism (`undefined` = CPU count) hammers the real
  // Neon connection hard enough to time out fixture setup itself — the same
  // contention vitest.config.ts documents for integration test files.
  workers: process.env.CI ? 1 : 4,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'Mobile Chrome (Pixel 5)',
      use: { ...devices['Pixel 5'] },
      // e2e/auth.spec.ts writes directly to the real Neon database (real
      // dbWrite.transaction calls, same as the DB integration tests) and
      // asserts no responsive/viewport behavior, so it doesn't need
      // mobile+desktop duplication. Running it in both projects at once —
      // on top of fullyParallel test-level concurrency within the file —
      // was observed to cause the same real-DB connection contention
      // vitest.config.ts documents for parallel integration test files
      // (timeouts, occasional error-boundary crashes). Desktop-only avoids
      // doubling that load; test.describe.configure({ mode: 'serial' }) in
      // the file itself handles the intra-file part.
      testIgnore: /e2e\/auth\.spec\.ts/,
    },
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
