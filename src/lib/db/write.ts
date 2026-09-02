/**
 * Transactional Neon connection — `neon-serverless` (WebSocket `Pool`).
 *
 * This is the ONLY connection allowed to write financial data. Unlike
 * `dbRead` (neon-http, see src/lib/db/read.ts), this driver supports real
 * multi-statement transactions with rollback. Every write that touches more
 * than one table — which is nearly every financial write in this app — MUST
 * run inside `dbWrite.transaction(async (tx) => { ... })`.
 *
 * Import boundary: only `src/lib/services/**` may import this module
 * (`no-restricted-imports` in eslint.config.mjs). Client Components can never
 * see it — bundling this file into client JS would leak DB credentials.
 * Server Components must not import it either: reads go through `dbRead`,
 * writes go through a service.
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema';

// Node.js has no global WebSocket implementation neon-serverless can use
// out of the box; `ws` provides one. This only runs on the server.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const dbWrite = drizzle({ client: pool, schema, casing: 'snake_case' });
