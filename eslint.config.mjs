import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import localRulesPlugin from './eslint-rules/index.js';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Project-specific:
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    '.claude/worktrees/**',
    'drizzle/**',
  ]),

  // Financial integrity — docs/05-financial-integrity.md.
  // 1. Money is always bigint, never number (§2).
  // 2. dbRead (neon-http) is read-only; writes go through dbWrite (§1).
  {
    plugins: { local: localRulesPlugin },
    rules: {
      'local/no-money-number': 'error',
      'local/no-db-read-mutation': 'error',
    },
  },

  // Playwright fixtures conventionally destructure a `use` callback (e.g.
  // `async ({ page }, use) => { ... await use(x) ... }`) — eslint-plugin-
  // react-hooks (from eslint-config-next) matches that against React's
  // `use()` hook and flags it. e2e/**/*.ts isn't React code; disable the
  // hooks rule there rather than littering per-line disable comments.
  {
    files: ['e2e/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },

  // 3. dbWrite is the only connection allowed to touch financial tables, and
  // only lib/services/** may import it (docs/11-tech-architecture.md §3).
  // Everything else — Server Components, Client Components, features/**,
  // lib/finance/** — writes through a service instead.
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['src/lib/services/**', '**/__tests__/**', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/lib/db/write',
              message:
                'Only src/lib/services/** may import dbWrite — writes are centralized there. See docs/11-tech-architecture.md §3.',
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
