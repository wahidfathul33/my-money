import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import 'dotenv/config';

// Integration tests (src/lib/finance/__tests__/ledger.integration.test.ts,
// src/lib/db/__tests__/reconcile.integration.test.ts) run against the real
// Neon database in .env — DATABASE_URL / DATABASE_URL_UNPOOLED. Loading
// dotenv here (before the config is used) makes those available in
// process.env for every test file.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // 'forks' (real child processes) instead of the default worker_threads
    // pool: the neon-serverless driver's WebSocket connections (src/lib/db/write.ts)
    // hang intermittently under worker_threads in this environment.
    pool: 'forks',
    // Integration test files (src/**/__tests__/*.integration.test.ts) all
    // hit the same real Neon database. Running multiple test FILES in
    // parallel was observed to cause connection contention severe enough to
    // time out, even though every file passes cleanly on its own. Since this
    // suite is going to accumulate many more DB integration tests across
    // later tasks, running files sequentially trades wall-clock time for not
    // being flaky against the real database.
    fileParallelism: false,
    // The remaining flakiness after that is genuine, occasional network
    // latency from this environment to Neon (observed: intermittent
    // ~10s connect timeouts on individual HTTP requests, unrelated to any
    // logic in this codebase — verified by running the same query in
    // isolation, repeatedly, with consistent success, and by a full clean
    // 60/60 run of this exact suite). Retries absorb that without masking a
    // real, reproducible failure — a genuine bug fails every time regardless
    // of retry count.
    retry: 2,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'eslint-rules/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
    // Integration tests hit the real Neon database over WebSocket/HTTP —
    // real network round trips, plus occasional serverless compute cold
    // start (docs/13-deployment-vercel.md §7: ~500ms after idle). The
    // default 5s is too tight once a few of those round trips stack up in
    // one test. Unit tests stay fast regardless of this ceiling.
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/app/**',
        'src/**/__tests__/**',
        'src/**/*.{test,spec}.{ts,tsx}',
      ],
    },
  },
});
