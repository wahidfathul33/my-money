/**
 * Categories — docs/04-database-schema.md §6.
 *
 * `system_key` (not name matching) is what makes household aggregation exact:
 * "Makan & Minum" owned by two different members share the same `system_key`
 * and collapse onto one report row regardless of what either renamed it to.
 * The canonical catalog itself lives in code (src/lib/db/seed/categories.ts,
 * added when the seeding task lands), not in the database.
 *
 * Depth is capped at one level by the `categories_depth_check` trigger,
 * hand-authored in a SQL migration (Drizzle's schema DSL has no trigger
 * builder) — see drizzle/0001_category_depth_trigger.sql.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { categoryTypeEnum } from './enums';
import { users } from './users';

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'restrict',
    }),
    name: text('name').notNull(),
    // GENERATED ALWAYS AS (lower(btrim(name))) STORED — used for uniqueness.
    nameNorm: text('name_norm').generatedAlwaysAs(
      (): SQL => sql`lower(btrim(${categories.name}))`,
    ),
    type: categoryTypeEnum('type').notNull(),

    // Canonical key for built-in categories. NULL for custom categories.
    // This is what makes household aggregation exact.
    systemKey: text('system_key'),

    icon: text('icon').notNull().default('tag'),
    color: text('color').notNull().default('slate'),
    isArchived: boolean('is_archived').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One built-in category per key per user.
    uniqueIndex('categories_user_system_key_uniq')
      .on(table.userId, table.systemKey)
      .where(sql`${table.systemKey} IS NOT NULL`),
    uniqueIndex('categories_user_name_type_uniq')
      .on(table.userId, table.nameNorm, table.type)
      .where(sql`${table.isArchived} = false`),
    index('categories_user_type_idx').on(table.userId, table.type, table.isArchived),
    index('categories_system_key_idx')
      .on(table.systemKey)
      .where(sql`${table.systemKey} IS NOT NULL`),
    check('categories_no_self_parent', sql`${table.id} <> ${table.parentId}`),
    // Built-in categories can't have a parent; hierarchy is for custom ones only.
    check(
      'categories_system_no_parent',
      sql`${table.systemKey} IS NULL OR ${table.parentId} IS NULL`,
    ),
  ],
);
