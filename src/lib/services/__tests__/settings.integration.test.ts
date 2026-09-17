// @vitest-environment node
/**
 * Integration tests for the settings service — real Neon database. Started
 * as task 18's single `count_receivables_as_asset` test (ADR-010);
 * tasks/22-settings-sharing-pwa extends it to cover `updateProfile` and
 * (the bulk of this file) `deleteAccount` — the owner-block, the full
 * cascade of a user's OWN data, and the several FK-safe reassignments that
 * keep OTHER people's data untouched (docs/12-security-and-auth.md §11).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { users } from '@/lib/db/schema/users';
import { households, householdMembers } from '@/lib/db/schema/households';
import { wallets } from '@/lib/db/schema/wallets';
import { categories } from '@/lib/db/schema/categories';
import { debts } from '@/lib/db/schema/obligations';
import { savingsContributions, savingsGoals } from '@/lib/db/schema/savings';
import { assets } from '@/lib/db/schema/assets';
import { ledgerEntries, transactions } from '@/lib/db/schema/transactions';
import {
  createTestCategory,
  createTestDebt,
  createTestGoldAsset,
  createTestHousehold,
  createTestHouseholdMember,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { createHousehold } from '../households';
import { transferOwnership } from '../memberships';
import { createTransaction } from '../transactions';
import { createGoal, contribute } from '../savings';
import { OwnerBlockedDeletionError } from '@/lib/api/errors';
import { deleteAccount, updateProfile, updateUserPreferences } from '../settings';

describe('settings service', () => {
  const userIds: string[] = [];
  const householdIds: string[] = [];

  afterEach(async () => {
    for (const id of householdIds.splice(0)) {
      await deleteTestHousehold(id);
    }
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  async function countReceivablesAsAsset(userId: string): Promise<boolean> {
    const [row] = await dbWrite
      .select({ countReceivablesAsAsset: users.countReceivablesAsAsset })
      .from(users)
      .where(eq(users.id, userId));
    return row?.countReceivablesAsAsset ?? false;
  }

  const BASE_PREFS = { timezone: 'Asia/Jakarta', defaultWalletId: null };

  describe('updateUserPreferences', () => {
    it('defaults to false for a freshly created user (ADR-010: conservative by default)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      expect(await countReceivablesAsAsset(userId)).toBe(false);
    });

    it('flips count_receivables_as_asset to true, and back to false', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await updateUserPreferences(userId, { ...BASE_PREFS, countReceivablesAsAsset: true });
      expect(await countReceivablesAsAsset(userId)).toBe(true);

      await updateUserPreferences(userId, { ...BASE_PREFS, countReceivablesAsAsset: false });
      expect(await countReceivablesAsAsset(userId)).toBe(false);
    });

    it("only ever touches the caller's own row — there is no targetUserId to guess, so the function's signature itself prevents a cross-user write", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);

      await updateUserPreferences(alice, { ...BASE_PREFS, countReceivablesAsAsset: true });

      expect(await countReceivablesAsAsset(alice)).toBe(true);
      expect(await countReceivablesAsAsset(bob)).toBe(false); // untouched
    });

    it('persists a non-default IANA timezone', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await updateUserPreferences(userId, {
        countReceivablesAsAsset: false,
        timezone: 'Asia/Jayapura',
        defaultWalletId: null,
      });

      const [row] = await dbWrite.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
      expect(row?.timezone).toBe('Asia/Jayapura');
    });

    it('rejects an invalid timezone string', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await expect(
        updateUserPreferences(userId, { countReceivablesAsAsset: false, timezone: 'Not/AZone', defaultWalletId: null }),
      ).rejects.toThrow();
    });

    it("rejects a defaultWalletId that isn't the caller's own wallet", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const bobsWallet = await createTestWallet(bob);

      await expect(
        updateUserPreferences(alice, { ...BASE_PREFS, countReceivablesAsAsset: false, defaultWalletId: bobsWallet }),
      ).rejects.toThrow();
    });

    it('accepts and persists a defaultWalletId the caller owns', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);

      await updateUserPreferences(userId, { ...BASE_PREFS, countReceivablesAsAsset: false, defaultWalletId: walletId });

      const [row] = await dbWrite.select({ defaultWalletId: users.defaultWalletId }).from(users).where(eq(users.id, userId));
      expect(row?.defaultWalletId).toBe(walletId);
    });
  });

  describe('updateProfile', () => {
    it('renames the caller', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await updateProfile(userId, { name: 'Nama Baru' });

      const [row] = await dbWrite.select({ name: users.name }).from(users).where(eq(users.id, userId));
      expect(row?.name).toBe('Nama Baru');
    });

    it('rejects a blank name', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await expect(updateProfile(userId, { name: '   ' })).rejects.toThrow();
    });
  });

  describe('deleteAccount', () => {
    it('is blocked while the caller is owner of an active household, naming that household', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga Pemblokir', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      await expect(deleteAccount(ownerId)).rejects.toThrow(OwnerBlockedDeletionError);
      try {
        await deleteAccount(ownerId);
      } catch (err) {
        expect(err).toBeInstanceOf(OwnerBlockedDeletionError);
        expect((err as OwnerBlockedDeletionError).householdId).toBe(household.id);
        expect((err as OwnerBlockedDeletionError).householdName).toBe('Keluarga Pemblokir');
      }

      // Nothing was touched — the user and household both still exist.
      const [userRow] = await dbWrite.select({ id: users.id }).from(users).where(eq(users.id, ownerId));
      expect(userRow).toBeDefined();
    });

    it("is NOT blocked by an ARCHIVED household the caller owns", async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga Arsip', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await dbWrite.update(households).set({ isArchived: true }).where(eq(households.id, household.id));

      await deleteAccount(ownerId);
      userIds.splice(userIds.indexOf(ownerId), 1); // already gone, don't double-delete in afterEach

      const [userRow] = await dbWrite.select({ id: users.id }).from(users).where(eq(users.id, ownerId));
      expect(userRow).toBeUndefined();
    });

    it("deletes every table the caller owns outright: wallet, ledger entry, category, debt, savings goal, gold asset, household membership", async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });
      const tx = await createTransaction(userId, {
        type: 'expense',
        amount: 15_000_00n,
        categoryId,
        walletId,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      const debtId = await createTestDebt(userId);
      const goldAssetId = await createTestGoldAsset(userId);
      const goalId = (
        await createGoal(userId, { name: 'Dana Darurat', targetAmount: 1_000_000_00n, targetDate: null, householdId: null })
      ).id;

      // A household this user is a plain (non-owner) member of — the
      // membership row itself should cascade away too.
      const otherOwner = await createTestUser();
      userIds.push(otherOwner);
      const household = await createTestHousehold(otherOwner, { name: 'Keluarga Lain' });
      householdIds.push(household);
      await createTestHouseholdMember(household, userId, { role: 'member' });

      await deleteAccount(userId);
      userIds.splice(userIds.indexOf(userId), 1); // already gone

      const [userRow] = await dbWrite.select({ id: users.id }).from(users).where(eq(users.id, userId));
      expect(userRow).toBeUndefined();

      const [walletRow] = await dbWrite.select({ id: wallets.id }).from(wallets).where(eq(wallets.id, walletId));
      expect(walletRow).toBeUndefined();

      const [ledgerRow] = await dbWrite.select({ id: ledgerEntries.id }).from(ledgerEntries).where(eq(ledgerEntries.userId, userId));
      expect(ledgerRow).toBeUndefined();

      const [txRow] = await dbWrite.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, tx.id));
      expect(txRow).toBeUndefined();

      const [categoryRow] = await dbWrite.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId));
      expect(categoryRow).toBeUndefined();

      const [debtRow] = await dbWrite.select({ id: debts.id }).from(debts).where(eq(debts.id, debtId));
      expect(debtRow).toBeUndefined();

      const [goldRow] = await dbWrite.select({ id: assets.id }).from(assets).where(eq(assets.id, goldAssetId));
      expect(goldRow).toBeUndefined();

      const [goalRow] = await dbWrite.select({ id: savingsGoals.id }).from(savingsGoals).where(eq(savingsGoals.id, goalId));
      expect(goalRow).toBeUndefined();

      const [membershipRow] = await dbWrite
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(eq(householdMembers.userId, userId));
      expect(membershipRow).toBeUndefined();
    });

    it("does NOT delete another household member's own transaction, even one tagged to the shared household", async () => {
      // Exactly tasks/22's own prescribed proof: two users, one tags a
      // transaction to a shared household, delete the OTHER user, confirm
      // the transaction survives.
      const ownerId = await createTestUser(); // creates + owns the household
      const taggerId = await createTestUser(); // tags their OWN transaction
      const deletedId = await createTestUser(); // gets deleted — unrelated bystander
      userIds.push(ownerId, taggerId, deletedId);

      const household = await createHousehold(ownerId, { name: 'Keluarga Tandai', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, taggerId, { role: 'member' });
      await createTestHouseholdMember(household.id, deletedId, { role: 'member' });

      const taggerWallet = await createTestWallet(taggerId);
      const taggerCategory = await createTestCategory(taggerId, { type: 'expense' });
      const taggedTx = await createTransaction(taggerId, {
        type: 'expense',
        amount: 45_000_00n,
        categoryId: taggerCategory,
        walletId: taggerWallet,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
        householdId: household.id,
      });

      await deleteAccount(deletedId);
      userIds.splice(userIds.indexOf(deletedId), 1); // already gone

      const [survivingTx] = await dbWrite
        .select({ id: transactions.id, householdId: transactions.householdId })
        .from(transactions)
        .where(eq(transactions.id, taggedTx.id));
      expect(survivingTx).toBeDefined();
      expect(survivingTx?.householdId).toBe(household.id);

      // The deleted user's own membership is gone; the tagger's is untouched.
      const [deletedMembership] = await dbWrite
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(eq(householdMembers.userId, deletedId));
      expect(deletedMembership).toBeUndefined();
      const [taggerMembership] = await dbWrite
        .select({ status: householdMembers.status })
        .from(householdMembers)
        .where(eq(householdMembers.userId, taggerId));
      expect(taggerMembership?.status).toBe('active');
    });

    it('reassigns households.created_by to the current owner when the deleted user created it but later transferred ownership away', async () => {
      const creatorId = await createTestUser();
      const newOwnerId = await createTestUser();
      userIds.push(creatorId, newOwnerId);

      const household = await createHousehold(creatorId, { name: 'Keluarga Alih', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, newOwnerId, { role: 'member', joinedAt: new Date() });
      await transferOwnership(creatorId, household.id, newOwnerId);

      // The creator is no longer owner, so deletion is NOT blocked, despite
      // households.created_by (ON DELETE RESTRICT) still pointing at them.
      await deleteAccount(creatorId);
      userIds.splice(userIds.indexOf(creatorId), 1); // already gone

      const [householdRow] = await dbWrite
        .select({ createdBy: households.createdBy })
        .from(households)
        .where(eq(households.id, household.id));
      expect(householdRow).toBeDefined();
      expect(householdRow?.createdBy).toBe(newOwnerId); // reassigned, not left dangling
    });

    it('reassigns a SHARED savings goal to another active member instead of deleting it, preserving other members\' contributions and decrementing the deleted member\'s own', async () => {
      const ownerId = await createTestUser();
      const creatorMemberId = await createTestUser();
      userIds.push(ownerId, creatorMemberId);

      const household = await createHousehold(ownerId, { name: 'Keluarga Tabungan', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, creatorMemberId, { role: 'member', joinedAt: new Date() });

      // The MEMBER (not the owner) creates the shared goal.
      const goal = await createGoal(creatorMemberId, {
        name: 'Liburan Keluarga',
        targetAmount: 5_000_000_00n,
        targetDate: null,
        householdId: household.id,
      });

      // Both the owner AND the creator contribute.
      const ownerWallet = await createTestWallet(ownerId);
      const ownerContribution = await contribute(ownerId, goal.id, {
        walletId: ownerWallet,
        amount: 1_000_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      const creatorWallet = await createTestWallet(creatorMemberId);
      await contribute(creatorMemberId, goal.id, {
        walletId: creatorWallet,
        amount: 500_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      // Sanity: current_amount reflects BOTH contributions before deletion.
      const [beforeGoal] = await dbWrite
        .select({ currentAmount: savingsGoals.currentAmount })
        .from(savingsGoals)
        .where(eq(savingsGoals.id, goal.id));
      expect(beforeGoal?.currentAmount).toBe(1_500_000_00n);

      await deleteAccount(creatorMemberId);
      userIds.splice(userIds.indexOf(creatorMemberId), 1); // already gone

      // The goal SURVIVES, reassigned to the remaining active owner.
      const [afterGoal] = await dbWrite
        .select({ userId: savingsGoals.userId, currentAmount: savingsGoals.currentAmount, householdId: savingsGoals.householdId })
        .from(savingsGoals)
        .where(eq(savingsGoals.id, goal.id));
      expect(afterGoal).toBeDefined();
      expect(afterGoal?.userId).toBe(ownerId);
      expect(afterGoal?.householdId).toBe(household.id);
      // The deleted member's own 500k contribution is backed out; the
      // owner's 1,000,000 remains.
      expect(afterGoal?.currentAmount).toBe(1_000_000_00n);

      // The owner's own contribution row is completely untouched.
      const [survivingContribution] = await dbWrite
        .select({ id: savingsContributions.id, amount: savingsContributions.amount })
        .from(savingsContributions)
        .where(eq(savingsContributions.id, ownerContribution.id));
      expect(survivingContribution).toBeDefined();
      expect(survivingContribution?.amount).toBe(1_000_000_00n);

      // The deleted member's own contribution row is gone (their own data).
      const [deletedContribution] = await dbWrite
        .select({ id: savingsContributions.id })
        .from(savingsContributions)
        .where(eq(savingsContributions.userId, creatorMemberId));
      expect(deletedContribution).toBeUndefined();
    });
  });
});
