/**
 * Savings — docs/04-database-schema.md §8.
 *
 * `savings_contributions.ledger_entry_id NOT NULL` is the single most
 * important constraint in this module: it makes it structurally impossible
 * to bump the savings figure without money actually moving out of a wallet.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { savingsStatusEnum } from './enums';
import { households } from './households';
import { users } from './users';
import { wallets } from './wallets';
import { ledgerEntries } from './transactions';

export const savingsGoals = pgTable(
  'savings_goals',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id') // creator
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'set null' }), // NULL = personal
    name: text('name').notNull(),
    targetAmount: bigint('target_amount', { mode: 'bigint' }).notNull(),
    currentAmount: bigint('current_amount', { mode: 'bigint' }).notNull().default(sql`0`), // CACHE of savings_contributions
    targetDate: date('target_date'),
    status: savingsStatusEnum('status').notNull().default('active'),
    icon: text('icon').notNull().default('target'),
    color: text('color').notNull().default('emerald'),
    excludeFromHousehold: boolean('exclude_from_household').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sg_user_status_idx').on(table.userId, table.status),
    index('sg_household_status_idx')
      .on(table.householdId, table.status)
      .where(sql`${table.householdId} IS NOT NULL`),
    check('sg_target_positive', sql`${table.targetAmount} > 0`),
    check('sg_current_nonneg', sql`${table.currentAmount} >= 0`),
  ],
);

export const savingsContributions = pgTable(
  'savings_contributions',
  {
    id: uuid('id').primaryKey(),
    savingsGoalId: uuid('savings_goal_id')
      .notNull()
      .references(() => savingsGoals.id, { onDelete: 'restrict' }),
    userId: uuid('user_id') // contributor
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),

    // NOT NULL: this is what makes double counting structurally impossible.
    ledgerEntryId: uuid('ledger_entry_id')
      .notNull()
      .references(() => ledgerEntries.id, { onDelete: 'restrict' }),

    amount: bigint('amount', { mode: 'bigint' }).notNull(), // + contribution, − withdrawal
    contributionDate: timestamp('contribution_date', { withTimezone: true }).notNull(),
    note: text('note'),
    idempotencyKey: text('idempotency_key'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sc_goal_idx')
      .on(table.savingsGoalId, table.contributionDate.desc())
      .where(sql`${table.voidedAt} IS NULL`),
    index('sc_user_idx')
      .on(table.userId, table.contributionDate.desc())
      .where(sql`${table.voidedAt} IS NULL`),
    uniqueIndex('sc_idempotency_uniq')
      .on(table.userId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    check('sc_amount_nonzero', sql`${table.amount} <> 0`),
  ],
);
