/**
 * Wallets — docs/04-database-schema.md §5.
 *
 * `balance` is a CACHE. The source of truth is `ledger_entries`; the only
 * function allowed to write `balance` is `postEntries` (src/lib/finance/ledger.ts).
 *
 * No `household_id` here, and no permission table attached to wallets. A
 * wallet is owned by exactly one user, forever — see docs/04 §1 rule 1/2 and
 * docs/16-decision-log.md ADR-024.
 */
import { bigint, boolean, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { walletTypeEnum } from './enums';
import { users } from './users';

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: walletTypeEnum('type').notNull(),
    // CACHE. Never write directly — see src/lib/finance/ledger.ts postEntries.
    balance: bigint('balance', { mode: 'bigint' }).notNull().default(sql`0`),
    currency: text('currency').notNull().default('IDR'),
    icon: text('icon').notNull().default('dompet'),
    color: text('color').notNull().default('slate'),
    isArchived: boolean('is_archived').notNull().default(false),

    // Exclusion from household wealth; only meaningful when share_wealth is on.
    excludeFromHousehold: boolean('exclude_from_household').notNull().default(false),

    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('wallets_user_active_idx').on(table.userId, table.isArchived, table.sortOrder),
    check('wallets_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check(
      'wallets_cc_non_positive',
      sql`${table.type} <> 'credit_card' OR ${table.balance} <= 0`,
    ),
  ],
);
