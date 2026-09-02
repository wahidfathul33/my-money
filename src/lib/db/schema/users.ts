/**
 * Identity & preferences — docs/04-database-schema.md §3.
 *
 * `accounts` / `sessions` / `verificationTokens` follow the Auth.js Drizzle
 * adapter shape (wired up in task 04), adjusted to this project's conventions:
 * snake_case DB columns/tables, UUID v7 primary keys generated in application
 * code (never `gen_random_uuid()`).
 */
import { boolean, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  image: text('image'),

  defaultCurrency: text('default_currency').notNull().default('IDR'),
  timezone: text('timezone').notNull().default('Asia/Jakarta'),
  locale: text('locale').notNull().default('id-ID'),
  // No inline .references() here on purpose, matching docs/04-database-schema.md
  // §5: users is defined before wallets exists, so the FK is added via a
  // separate ALTER TABLE in the migration (see drizzle/0000_init.sql tail),
  // exactly like the raw DDL does. This also sidesteps a genuine circular
  // type-inference cycle between users <-> wallets that TypeScript can't
  // resolve even with lazy callbacks, unlike the same-table self-references
  // elsewhere in this schema (categories.parentId, transactions.linkedTransactionId).
  defaultWalletId: uuid('default_wallet_id'),
  countReceivablesAsAsset: boolean('count_receivables_as_asset').notNull().default(false),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expiresAt: integer('expires_at'),
    tokenType: text('token_type'),
    scope: text('scope'),
    idToken: text('id_token'),
    sessionState: text('session_state'),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })],
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);
