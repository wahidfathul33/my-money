/**
 * Recurring transactions & auto savings contributions —
 * tasks/24-recurring-transactions/spec.md "Skema Database".
 *
 * Ownership model (spec.md "Model Kepemilikan"): NEITHER table is a
 * household-owned rule. Each row is owned by exactly ONE user, using a
 * wallet THAT user owns — identical to how an ordinary `transactions` row
 * works today. `household_id` on `recurring_transactions` (nullable, same
 * shape as `transactions.household_id`) only tags the transaction rows a
 * materialization run PRODUCES as visible to the household — it is not a
 * household-shared rule, and there is deliberately no separate
 * household-owned recurring concept here.
 *
 * `start_date`/`end_date`/`next_run_date` are plain `date` columns, not
 * `timestamp` — spec.md is explicit about why: a recurring schedule is pure
 * calendar arithmetic ("tiap tanggal 1"), and forcing a `timestamp` would
 * both pick an arbitrary irrelevant hour and complicate the
 * `next_run_date <= today` comparison the cron needs, per user timezone.
 * `transactions.transaction_date` itself stays untouched (`timestamp`) —
 * src/lib/date/recurring.ts's `localDateToNoonUtc` bridges the two at
 * materialization time.
 */
import { sql } from 'drizzle-orm';
import { bigint, check, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { categoryTypeEnum, recurringFrequencyEnum, recurringStatusEnum } from './enums';
import { households } from './households';
import { users } from './users';
import { categories } from './categories';
import { wallets } from './wallets';
import { savingsGoals } from './savings';

export const recurringTransactions = pgTable(
  'recurring_transactions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Tag only — see this module's file header. NOT a household-owned rule.
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'set null' }),
    type: categoryTypeEnum('type').notNull(), // 'income' | 'expense' only — reused, no new enum (spec.md).
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    note: text('note'),
    frequency: recurringFrequencyEnum('frequency').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'), // NULL = no end
    nextRunDate: date('next_run_date').notNull(),
    status: recurringStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The cron's own daily query: every active rule due today or earlier.
    index('rt_status_next_run_idx').on(table.status, table.nextRunDate),
    index('rt_user_idx').on(table.userId),
    check('rt_amount_positive', sql`${table.amount} > 0`),
    check(
      'rt_end_date_valid',
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
  ],
);

export const recurringSavingsContributions = pgTable(
  'recurring_savings_contributions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => savingsGoals.id, { onDelete: 'restrict' }),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    // No separate `amount`-shaping needed beyond what `contribute()` already
    // takes — this IS the amount contributed each cycle (spec.md).
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    frequency: recurringFrequencyEnum('frequency').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    nextRunDate: date('next_run_date').notNull(),
    status: recurringStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('rsc_status_next_run_idx').on(table.status, table.nextRunDate),
    index('rsc_user_idx').on(table.userId),
    index('rsc_goal_idx').on(table.goalId),
    check('rsc_amount_positive', sql`${table.amount} > 0`),
    check(
      'rsc_end_date_valid',
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
  ],
);
