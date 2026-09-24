/**
 * Schema barrel + Drizzle `relations()`.
 *
 * Every table from docs/04-database-schema.md is defined here, including the
 * household tables (they land in later tasks, but the schema is built once —
 * see tasks/03-database-foundation/spec.md "Skema"). Deliberately absent:
 * `transfer_groups` and `wallet_access` — see docs/16-decision-log.md
 * ADR-023 and ADR-024.
 */
import { relations } from 'drizzle-orm';

export * from './enums';
export * from './users';
export * from './households';
export * from './wallets';
export * from './categories';
export * from './transactions';
export * from './savings';
export * from './assets';
export * from './obligations';
export * from './budgets';
export * from './snapshots';
export * from './recurring';

import { users } from './users';
import { households, householdInvitations, householdMembers } from './households';
import { wallets } from './wallets';
import { categories } from './categories';
import { ledgerEntries, transactions } from './transactions';
import { savingsContributions, savingsGoals } from './savings';
import { assets, deposits, goldLots, goldPrices, goldSales } from './assets';
import { debtPayments, debts, receivablePayments, receivables } from './obligations';
import { budgets } from './budgets';
import { householdNetWorthSnapshots, netWorthSnapshots } from './snapshots';
import { recurringSavingsContributions, recurringTransactions } from './recurring';

export const usersRelations = relations(users, ({ one, many }) => ({
  defaultWallet: one(wallets, {
    fields: [users.defaultWalletId],
    references: [wallets.id],
  }),
  wallets: many(wallets),
  categories: many(categories),
  transactions: many(transactions),
  ledgerEntries: many(ledgerEntries),
  householdMemberships: many(householdMembers),
  createdHouseholds: many(households),
  netWorthSnapshots: many(netWorthSnapshots),
}));

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(users, { fields: [wallets.userId], references: [users.id] }),
  ledgerEntries: many(ledgerEntries),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'categoryParent',
  }),
  children: many(categories, { relationName: 'categoryParent' }),
  transactions: many(transactions),
}));

export const householdsRelations = relations(households, ({ one, many }) => ({
  creator: one(users, { fields: [households.createdBy], references: [users.id] }),
  members: many(householdMembers),
  invitations: many(householdInvitations),
  transactions: many(transactions),
  savingsGoals: many(savingsGoals),
  budgets: many(budgets),
  netWorthSnapshots: many(householdNetWorthSnapshots),
}));

export const householdMembersRelations = relations(householdMembers, ({ one }) => ({
  household: one(households, {
    fields: [householdMembers.householdId],
    references: [households.id],
  }),
  user: one(users, { fields: [householdMembers.userId], references: [users.id] }),
}));

export const householdInvitationsRelations = relations(householdInvitations, ({ one }) => ({
  household: one(households, {
    fields: [householdInvitations.householdId],
    references: [households.id],
  }),
  invitedByUser: one(users, {
    fields: [householdInvitations.invitedBy],
    references: [users.id],
  }),
  acceptedByUser: one(users, {
    fields: [householdInvitations.acceptedBy],
    references: [users.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  household: one(households, {
    fields: [transactions.householdId],
    references: [households.id],
  }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
  counterpartyUser: one(users, {
    fields: [transactions.counterpartyUserId],
    references: [users.id],
  }),
  createdByUser: one(users, { fields: [transactions.createdBy], references: [users.id] }),
  linkedTransaction: one(transactions, {
    fields: [transactions.linkedTransactionId],
    references: [transactions.id],
    relationName: 'transactionLink',
  }),
  ledgerEntries: many(ledgerEntries),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  user: one(users, { fields: [ledgerEntries.userId], references: [users.id] }),
  wallet: one(wallets, { fields: [ledgerEntries.walletId], references: [wallets.id] }),
  transaction: one(transactions, {
    fields: [ledgerEntries.transactionId],
    references: [transactions.id],
  }),
}));

export const savingsGoalsRelations = relations(savingsGoals, ({ one, many }) => ({
  user: one(users, { fields: [savingsGoals.userId], references: [users.id] }),
  household: one(households, {
    fields: [savingsGoals.householdId],
    references: [households.id],
  }),
  contributions: many(savingsContributions),
}));

export const savingsContributionsRelations = relations(savingsContributions, ({ one }) => ({
  goal: one(savingsGoals, {
    fields: [savingsContributions.savingsGoalId],
    references: [savingsGoals.id],
  }),
  user: one(users, { fields: [savingsContributions.userId], references: [users.id] }),
  wallet: one(wallets, { fields: [savingsContributions.walletId], references: [wallets.id] }),
  ledgerEntry: one(ledgerEntries, {
    fields: [savingsContributions.ledgerEntryId],
    references: [ledgerEntries.id],
  }),
}));

export const assetsRelations = relations(assets, ({ one, many }) => ({
  user: one(users, { fields: [assets.userId], references: [users.id] }),
  goldLots: many(goldLots),
  deposits: many(deposits),
}));

export const goldLotsRelations = relations(goldLots, ({ one }) => ({
  asset: one(assets, { fields: [goldLots.assetId], references: [assets.id] }),
  user: one(users, { fields: [goldLots.userId], references: [users.id] }),
  ledgerEntry: one(ledgerEntries, {
    fields: [goldLots.ledgerEntryId],
    references: [ledgerEntries.id],
  }),
}));

export const goldPricesRelations = relations(goldPrices, ({ one }) => ({
  user: one(users, { fields: [goldPrices.userId], references: [users.id] }),
}));

export const goldSalesRelations = relations(goldSales, ({ one }) => ({
  user: one(users, { fields: [goldSales.userId], references: [users.id] }),
  asset: one(assets, { fields: [goldSales.assetId], references: [assets.id] }),
  ledgerEntry: one(ledgerEntries, {
    fields: [goldSales.ledgerEntryId],
    references: [ledgerEntries.id],
  }),
}));

export const depositsRelations = relations(deposits, ({ one }) => ({
  asset: one(assets, { fields: [deposits.assetId], references: [assets.id] }),
  user: one(users, { fields: [deposits.userId], references: [users.id] }),
  wallet: one(wallets, { fields: [deposits.walletId], references: [wallets.id] }),
  rolledFrom: one(deposits, {
    fields: [deposits.rolledFromId],
    references: [deposits.id],
    relationName: 'depositRollover',
  }),
}));

export const debtsRelations = relations(debts, ({ one, many }) => ({
  user: one(users, { fields: [debts.userId], references: [users.id] }),
  counterpartyUser: one(users, { fields: [debts.counterpartyUserId], references: [users.id] }),
  wallet: one(wallets, { fields: [debts.walletId], references: [wallets.id] }),
  payments: many(debtPayments),
}));

export const debtPaymentsRelations = relations(debtPayments, ({ one }) => ({
  debt: one(debts, { fields: [debtPayments.debtId], references: [debts.id] }),
  user: one(users, { fields: [debtPayments.userId], references: [users.id] }),
  wallet: one(wallets, { fields: [debtPayments.walletId], references: [wallets.id] }),
  ledgerEntry: one(ledgerEntries, {
    fields: [debtPayments.ledgerEntryId],
    references: [ledgerEntries.id],
  }),
}));

export const receivablesRelations = relations(receivables, ({ one, many }) => ({
  user: one(users, { fields: [receivables.userId], references: [users.id] }),
  counterpartyUser: one(users, {
    fields: [receivables.counterpartyUserId],
    references: [users.id],
  }),
  wallet: one(wallets, { fields: [receivables.walletId], references: [wallets.id] }),
  payments: many(receivablePayments),
}));

export const receivablePaymentsRelations = relations(receivablePayments, ({ one }) => ({
  receivable: one(receivables, {
    fields: [receivablePayments.receivableId],
    references: [receivables.id],
  }),
  user: one(users, { fields: [receivablePayments.userId], references: [users.id] }),
  wallet: one(wallets, { fields: [receivablePayments.walletId], references: [wallets.id] }),
  ledgerEntry: one(ledgerEntries, {
    fields: [receivablePayments.ledgerEntryId],
    references: [ledgerEntries.id],
  }),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  user: one(users, { fields: [budgets.userId], references: [users.id] }),
  household: one(households, { fields: [budgets.householdId], references: [households.id] }),
  category: one(categories, { fields: [budgets.categoryId], references: [categories.id] }),
  createdByUser: one(users, { fields: [budgets.createdBy], references: [users.id] }),
}));

export const netWorthSnapshotsRelations = relations(netWorthSnapshots, ({ one }) => ({
  user: one(users, { fields: [netWorthSnapshots.userId], references: [users.id] }),
}));

export const householdNetWorthSnapshotsRelations = relations(
  householdNetWorthSnapshots,
  ({ one }) => ({
    household: one(households, {
      fields: [householdNetWorthSnapshots.householdId],
      references: [households.id],
    }),
  }),
);

export const recurringTransactionsRelations = relations(recurringTransactions, ({ one }) => ({
  user: one(users, { fields: [recurringTransactions.userId], references: [users.id] }),
  household: one(households, {
    fields: [recurringTransactions.householdId],
    references: [households.id],
  }),
  category: one(categories, { fields: [recurringTransactions.categoryId], references: [categories.id] }),
  wallet: one(wallets, { fields: [recurringTransactions.walletId], references: [wallets.id] }),
}));

export const recurringSavingsContributionsRelations = relations(
  recurringSavingsContributions,
  ({ one }) => ({
    user: one(users, { fields: [recurringSavingsContributions.userId], references: [users.id] }),
    goal: one(savingsGoals, {
      fields: [recurringSavingsContributions.goalId],
      references: [savingsGoals.id],
    }),
    wallet: one(wallets, { fields: [recurringSavingsContributions.walletId], references: [wallets.id] }),
  }),
);
