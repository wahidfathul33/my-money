/**
 * Assets — docs/04-database-schema.md §9.
 *
 * `assets` holds shared attributes; value is always DERIVED from the
 * type-specific table. `assets.cached_value` is a cache, refreshed by
 * whatever process writes the underlying source data.
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
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { assetStatusEnum, assetTypeEnum, depositStatusEnum, payoutScheduleEnum } from './enums';
import { users } from './users';
import { wallets } from './wallets';
import { ledgerEntries } from './transactions';

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    assetType: assetTypeEnum('asset_type').notNull(),
    status: assetStatusEnum('status').notNull().default('active'),
    cachedValue: bigint('cached_value', { mode: 'bigint' }).notNull().default(sql`0`), // CACHE, derived per type
    cachedAt: timestamp('cached_at', { withTimezone: true }),
    excludeFromHousehold: boolean('exclude_from_household').notNull().default(false),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('assets_user_type_idx').on(table.userId, table.assetType, table.status)],
);

// --- 9.1 Gold ---------------------------------------------------------

export const goldLots = pgTable(
  'gold_lots',
  {
    id: uuid('id').primaryKey(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weightGrams: numeric('weight_grams', { precision: 18, scale: 4 }).notNull(),
    remainingGrams: numeric('remaining_grams', { precision: 18, scale: 4 }).notNull(),
    purchasePricePerGram: bigint('purchase_price_per_gram', { mode: 'bigint' }).notNull(),
    purchaseDate: date('purchase_date').notNull(),
    goldForm: text('gold_form'),
    ledgerEntryId: uuid('ledger_entry_id').references(() => ledgerEntries.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('gold_lots_asset_idx')
      .on(table.assetId)
      .where(sql`${table.remainingGrams} > 0`),
    check('gold_weight_positive', sql`${table.weightGrams} > 0`),
    check(
      'gold_remaining_valid',
      sql`${table.remainingGrams} >= 0 AND ${table.remainingGrams} <= ${table.weightGrams}`,
    ),
  ],
);

export const goldPrices = pgTable(
  'gold_prices',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    priceDate: date('price_date').notNull(),
    sellPricePerGram: bigint('sell_price_per_gram', { mode: 'bigint' }).notNull(), // price when WE BUY
    buybackPricePerGram: bigint('buyback_price_per_gram', { mode: 'bigint' }).notNull(), // price when WE SELL → valuation
    source: text('source').notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('gold_prices_user_date_uniq').on(table.userId, table.priceDate),
    check(
      'gold_price_positive',
      sql`${table.sellPricePerGram} > 0 AND ${table.buybackPricePerGram} > 0`,
    ),
    check('gold_buyback_lte_sell', sql`${table.buybackPricePerGram} <= ${table.sellPricePerGram}`),
  ],
);

export const goldSales = pgTable('gold_sales', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assets.id, { onDelete: 'restrict' }),
  weightGrams: numeric('weight_grams', { precision: 18, scale: 4 }).notNull(),
  pricePerGram: bigint('price_per_gram', { mode: 'bigint' }).notNull(),
  proceeds: bigint('proceeds', { mode: 'bigint' }).notNull(),
  costBasis: bigint('cost_basis', { mode: 'bigint' }).notNull(),
  realizedGain: bigint('realized_gain', { mode: 'bigint' }).notNull(),
  saleDate: date('sale_date').notNull(),
  ledgerEntryId: uuid('ledger_entry_id')
    .notNull()
    .references(() => ledgerEntries.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- 9.2 Deposits -------------------------------------------------------

export const deposits = pgTable(
  'deposits',
  {
    id: uuid('id').primaryKey(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bankName: text('bank_name').notNull(),
    principal: bigint('principal', { mode: 'bigint' }).notNull(),
    interestRateAnnual: numeric('interest_rate_annual', { precision: 7, scale: 4 }).notNull(),
    taxRate: numeric('tax_rate', { precision: 5, scale: 4 }).notNull().default('0.2000'), // final withholding tax 20%
    startDate: date('start_date').notNull(),
    maturityDate: date('maturity_date').notNull(),
    payoutSchedule: payoutScheduleEnum('payout_schedule').notNull().default('at_maturity'),
    aroEnabled: boolean('aro_enabled').notNull().default(false),
    aroIncludeInterest: boolean('aro_include_interest').notNull().default(false),
    status: depositStatusEnum('status').notNull().default('active'),
    walletId: uuid('wallet_id').references(() => wallets.id, { onDelete: 'restrict' }),
    rolledFromId: uuid('rolled_from_id').references((): AnyPgColumn => deposits.id, {
      onDelete: 'set null',
    }),
    // task 17 additions — NOT in docs/04-database-schema.md §9.2's original
    // sketch, added here because the acceptance criteria explicitly require
    // both create AND withdraw to carry an idempotency key (spec.md's task
    // instructions: "like every other mutating action in the app"), and
    // neither has anywhere else to live:
    //   - `idempotencyKey`: createDeposit's create-once guard, identical
    //     shape to `savings_contributions.idempotency_key`
    //     (src/lib/db/schema/savings.ts) — unique (user_id, idempotency_key)
    //     below.
    //   - `withdrawalIdempotencyKey`: a SEPARATE column, not a reuse of the
    //     one above — `withdrawDeposit` UPDATEs the same row `createDeposit`
    //     INSERTed, so overwriting `idempotencyKey` at withdrawal time would
    //     destroy the creation's own dedup key permanently (a retried CREATE
    //     arriving late would then find no match and create a duplicate).
    //     Its own unique (user_id, withdrawal_idempotency_key) index below.
    //     Belt-and-suspenders alongside (not instead of) the natural
    //     `WHERE status IN ('active','matured')` guard: a deposit can only
    //     ever be withdrawn once regardless, but this lets a retried
    //     withdrawal request return the EXACT prior success response
    //     (via the unique-violation → re-select path, same shape as
    //     `savings.ts`'s `contribute`/`withdraw`) instead of a "sudah
    //     dicairkan" error — see src/lib/services/deposits.ts.
    //   - `lastInterestPaymentDate`: cursor for `monthly` payout — where the
    //     NEXT payment's accrual period starts, and the efficient
    //     `WHERE last_interest_payment_date IS NULL OR < :periodStart` guard
    //     `payMonthlyInterest` uses instead of scanning `ledger_entries` for
    //     every monthly deposit on every cron run.
    idempotencyKey: text('idempotency_key'),
    withdrawalIdempotencyKey: text('withdrawal_idempotency_key'),
    lastInterestPaymentDate: date('last_interest_payment_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('deposits_user_status_idx').on(table.userId, table.status),
    index('deposits_maturity_idx')
      .on(table.maturityDate)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex('deposits_idempotency_uniq')
      .on(table.userId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    uniqueIndex('deposits_withdrawal_idempotency_uniq')
      .on(table.userId, table.withdrawalIdempotencyKey)
      .where(sql`${table.withdrawalIdempotencyKey} IS NOT NULL`),
    check('deposit_principal_positive', sql`${table.principal} > 0`),
    check('deposit_dates_valid', sql`${table.maturityDate} > ${table.startDate}`),
    check('deposit_rate_sane', sql`${table.interestRateAnnual} BETWEEN 0 AND 100`),
    check('deposit_tax_sane', sql`${table.taxRate} BETWEEN 0 AND 1`),
  ],
);

