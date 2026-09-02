/**
 * Budgets — docs/04-database-schema.md §11.
 *
 * `category_key` refers to `categories.system_key`, not `categories.id` — a
 * household "food & drinks" budget matches the corresponding built-in
 * category of any member, exactly.
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
import { budgetPeriodEnum } from './enums';
import { households } from './households';
import { users } from './users';
import { categories } from './categories';

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // NULL if household
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }), // NULL if personal
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }), // personal budget
    categoryKey: text('category_key'), // household budget
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    periodType: budgetPeriodEnum('period_type').notNull().default('monthly'),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    isRecurring: boolean('is_recurring').notNull().default(true),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('budgets_personal_uniq')
      .on(table.userId, table.categoryId, table.periodStart)
      .where(sql`${table.userId} IS NOT NULL`),
    uniqueIndex('budgets_household_uniq')
      .on(table.householdId, table.categoryKey, table.periodStart)
      .where(sql`${table.householdId} IS NOT NULL`),
    index('budgets_period_idx').on(table.periodStart.desc()),
    check('budget_amount_positive', sql`${table.amount} > 0`),
    check('budget_period_valid', sql`${table.periodEnd} >= ${table.periodStart}`),
    // Exactly one scope: personal (category_id) OR household (category_key).
    check(
      'budget_scope_exclusive',
      sql`(${table.userId} IS NOT NULL AND ${table.householdId} IS NULL AND ${table.categoryId} IS NOT NULL AND ${table.categoryKey} IS NULL) OR (${table.householdId} IS NOT NULL AND ${table.userId} IS NULL AND ${table.categoryKey} IS NOT NULL AND ${table.categoryId} IS NULL)`,
    ),
  ],
);
