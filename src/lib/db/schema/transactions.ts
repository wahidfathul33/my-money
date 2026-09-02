/**
 * Transactions & ledger — docs/04-database-schema.md §7.
 *
 * No `transfer_group_id`, no `transfer_groups` table (ADR-023). Self-transfers
 * are already linked via `transaction_id` on both ledger entries; member
 * transfers link via `linked_transaction_id` between two transaction rows each
 * OWNED by their own user, even though both are written by the sender.
 *
 * `tx_created_by_rule` narrows rule 1.3's exception to exactly one shape: a row
 * with `created_by <> user_id` is only valid as the receiving side of a member
 * transfer. Every other shape is rejected by the database, not just by code.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { entrySourceEnum, transactionTypeEnum } from './enums';
import { households } from './households';
import { users } from './users';
import { categories } from './categories';
import { wallets } from './wallets';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id') // ownership
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'set null' }), // context TAG
    type: transactionTypeEnum('type').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'restrict' }),
    amount: bigint('amount', { mode: 'bigint' }).notNull(), // always positive; sign lives on the ledger
    transactionDate: timestamp('transaction_date', { withTimezone: true }).notNull(),
    note: text('note'),

    // Member transfer counterparty + two-sided link. Both NULL for ordinary
    // transactions and self-wallet transfers.
    counterpartyUserId: uuid('counterparty_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    linkedTransactionId: uuid('linked_transaction_id').references(
      (): AnyPgColumn => transactions.id,
      { onDelete: 'set null' },
    ),

    // Who wrote this row. Equal to user_id except on the receiving side of a
    // member transfer, which is written by the sender.
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }), // set when the owner sees it in Activity

    idempotencyKey: text('idempotency_key'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A transaction can only ever be linked once.
    uniqueIndex('tx_link_uniq')
      .on(table.linkedTransactionId)
      .where(sql`${table.linkedTransactionId} IS NOT NULL`),
    uniqueIndex('tx_idempotency_uniq')
      .on(table.userId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    index('tx_user_date_idx')
      .on(table.userId, table.transactionDate.desc(), table.id.desc())
      .where(sql`${table.voidedAt} IS NULL`),
    index('tx_user_category_date_idx')
      .on(table.userId, table.categoryId, table.transactionDate.desc())
      .where(sql`${table.voidedAt} IS NULL`),
    // Household aggregation.
    index('tx_household_date_idx')
      .on(table.householdId, table.transactionDate.desc())
      .where(sql`${table.householdId} IS NOT NULL AND ${table.voidedAt} IS NULL`),
    index('tx_household_member_idx')
      .on(table.householdId, table.userId, table.transactionDate.desc())
      .where(sql`${table.householdId} IS NOT NULL AND ${table.voidedAt} IS NULL`),
    // Activity: rows written by someone else and not yet seen by the owner.
    index('tx_unacknowledged_idx')
      .on(table.userId, table.transactionDate.desc())
      .where(sql`${table.acknowledgedAt} IS NULL AND ${table.voidedAt} IS NULL`),
    index('tx_note_trgm_idx').using('gin', table.note.op('gin_trgm_ops')),
    // Expression index for daily aggregation. Requires a literal (IMMUTABLE)
    // timezone. For MVP every user/household is treated as Asia/Jakarta — see
    // docs/04-database-schema.md §7.
    index('tx_user_local_date_idx')
      .on(table.userId, sql`((${table.transactionDate} AT TIME ZONE 'Asia/Jakarta')::date) DESC`)
      .where(sql`${table.voidedAt} IS NULL`),
    check('tx_amount_positive', sql`${table.amount} > 0`),
    check(
      'tx_category_rule',
      sql`(${table.type} = 'transfer' AND ${table.categoryId} IS NULL) OR (${table.type} <> 'transfer' AND ${table.categoryId} IS NOT NULL)`,
    ),
    // Counterparty only makes sense on a transfer, and can't be yourself.
    check(
      'tx_counterparty_rule',
      sql`${table.counterpartyUserId} IS NULL OR (${table.type} = 'transfer' AND ${table.counterpartyUserId} <> ${table.userId})`,
    ),
    // Linking is only possible when there's a counterparty.
    check(
      'tx_link_requires_counterparty',
      sql`${table.linkedTransactionId} IS NULL OR ${table.counterpartyUserId} IS NOT NULL`,
    ),
    check('tx_no_self_link', sql`${table.linkedTransactionId} <> ${table.id}`),
    // A row written by someone else is only valid on a member transfer.
    check(
      'tx_created_by_rule',
      sql`${table.createdBy} = ${table.userId} OR (${table.type} = 'transfer' AND ${table.counterpartyUserId} = ${table.createdBy})`,
    ),
  ],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    amount: bigint('amount', { mode: 'bigint' }).notNull(), // SIGNED: negative = out, positive = in
    source: entrySourceEnum('source').notNull(),
    transactionId: uuid('transaction_id').references(() => transactions.id, {
      onDelete: 'restrict',
    }),
    sourceId: uuid('source_id'), // polymorphic id: debt_payment, gold_lot, etc.
    entryDate: timestamp('entry_date', { withTimezone: true }).notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ledger_wallet_idx')
      .on(table.walletId, table.entryDate.desc())
      .where(sql`${table.voidedAt} IS NULL`),
    index('ledger_user_idx')
      .on(table.userId, table.entryDate.desc())
      .where(sql`${table.voidedAt} IS NULL`),
    index('ledger_tx_idx').on(table.transactionId),
    index('ledger_source_idx').on(table.source, table.sourceId),
    check('ledger_amount_nonzero', sql`${table.amount} <> 0`),
  ],
);
