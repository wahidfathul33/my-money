/**
 * Net worth snapshots — docs/04-database-schema.md §12.
 *
 * Household snapshots are stored separately and NOT reconstructed from
 * personal snapshots — sharing scope can change at any time, and recomputing
 * later would produce historical numbers nobody was ever actually shown.
 */
import { pgTable, integer, bigint, date, index, jsonb, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { households } from './households';
import { users } from './users';

export const netWorthSnapshots = pgTable(
  'net_worth_snapshots',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    totalAssets: bigint('total_assets', { mode: 'bigint' }).notNull(),
    totalLiabilities: bigint('total_liabilities', { mode: 'bigint' }).notNull(),
    netWorth: bigint('net_worth', { mode: 'bigint' }).notNull(),
    breakdown: jsonb('breakdown').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('nw_user_date_uniq').on(table.userId, table.snapshotDate),
    index('nw_user_idx').on(table.userId, table.snapshotDate.desc()),
  ],
);

export const householdNetWorthSnapshots = pgTable(
  'household_net_worth_snapshots',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    totalAssets: bigint('total_assets', { mode: 'bigint' }).notNull(),
    totalLiabilities: bigint('total_liabilities', { mode: 'bigint' }).notNull(),
    netWorth: bigint('net_worth', { mode: 'bigint' }).notNull(),
    breakdown: jsonb('breakdown').notNull(), // { perMember[], perCategory }
    memberCount: integer('member_count').notNull(),
    contributingCount: integer('contributing_count').notNull(), // members with share_wealth on
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('hnw_household_date_uniq').on(table.householdId, table.snapshotDate),
    index('hnw_household_idx').on(table.householdId, table.snapshotDate.desc()),
  ],
);
