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
import { assets, goldLots, goldPrices, goldSales } from '@/lib/db/schema/assets';

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

/** Inserts an `assets` row directly — task 16 (gold). Tests that exercise
 * `buyGold`/`sellGold` themselves don't need this (those services
 * find-or-create the asset), but tests seeding `gold_lots`/`gold_prices`
 * directly (bypassing the service, e.g. to test a raw CHECK constraint)
 * need a parent asset row to satisfy `gold_lots.asset_id`'s FK first. */
export async function createTestAsset(userId: string, overrides: Partial<typeof assets.$inferInsert> = {}) {
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
export async function deleteTestAsset(assetId: string) {
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

  const writtenByThisUser = await dbWrite
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.createdBy, userId));
  if (writtenByThisUser.length > 0) {
    const ids = writtenByThisUser.map((row) => row.id);
    await dbWrite.delete(ledgerEntries).where(inArray(ledgerEntries.transactionId, ids));
    await dbWrite.delete(transactions).where(inArray(transactions.id, ids));
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

  await dbWrite.delete(householdMembers).where(eq(householdMembers.userId, userId));
  await dbWrite.delete(ledgerEntries).where(eq(ledgerEntries.userId, userId));
  await dbWrite.delete(wallets).where(eq(wallets.userId, userId));
  await dbWrite.delete(users).where(eq(users.id, userId));
}
