/**
 * Auth.js Drizzle adapter, wired to our schema — see src/lib/db/schema/users.ts.
 *
 * This file (not src/lib/auth/**) is where `@/lib/db/write` gets imported,
 * because only src/lib/services/** may do that (`no-restricted-imports` in
 * eslint.config.mjs, docs/11-tech-architecture.md §3). src/lib/auth/options.ts
 * imports `authAdapter` from here, never `dbWrite` directly.
 *
 * Two adjustments on top of the stock `@auth/drizzle-adapter`:
 *
 * 1. **Account column names.** Auth.js core builds the OAuth token fields it
 *    hands the adapter (`refresh_token`, `access_token`, `expires_at`,
 *    `token_type`, `id_token`, `session_state`) as snake_case JS object keys
 *    — see @auth/core's `AdapterAccount`/`TokenEndpointResponse` types. Our
 *    `accounts` table (src/lib/db/schema/users.ts) names those same DB
 *    columns with camelCase JS keys, matching this project's convention.
 *    Drizzle's insert builder keys off the VALUE OBJECT's own property
 *    names, not the table's declared field names (see
 *    `PgInsertBuilder.values` in drizzle-orm/pg-core), so handing the
 *    adapter our schema table directly would silently insert NULL for
 *    every one of those columns on every OAuth sign-in — no error, just
 *    quietly wrong data. `accountsAdapterView` is a second table
 *    descriptor for the SAME `accounts` table/columns, named the way
 *    Auth.js expects. It changes nothing about the database.
 *
 * 2. **User id generation.** Auth.js core hardcodes `crypto.randomUUID()`
 *    (UUID v4) for every new user's id, for both OAuth and magic-link
 *    sign-in, with no configuration hook to change it (see
 *    `getUserAndAccount` in @auth/core/lib/actions/callback/oauth/callback.js
 *    and the equivalent email-flow path in
 *    @auth/core/lib/actions/callback/index.js). Every other primary key in
 *    this app is UUID v7, generated in application code — see
 *    src/lib/db/schema/users.ts and docs/04-database-schema.md. We override
 *    `createUser` to replace the id before it's persisted, so `users.id`
 *    stays consistent with the rest of the schema.
 */
import { integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import type { Adapter } from 'next-auth/adapters';
import { dbWrite } from '@/lib/db/write';
import { sessions, users, verificationTokens } from '@/lib/db/schema/users';

const accountsAdapterView = pgTable(
  'accounts',
  {
    userId: uuid('user_id').notNull(),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })],
);

const baseAdapter = DrizzleAdapter(dbWrite, {
  usersTable: users,
  accountsTable: accountsAdapterView,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

export const authAdapter: Adapter = {
  ...baseAdapter,
  async createUser(data) {
    if (!baseAdapter.createUser) {
      throw new Error('authAdapter: base adapter has no createUser');
    }
    return baseAdapter.createUser({ ...data, id: uuidv7() });
  },
};
