/**
 * Postgres ENUM types — see docs/04-database-schema.md §2.
 *
 * Enums intentionally NOT present here: `transfer_kind`, `transfer_status`,
 * `wallet_permission`, `contribution_mode`. Each was removed along with the
 * feature that needed it — see docs/16-decision-log.md ADR-023 and ADR-024.
 */
import { pgEnum } from 'drizzle-orm/pg-core';

export const walletTypeEnum = pgEnum('wallet_type', ['cash', 'bank', 'ewallet', 'credit_card']);

export const transactionTypeEnum = pgEnum('transaction_type', ['income', 'expense', 'transfer']);

export const categoryTypeEnum = pgEnum('category_type', ['income', 'expense']);

export const entrySourceEnum = pgEnum('entry_source', [
  'transaction',
  'opening_balance',
  'adjustment',
  'savings_contribution',
  'savings_withdrawal',
  'debt_disbursement',
  'debt_payment',
  'receivable_disbursement',
  'receivable_payment',
  'gold_purchase',
  'gold_sale',
  'deposit_placement',
  'deposit_withdrawal',
  'deposit_interest',
]);

export const savingsStatusEnum = pgEnum('savings_status', ['active', 'completed', 'archived']);

export const assetTypeEnum = pgEnum('asset_type', [
  'gold',
  'deposit',
  'property',
  'vehicle',
  'other',
]);

export const assetStatusEnum = pgEnum('asset_status', ['active', 'disposed']);

export const depositStatusEnum = pgEnum('deposit_status', ['active', 'matured', 'withdrawn']);

export const payoutScheduleEnum = pgEnum('payout_schedule', ['at_maturity', 'monthly']);

export const obligationStatusEnum = pgEnum('obligation_status', [
  'active',
  'partially_paid',
  'paid',
  'written_off',
]);

export const budgetPeriodEnum = pgEnum('budget_period', ['monthly', 'custom']);

// tasks/24-recurring-transactions — shared by `recurring_transactions` and
// `recurring_savings_contributions` (spec.md: "REUSE enum yang sama").
export const recurringFrequencyEnum = pgEnum('recurring_frequency', ['daily', 'weekly', 'monthly']);

export const recurringStatusEnum = pgEnum('recurring_status', ['active', 'paused', 'ended']);

// Household
export const householdRoleEnum = pgEnum('household_role', ['owner', 'member']);

export const membershipStatusEnum = pgEnum('membership_status', ['active', 'pending', 'removed']);

export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'expired',
  'revoked',
]);
