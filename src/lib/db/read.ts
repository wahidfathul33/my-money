/**
 * Read-only Neon connection — `neon-http`.
 *
 * Neon has two drivers, and picking the wrong one silently destroys
 * atomicity (docs/05-financial-integrity.md §1):
 *
 *   neon-http (this file)  — each statement is its own HTTP request. The
 *                             pinned drizzle-orm version does at least throw
 *                             loudly if you call `.transaction(...)` on it
 *                             ("No transactions support in neon-http
 *                             driver") — see
 *                             ledger.rollback.integration.test.ts. But that
 *                             only covers the .transaction() wrapper: a
 *                             sequence of separate, un-wrapped statements has
 *                             NO atomicity at all, and no error either — if
 *                             the second of three writes fails, the first
 *                             one's effect just stays, permanently, with
 *                             nothing to report it.
 *   neon-serverless (Pool) — real, WebSocket-backed transactions. Used by
 *                             every financial write — see src/lib/db/write.ts.
 *
 * Because of that, `dbRead` is for SELECT only, and its exported type
 * deliberately omits `insert` / `update` / `delete` / `transaction`, so
 * misuse fails at compile time. The `local/no-db-read-mutation` ESLint rule
 * (eslint-rules/no-db-read-mutation.js) catches it at the AST level too, in
 * case of an `as` cast around the type.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);

const db = drizzle({ client: sql, schema, casing: 'snake_case' });

/** Read-only surface of the neon-http connection. Never write through this. */
export type ReadOnlyDb = Omit<typeof db, 'insert' | 'update' | 'delete' | 'transaction'>;

export const dbRead: ReadOnlyDb = db;
