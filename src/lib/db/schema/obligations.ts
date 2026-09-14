/**
 * Debts & receivables — docs/04-database-schema.md §10.
 *
 * `receivables` / `receivable_payments` mirror `debts` / `debt_payments`
 * structurally (per docs/04 §10: "identik strukturnya"), with `debtorName`
 * replacing `creditorName` — the ledger entry sign reversal itself lives in
 * the service layer (task 18), not in this schema.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { obligationStatusEnum } from './enums';
import { users } from './users';
import { wallets } from './wallets';
import { ledgerEntries } from './transactions';

export const debts = pgTable(
  'debts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creditorName: text('creditor_name').notNull(),
    counterpartyUserId: uuid('counterparty_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    initialAmount: bigint('initial_amount', { mode: 'bigint' }).notNull(),
    remainingAmount: bigint('remaining_amount', { mode: 'bigint' }).notNull(), // CACHE of debt_payments
    interestRate: numeric('interest_rate', { precision: 7, scale: 4 }).default('0'),
    startDate: date('start_date').notNull(),
    dueDate: date('due_date'),
    status: obligationStatusEnum('status').notNull().default('active'),
    affectsWallet: boolean('affects_wallet').notNull().default(true),
    walletId: uuid('wallet_id').references(() => wallets.id, { onDelete: 'restrict' }),
    excludeFromHousehold: boolean('exclude_from_household').notNull().default(false),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('debts_user_status_idx').on(table.userId, table.status),
    index('debts_due_idx')
      .on(table.userId, table.dueDate)
      .where(sql`${table.status} IN ('active','partially_paid')`),
    check('debt_initial_positive', sql`${table.initialAmount} > 0`),
    check(
      'debt_remaining_valid',
      sql`${table.remainingAmount} >= 0 AND ${table.remainingAmount} <= ${table.initialAmount}`,
    ),
  ],
);

export const debtPayments = pgTable(
  'debt_payments',
  {
    id: uuid('id').primaryKey(),
    debtId: uuid('debt_id')
      .notNull()
      .references(() => debts.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    ledgerEntryId: uuid('ledger_entry_id')
      .notNull()
      .references(() => ledgerEntries.id, { onDelete: 'restrict' }),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    paymentDate: date('payment_date').notNull(),
    note: text('note'),
    idempotencyKey: text('idempotency_key'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('debt_payments_debt_idx')
      .on(table.debtId, table.paymentDate.desc())
      .where(sql`${table.voidedAt} IS NULL`),
    check('debt_payment_positive', sql`${table.amount} > 0`),
    // Idempotency enforcement — same shape as savings_contributions'
    // `sc_idempotency_uniq` (src/lib/db/schema/savings.ts): docs/05
    // §6 requires this for every payment-recording action, and a column
    // with no enforcing index is not real idempotency, just a place to
    // store a key nobody checks.
    uniqueIndex('dp_idempotency_uniq')
      .on(table.userId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ],
);

export const receivables = pgTable(
  'receivables',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    debtorName: text('debtor_name').notNull(),
    counterpartyUserId: uuid('counterparty_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    initialAmount: bigint('initial_amount', { mode: 'bigint' }).notNull(),
    remainingAmount: bigint('remaining_amount', { mode: 'bigint' }).notNull(), // CACHE of receivable_payments
    interestRate: numeric('interest_rate', { precision: 7, scale: 4 }).default('0'),
    startDate: date('start_date').notNull(),
    dueDate: date('due_date'),
    status: obligationStatusEnum('status').notNull().default('active'),
    affectsWallet: boolean('affects_wallet').notNull().default(true),
    walletId: uuid('wallet_id').references(() => wallets.id, { onDelete: 'restrict' }),
    excludeFromHousehold: boolean('exclude_from_household').notNull().default(false),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('receivables_user_status_idx').on(table.userId, table.status),
    index('receivables_due_idx')
      .on(table.userId, table.dueDate)
      .where(sql`${table.status} IN ('active','partially_paid')`),
    check('receivable_initial_positive', sql`${table.initialAmount} > 0`),
    check(
      'receivable_remaining_valid',
      sql`${table.remainingAmount} >= 0 AND ${table.remainingAmount} <= ${table.initialAmount}`,
    ),
  ],
);

export const receivablePayments = pgTable(
  'receivable_payments',
  {
    id: uuid('id').primaryKey(),
    receivableId: uuid('receivable_id')
      .notNull()
      .references(() => receivables.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    ledgerEntryId: uuid('ledger_entry_id')
      .notNull()
      .references(() => ledgerEntries.id, { onDelete: 'restrict' }),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    paymentDate: date('payment_date').notNull(),
    note: text('note'),
    idempotencyKey: text('idempotency_key'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('receivable_payments_receivable_idx')
      .on(table.receivableId, table.paymentDate.desc())
      .where(sql`${table.voidedAt} IS NULL`),
    check('receivable_payment_positive', sql`${table.amount} > 0`),
    // See debt_payments' `dp_idempotency_uniq` above — identical shape.
    uniqueIndex('rp_idempotency_uniq')
      .on(table.userId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ],
);
