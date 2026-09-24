/**
 * Fixtures for integration tests that run against the real Neon database
 * (see `.env` — DATABASE_URL / DATABASE_URL_UNPOOLED, loaded via
 * vitest.config.ts). Every test using these MUST clean up in a `finally`,
 * since src/lib/db/reconcile.ts scans whole tables — leftover rows from a
 * crashed test would either show up as noise in another test's assertions
 * or (if malformed) as a false invariant violation.
 */
import { uuidv7 } from 'uuidv7';
import { eq, inArray } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { users } from '@/lib/db/schema/users';
import { wallets } from '@/lib/db/schema/wallets';
import { categories } from '@/lib/db/schema/categories';
import { ledgerEntries, transactions } from '@/lib/db/schema/transactions';
import { households, householdMembers } from '@/lib/db/schema/households';
import { savingsContributions, savingsGoals } from '@/lib/db/schema/savings';
import { debtPayments, debts, receivablePayments, receivables } from '@/lib/db/schema/obligations';
import { assets, deposits, goldLots, goldPrices, goldSales } from '@/lib/db/schema/assets';
import { recurringSavingsContributions, recurringTransactions } from '@/lib/db/schema/recurring';

export async function createTestUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const id = uuidv7();
  await dbWrite.insert(users).values({
    id,
    email: `test-${id}@example.invalid`,
    ...overrides,
  });
  return id;
}

export async function createTestWallet(
  userId: string,
  overrides: Partial<typeof wallets.$inferInsert> = {},
) {
  const id = uuidv7();
  await dbWrite.insert(wallets).values({
    id,
    userId,
    name: 'Test Wallet',
    type: 'cash',
    ...overrides,
  });
  return id;
}

export async function createTestCategory(
  userId: string,
  overrides: Partial<typeof categories.$inferInsert> = {},
) {
  const id = uuidv7();
  await dbWrite.insert(categories).values({
    id,
    userId,
    name: 'Test Category',
    type: 'expense',
    ...overrides,
  });
  return id;
}

/** Inserts a `recurring_transactions` row directly — task 24. Prefer the
 * real `createRecurringTransaction` service when the test exercises
 * creation itself; this is for tests that need a rule to already exist at a
 * SPECIFIC `next_run_date`/`status` (e.g. the cron materialization tests),
 * without going through the service's own "materialize today's occurrence
 * synchronously" side effect. */
export async function createTestRecurringTransaction(
  userId: string,
  overrides: Partial<typeof recurringTransactions.$inferInsert> = {},
) {
  const id = uuidv7();
  const walletId = overrides.walletId ?? (await createTestWallet(userId));
  const categoryId = overrides.categoryId ?? (await createTestCategory(userId, { type: 'expense' }));
  await dbWrite.insert(recurringTransactions).values({
    id,
    userId,
    type: 'expense',
    amount: 100_000_00n,
    categoryId,
    walletId,
    frequency: 'monthly',
    startDate: '2026-01-01',
    nextRunDate: '2026-01-01',
    ...overrides,
  });
  return id;
}

/** Same as `createTestRecurringTransaction`, for `recurring_savings_contributions` — task 24. */
export async function createTestRecurringContribution(
  userId: string,
  goalId: string,
  overrides: Partial<typeof recurringSavingsContributions.$inferInsert> = {},
) {
  const id = uuidv7();
  const walletId = overrides.walletId ?? (await createTestWallet(userId));
  await dbWrite.insert(recurringSavingsContributions).values({
    id,
    userId,
    goalId,
    walletId,
    amount: 100_000_00n,
    frequency: 'monthly',
    startDate: '2026-01-01',
    nextRunDate: '2026-01-01',
    ...overrides,
  });
  return id;
}

/** Inserts an `assets` row directly — task 16 (gold). Tests that exercise
 * `buyGold`/`sellGold` themselves don't need this (those services
 * find-or-create the asset), but tests seeding `gold_lots`/`gold_prices`
 * directly (bypassing the service, e.g. to test a raw CHECK constraint)
 * need a parent asset row to satisfy `gold_lots.asset_id`'s FK first. */
export async function createTestGoldAsset(userId: string, overrides: Partial<typeof assets.$inferInsert> = {}) {
  const id = uuidv7();
  await dbWrite.insert(assets).values({
    id,
    userId,
    name: 'Test Asset',
    assetType: 'gold',
    ...overrides,
  });
  return id;
}

/**
 * Removes a gold asset and everything that structurally must go first —
 * `gold_lots.asset_id` / `gold_sales.asset_id` are both `ON DELETE
 * RESTRICT` (src/lib/db/schema/assets.ts), so the asset can't go before
 * every lot/sale referencing it does. Needed separately from
 * `deleteTestUser` for a test that creates the asset under one user while
 * cleanup needs to happen mid-test (rare, but mirrors
 * `deleteTestSavingsGoal`'s reason for existing).
 */
export async function deleteTestGoldAsset(assetId: string) {
  await dbWrite.delete(goldSales).where(eq(goldSales.assetId, assetId));
  await dbWrite.delete(goldLots).where(eq(goldLots.assetId, assetId));
  await dbWrite.delete(assets).where(eq(assets.id, assetId));
}

/** Inserts a household row directly (bypassing the service/guard) — used by
 * tests that need a household to already exist, e.g. to seed a `member` row
 * for role-restriction assertions. Prefer `createHousehold` (the service)
 * when the test is actually exercising creation. */
export async function createTestHousehold(
  creatorId: string,
  overrides: Partial<typeof households.$inferInsert> = {},
) {
  const id = uuidv7();
  await dbWrite.insert(households).values({
    id,
    name: 'Test Household',
    createdBy: creatorId,
    ...overrides,
  });
  return id;
}

/** Inserts a household_members row directly — lets tests seed a `member`
 * (non-owner) or a `removed` row without going through the service, which
 * only ever creates the sole `owner` at household-creation time. */
export async function createTestHouseholdMember(
  householdId: string,
  userId: string,
  overrides: Partial<typeof householdMembers.$inferInsert> = {},
) {
  const id = uuidv7();
  await dbWrite.insert(householdMembers).values({
    id,
    householdId,
    userId,
    role: 'member',
    status: 'active',
    ...overrides,
  });
  return id;
}

/** Inserts an `assets` row directly — task 17. Used to back a
 * directly-inserted `deposits` row (`deposits.asset_id` is `NOT NULL`); most
 * deposit tests should prefer going through `createDeposit`
 * (src/lib/services/deposits.ts), which creates both rows itself — this is
 * for the few tests that need to seed a deposit's exact status/dates
 * directly (e.g. an already-`matured` row for the cron tests) without
 * going through the service's own validation. */
export async function createTestAsset(userId: string, overrides: Partial<typeof assets.$inferInsert> = {}) {
  const id = uuidv7();
  await dbWrite.insert(assets).values({
    id,
    userId,
    name: 'Test Asset',
    assetType: 'deposit',
    ...overrides,
  });
  return id;
}

/** Inserts a `deposits` row directly, plus its backing `assets` row unless
 * `assetId` is passed in `overrides` — task 17. See `createTestAsset`'s doc
 * comment for when to prefer this over the real `createDeposit` service. */
export async function createTestDeposit(userId: string, overrides: Partial<typeof deposits.$inferInsert> = {}) {
  const assetId = overrides.assetId ?? (await createTestAsset(userId));
  const id = uuidv7();
  await dbWrite.insert(deposits).values({
    id,
    assetId,
    userId,
    bankName: 'Test Bank',
    principal: 10_000_000_00n,
    interestRateAnnual: '4.2500',
    taxRate: '0.2000',
    startDate: '2026-01-01',
    maturityDate: '2027-01-01',
    ...overrides,
  });
  return id;
}

/** Removes a deposit and its backing asset — `deposits.asset_id` is
 * `ON DELETE RESTRICT`, so the deposit must go first. Any `rolled_from_id`
 * pointing AT this deposit from a successor is `ON DELETE SET NULL`, so no
 * separate handling is needed for ARO chains either direction. */
export async function deleteTestDeposit(depositId: string) {
  const [deposit] = await dbWrite.select({ assetId: deposits.assetId }).from(deposits).where(eq(deposits.id, depositId));
  await dbWrite.delete(deposits).where(eq(deposits.id, depositId));
  if (deposit) {
    await dbWrite.delete(assets).where(eq(assets.id, deposit.assetId));
  }
}

/**
 * Removes a test household and its memberships. `households.created_by` is
 * `ON DELETE RESTRICT` (src/lib/db/schema/households.ts), so a household
 * MUST be deleted before its creator — `deleteTestUser` below calls this
 * for every household the user created, but a test that creates a
 * household under a DIFFERENT user (cross-household isolation tests) needs
 * to call this itself.
 */
export async function deleteTestHousehold(householdId: string) {
  await dbWrite.delete(householdMembers).where(eq(householdMembers.householdId, householdId));
  await dbWrite.delete(households).where(eq(households.id, householdId));
}

/** `YYYY-MM-DD` for "today" — used as the default `start_date` below (a
 * `date` NOT NULL column with no schema default, src/lib/db/schema/obligations.ts). */
function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Inserts a `debts` row directly (bypassing the service) — task 18. Prefer
 * the real `createDebt` service function when the test is exercising
 * creation itself; this is for tests that need a debt to already exist
 * (e.g. seeding a specific `status`/`dueDate` for query-layer assertions). */
export async function createTestDebt(userId: string, overrides: Partial<typeof debts.$inferInsert> = {}) {
  const id = uuidv7();
  const initialAmount = overrides.initialAmount ?? 1_000_000_00n;
  await dbWrite.insert(debts).values({
    id,
    userId,
    creditorName: 'Test Creditor',
    initialAmount,
    remainingAmount: initialAmount,
    startDate: todayDateStr(),
    affectsWallet: false, // no wallet required unless a test opts in via overrides
    ...overrides,
  });
  return id;
}

/** Same as `createTestDebt`, for `receivables`. */
export async function createTestReceivable(
  userId: string,
  overrides: Partial<typeof receivables.$inferInsert> = {},
) {
  const id = uuidv7();
  const initialAmount = overrides.initialAmount ?? 1_000_000_00n;
  await dbWrite.insert(receivables).values({
    id,
    userId,
    debtorName: 'Test Debtor',
    initialAmount,
    remainingAmount: initialAmount,
    startDate: todayDateStr(),
    affectsWallet: false,
    ...overrides,
  });
  return id;
}

/**
 * Removes a debt and every payment row against it — task 18.
 * `debt_payments.debt_id` is `ON DELETE RESTRICT`
 * (src/lib/db/schema/obligations.ts), so payments must go first. Needed
 * separately from `deleteTestUser` for the rare case a test wants to tear
 * one down mid-test; `deleteTestUser` itself calls this for every debt it
 * finds owned by the user being removed.
 */
export async function deleteTestDebt(debtId: string) {
  await dbWrite.delete(debtPayments).where(eq(debtPayments.debtId, debtId));
  await dbWrite.delete(debts).where(eq(debts.id, debtId));
}

/** Same as `deleteTestDebt`, for `receivables`. */
export async function deleteTestReceivable(receivableId: string) {
  await dbWrite.delete(receivablePayments).where(eq(receivablePayments.receivableId, receivableId));
  await dbWrite.delete(receivables).where(eq(receivables.id, receivableId));
}

/**
 * Removes a savings goal and every contribution/withdrawal row against it —
 * task 15. `savings_contributions.savings_goal_id` is `ON DELETE RESTRICT`
 * (src/lib/db/schema/savings.ts), so the goal can't go first. Needed
 * separately from `deleteTestUser` for a SHARED goal a test creates under
 * one user while a DIFFERENT user contributes to it (the contributor's
 * `deleteTestUser` only clears contributions THEY made — see below — not
 * the goal itself, which the creator owns).
 */
export async function deleteTestSavingsGoal(goalId: string) {
  // tasks/24-recurring-transactions: `recurring_savings_contributions.goal_id`
  // is ON DELETE RESTRICT, same reasoning as `savings_contributions` above —
  // must go first, REGARDLESS of which user owns the recurring rule row (a
  // shared goal can have an auto-contribution rule owned by a member other
  // than the goal's creator).
  await dbWrite
    .delete(recurringSavingsContributions)
    .where(eq(recurringSavingsContributions.goalId, goalId));
  await dbWrite.delete(savingsContributions).where(eq(savingsContributions.savingsGoalId, goalId));
  await dbWrite.delete(savingsGoals).where(eq(savingsGoals.id, goalId));
}

/**
 * Removes a test user and everything that structurally must be cleaned up
 * before it can go (ledger_entries.wallet_id is ON DELETE RESTRICT, so those
 * have to go first; wallets cascade from users but would hit that RESTRICT
 * if left in place; households.created_by is likewise ON DELETE RESTRICT).
 * `household_members` rows for OTHER users in a household this user created
 * cascade from `households` being deleted here, so no separate cleanup is
 * needed for those.
 *
 * Savings (task 15) needs the same "must go before ledger_entries" treatment
 * as households needed before users, in BOTH directions: a contribution's
 * `ledger_entry_id` is `ON DELETE RESTRICT` (so any contribution THIS user
 * made — even to a goal owned by someone else, e.g. a shared goal — must be
 * deleted before this user's ledger_entries), and a goal's contributions are
 * likewise `ON DELETE RESTRICT` on `savings_goal_id` (so a goal THIS user
 * OWNS must have every contributor's rows cleared — not just this user's own
 * — before the goal itself can go via cascade from `users`). Cross-user
 * shared-goal tests must still push every contributing user's id, same as
 * households, so every side's cleanup actually runs.
 *
 * tasks/13-transfers-member: `transactions.created_by` is ALSO ON DELETE
 * RESTRICT (src/lib/db/schema/transactions.ts's `tx_created_by_rule`), and a
 * member-transfer's receiving side is a row this user may have WRITTEN
 * (`created_by`) without OWNING (`user_id` — the counterparty's). That row
 * is invisible to the `ledger_entries`/cascade cleanup below, which only
 * follows `user_id`. Deleting every transaction this user is `created_by`
 * on — BEFORE the rest — clears it regardless: `created_by` is the SENDER
 * on both sides of a member-transfer pair, so this one query always catches
 * BOTH rows (the sender's own, and the receiver's), making cleanup
 * order-independent no matter which of the two users in a pair
 * `deleteTestUser` is called on first. For every OTHER transaction (every
 * non-member-transfer row), `created_by = user_id` always holds (the CHECK
 * constraint guarantees it), so this is simply that user's own rows —
 * exactly what the cascade below would have deleted anyway.
 */
export async function deleteTestUser(userId: string) {
  const createdHouseholds = await dbWrite
    .select({ id: households.id })
    .from(households)
    .where(eq(households.createdBy, userId));
  for (const household of createdHouseholds) {
    await deleteTestHousehold(household.id);
  }

  const ownedGoals = await dbWrite
    .select({ id: savingsGoals.id })
    .from(savingsGoals)
    .where(eq(savingsGoals.userId, userId));
  for (const goal of ownedGoals) {
    await deleteTestSavingsGoal(goal.id);
  }
  // This user's OWN contributions to a goal owned by someone else (shared
  // goal) — not covered by the loop above, which only clears goals this
  // user CREATED.
  await dbWrite.delete(savingsContributions).where(eq(savingsContributions.userId, userId));

  // task 18: debts/receivables are always personal (no shared/cross-user
  // payment concept in v1 — `debt_payments.user_id` is always the SAME as
  // the owning debt's `user_id`), so unlike savings there is no separate
  // "this user's own payments on someone else's row" case to handle.
  // Payments must go before both the debt/receivable itself
  // (`debt_payments.debt_id` RESTRICT) and before `ledgerEntries` below
  // (`debt_payments.ledger_entry_id` RESTRICT); the debt/receivable row
  // itself must go before `wallets` (`debts.wallet_id` RESTRICT).
  const ownedDebts = await dbWrite.select({ id: debts.id }).from(debts).where(eq(debts.userId, userId));
  for (const debt of ownedDebts) {
    await deleteTestDebt(debt.id);
  }
  const ownedReceivables = await dbWrite
    .select({ id: receivables.id })
    .from(receivables)
    .where(eq(receivables.userId, userId));
  for (const receivable of ownedReceivables) {
    await deleteTestReceivable(receivable.id);
  }

  const writtenByThisUser = await dbWrite
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.createdBy, userId));
  if (writtenByThisUser.length > 0) {
    const ids = writtenByThisUser.map((row) => row.id);
    // Retry a few times, not once: an e2e test's LAST UI action (e.g. the
    // "Urungkan" undo click on a void — src/lib/services/transactions.ts's
    // `unvoidTransaction`) can still be committing its `postEntries` INSERT
    // when the test function returns and this fixture teardown starts
    // immediately after — confirmed by direct query (a single leftover
    // `ledger_entries` row, landed AFTER this exact delete already ran,
    // for a transaction whose only OTHER trace was this one row). The
    // RESTRICT FK is correctly catching a real leftover write each time;
    // a single delete attempt loses that race often enough to matter, a
    // few retries with a short pause absorb it without masking a
    // genuinely stuck delete (still throws on the last attempt).
    for (let attempt = 1; ; attempt++) {
      await dbWrite.delete(ledgerEntries).where(inArray(ledgerEntries.transactionId, ids));
      try {
        await dbWrite.delete(transactions).where(inArray(transactions.id, ids));
        break;
      } catch (err) {
        if (attempt >= 5) throw err;
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
    }
  }

  // task 17: `deposits.wallet_id` and `deposits.asset_id` are both
  // ON DELETE RESTRICT, so deposits (and their backing assets) must go
  // before `wallets` below. `rolled_from_id` self-references are
  // ON DELETE SET NULL, so an ARO chain can be cleared in any order.
  const ownedDeposits = await dbWrite.select({ id: deposits.id }).from(deposits).where(eq(deposits.userId, userId));
  for (const deposit of ownedDeposits) {
    await deleteTestDeposit(deposit.id);
  }

  // Task 16 (gold): gold_sales/gold_lots.ledger_entry_id are ON DELETE
  // RESTRICT, so both must go BEFORE the ledger_entries delete below — same
  // ordering constraint savings_contributions has, for the same reason.
  // gold_sales/gold_lots.asset_id are ALSO ON DELETE RESTRICT, so they must
  // go before `assets` too; `assets.user_id` itself cascades from `users`,
  // so no explicit `assets` delete is needed once its two dependents are
  // clear. Gold purchases/sales are always self-funded (no cross-user gold
  // buying), so — unlike transactions — a single `user_id`-scoped delete on
  // each table is always complete; there's no "written by someone else"
  // case to account for.
  await dbWrite.delete(goldSales).where(eq(goldSales.userId, userId));
  await dbWrite.delete(goldLots).where(eq(goldLots.userId, userId));
  await dbWrite.delete(goldPrices).where(eq(goldPrices.userId, userId));

  // tasks/24-recurring-transactions: `recurring_transactions.wallet_id`/
  // `.category_id` and `recurring_savings_contributions.wallet_id` are all
  // ON DELETE RESTRICT (src/lib/db/schema/recurring.ts), so this user's own
  // recurring rules must go before `wallets` below. `user_id` on both is
  // ON DELETE CASCADE, so this is only needed because of the ordering
  // relative to `wallets`/`categories`, not because cascade wouldn't
  // eventually clear it on its own.
  await dbWrite.delete(recurringTransactions).where(eq(recurringTransactions.userId, userId));
  await dbWrite
    .delete(recurringSavingsContributions)
    .where(eq(recurringSavingsContributions.userId, userId));

  await dbWrite.delete(householdMembers).where(eq(householdMembers.userId, userId));
  await dbWrite.delete(ledgerEntries).where(eq(ledgerEntries.userId, userId));
  await dbWrite.delete(wallets).where(eq(wallets.userId, userId));
  await dbWrite.delete(users).where(eq(users.id, userId));
}
