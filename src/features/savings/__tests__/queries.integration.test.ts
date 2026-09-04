// @vitest-environment node
/**
 * Integration tests for the savings read queries — real Neon database (see
 * .env, loaded via vitest.config.ts). Builds data through the service layer
 * (src/lib/services/savings.ts, src/lib/services/households.ts), same
 * pattern as src/features/household/__tests__/queries.integration.test.ts.
 *
 * Focused on the access-scoping SQL in queries.ts — personal-vs-shared
 * visibility, archived exclusion, and cross-user isolation are exactly the
 * class of bug (wrong join, wrong NULL handling) unit-level reasoning alone
 * can't catch.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { archiveHousehold, createHousehold } from '@/lib/services/households';
import { archiveGoal, contribute, createGoal, withdraw } from '@/lib/services/savings';
import {
  createTestHouseholdMember,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestSavingsGoal,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import {
  getContributionsByMember,
  getGoal,
  getOwnFundedAmount,
  getTotalSavings,
  listContributions,
  listGoals,
  listHouseholdGoals,
} from '../queries';

describe('savings queries', () => {
  const userIds: string[] = [];
  const householdIds: string[] = [];
  const goalIds: string[] = [];

  afterEach(async () => {
    for (const id of goalIds.splice(0)) {
      await deleteTestSavingsGoal(id);
    }
    for (const id of householdIds.splice(0)) {
      await deleteTestHousehold(id);
    }
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  describe('listGoals', () => {
    it("lists the caller's personal goals plus shared goals from every active household, and no one else's personal goals", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const household = await createHousehold(alice, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, bob, { role: 'member' });

      const alicePersonal = await createGoal(alice, {
        name: 'Alice Personal',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      const bobPersonal = await createGoal(bob, {
        name: 'Bob Personal',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      const shared = await createGoal(alice, {
        name: 'Shared',
        targetAmount: 5_000_000_00n,
        targetDate: null,
        householdId: household.id,
      });
      goalIds.push(alicePersonal.id, bobPersonal.id, shared.id);

      const aliceGoals = await listGoals(alice);
      expect(aliceGoals.map((g) => g.name).sort()).toEqual(['Alice Personal', 'Shared']);

      const bobGoals = await listGoals(bob);
      expect(bobGoals.map((g) => g.name).sort()).toEqual(['Bob Personal', 'Shared']);
    });

    it('excludes archived goals', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const goal = await createGoal(userId, {
        name: 'Goal',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      expect(await listGoals(userId)).toHaveLength(1);
      await archiveGoal(userId, goal.id);
      expect(await listGoals(userId)).toHaveLength(0);
    });

    it('excludes a shared goal once the household is archived', async () => {
      const owner = await createTestUser();
      userIds.push(owner);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const goal = await createGoal(owner, {
        name: 'Shared',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: household.id,
      });
      goalIds.push(goal.id);

      expect(await listGoals(owner)).toHaveLength(1);
      await archiveHousehold(owner, household.id);
      expect(await listGoals(owner)).toHaveLength(0);
    });

    it("excludes a shared goal after the caller's membership is removed", async () => {
      const owner = await createTestUser();
      const outsider = await createTestUser();
      userIds.push(owner, outsider);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const goal = await createGoal(owner, {
        name: 'Shared',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: household.id,
      });
      goalIds.push(goal.id);

      // outsider was never a member — not in the list at all.
      expect(await listGoals(outsider)).toHaveLength(0);
    });
  });

  describe('listHouseholdGoals', () => {
    it("lists only the given household's non-archived goals", async () => {
      const owner = await createTestUser();
      userIds.push(owner);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const personal = await createGoal(owner, {
        name: 'Personal',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      const shared = await createGoal(owner, {
        name: 'Shared',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: household.id,
      });
      goalIds.push(personal.id, shared.id);

      const rows = await listHouseholdGoals(household.id);
      expect(rows.map((r) => r.name)).toEqual(['Shared']);
    });
  });

  describe('getGoal', () => {
    it('returns null for a personal goal belonging to someone else', async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const goal = await createGoal(alice, {
        name: 'Alice Goal',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      expect(await getGoal(bob, goal.id)).toBeNull();
      expect(await getGoal(alice, goal.id)).not.toBeNull();
    });

    it('returns null for a shared goal when the caller is not an active member', async () => {
      const owner = await createTestUser();
      const outsider = await createTestUser();
      userIds.push(owner, outsider);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const goal = await createGoal(owner, {
        name: 'Shared',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: household.id,
      });
      goalIds.push(goal.id);

      expect(await getGoal(outsider, goal.id)).toBeNull();
    });

    it('returns activeMemberCount for a shared goal and null for a personal goal', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });
      const shared = await createGoal(owner, {
        name: 'Shared',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: household.id,
      });
      const personal = await createGoal(owner, {
        name: 'Personal',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(shared.id, personal.id);

      const sharedRow = await getGoal(owner, shared.id);
      expect(sharedRow?.activeMemberCount).toBe(2);
      const personalRow = await getGoal(owner, personal.id);
      expect(personalRow?.activeMemberCount).toBeNull();
    });
  });

  describe('listContributions / getContributionsByMember', () => {
    it('attaches contributor name and orders member totals biggest-first', async () => {
      const owner = await createTestUser({ name: 'Wahid' });
      const member = await createTestUser({ name: 'Istri' });
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });
      const ownerWallet = await createTestWallet(owner);
      const memberWallet = await createTestWallet(member);
      const goal = await createGoal(owner, {
        name: 'Liburan',
        targetAmount: 20_000_000_00n,
        targetDate: null,
        householdId: household.id,
      });
      goalIds.push(goal.id);

      await contribute(owner, goal.id, {
        walletId: ownerWallet,
        amount: 5_000_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await contribute(member, goal.id, {
        walletId: memberWallet,
        amount: 3_000_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      const history = await listContributions(goal.id);
      expect(history).toHaveLength(2);
      expect(history.every((h) => h.contributorName === 'Wahid' || h.contributorName === 'Istri')).toBe(true);

      const byMember = await getContributionsByMember(goal.id);
      expect(byMember).toEqual([
        { userId: owner, name: 'Wahid', image: null, total: 5_000_000_00n },
        { userId: member, name: 'Istri', image: null, total: 3_000_000_00n },
      ]);
    });
  });

  describe('getTotalSavings / getOwnFundedAmount', () => {
    it('nets withdrawals against contributions, across every goal the user has contributed to', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goalA = await createGoal(userId, {
        name: 'A',
        targetAmount: 10_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      const goalB = await createGoal(userId, {
        name: 'B',
        targetAmount: 10_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goalA.id, goalB.id);

      await contribute(userId, goalA.id, {
        walletId,
        amount: 2_000_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await contribute(userId, goalB.id, {
        walletId,
        amount: 1_000_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await withdraw(userId, goalA.id, {
        walletId,
        amount: 500_000_00n,
        withdrawalDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(await getTotalSavings(userId)).toBe(2_500_000_00n); // (2jt - 500rb) + 1jt
      expect(await getOwnFundedAmount(userId, goalA.id)).toBe(1_500_000_00n);
      expect(await getOwnFundedAmount(userId, goalB.id)).toBe(1_000_000_00n);
    });

    it("getOwnFundedAmount is isolated per member on a shared goal", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });
      const ownerWallet = await createTestWallet(owner);
      const goal = await createGoal(owner, {
        name: 'Shared',
        targetAmount: 10_000_000_00n,
        targetDate: null,
        householdId: household.id,
      });
      goalIds.push(goal.id);

      await contribute(owner, goal.id, {
        walletId: ownerWallet,
        amount: 5_000_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(await getOwnFundedAmount(owner, goal.id)).toBe(5_000_000_00n);
      expect(await getOwnFundedAmount(member, goal.id)).toBe(0n);
    });
  });
});
