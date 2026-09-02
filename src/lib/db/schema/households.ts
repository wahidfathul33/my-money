/**
 * Household — docs/04-database-schema.md §4.
 *
 * No balance, no total-assets, no financial value of any kind on `households`.
 * Every household number is computed at query time from data owned by its
 * members. Sharing is opt-in via exactly two mechanisms — see docs/03-domain-model.md
 * §5 — and NOT via a per-object ACL: `wallet_access` was deliberately removed,
 * see docs/16-decision-log.md ADR-024. `transfer_groups` was likewise removed —
 * see ADR-023.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { householdRoleEnum, invitationStatusEnum, membershipStatusEnum } from './enums';
import { users } from './users';

export const households = pgTable(
  'households',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    defaultCurrency: text('default_currency').notNull().default('IDR'),
    timezone: text('timezone').notNull().default('Asia/Jakarta'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('households_name_not_blank', sql`length(btrim(${table.name})) > 0`)],
);

export const householdMembers = pgTable(
  'household_members',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: householdRoleEnum('role').notNull().default('member'),
    status: membershipStatusEnum('status').notNull().default('active'),

    // The only wealth-sharing switch. Default: not shared.
    shareWealth: boolean('share_wealth').notNull().default(false),

    joinedAt: timestamp('joined_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Full UNIQUE (not partial): a membership that was ever `removed` still
    // blocks a duplicate row — rejoining updates the existing row instead.
    uniqueIndex('hm_unique_membership').on(table.householdId, table.userId),
    index('hm_user_active_idx').on(table.userId, table.status),
    index('hm_household_active_idx').on(table.householdId, table.status),
    // Every household must have exactly one active owner.
    uniqueIndex('hm_single_owner_idx')
      .on(table.householdId)
      .where(sql`${table.role} = 'owner' AND ${table.status} = 'active'`),
    // Members sharing wealth — used by household net worth aggregation.
    index('hm_sharing_idx')
      .on(table.householdId)
      .where(sql`${table.status} = 'active' AND ${table.shareWealth} = true`),
  ],
);

export const householdInvitations = pgTable(
  'household_invitations',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: householdRoleEnum('role').notNull().default('member'),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // SHA-256; the raw token only ever lives in the invitation email.
    tokenHash: text('token_hash').notNull(),
    status: invitationStatusEnum('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedBy: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('hi_token_uniq').on(table.tokenHash),
    uniqueIndex('hi_pending_uniq')
      .on(table.householdId, table.email)
      .where(sql`${table.status} = 'pending'`),
    index('hi_email_pending_idx')
      .on(table.email, table.status)
      .where(sql`${table.status} = 'pending'`),
    check('hi_email_lower', sql`${table.email} = lower(${table.email})`),
  ],
);
