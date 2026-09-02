/**
 * Shared DB-layer types.
 *
 * Deliberately does NOT re-export `dbRead` or `dbWrite` — importing this
 * barrel should never accidentally pull in a live connection. Callers import
 * `@/lib/db/read` or `@/lib/db/write` explicitly, so the import boundary
 * (`no-restricted-imports` in eslint.config.mjs) can target `@/lib/db/write`
 * precisely.
 *
 * `TransactionClient` is exported here (type-only) rather than from
 * `@/lib/db/write` directly so that `src/lib/finance/ledger.ts` — which needs
 * the type to declare `postEntries(tx: TransactionClient, ...)` — never has
 * to import the write module itself, live connection included.
 */
import type { dbWrite } from './write';

export type TransactionClient = Parameters<Parameters<typeof dbWrite.transaction>[0]>[0];
