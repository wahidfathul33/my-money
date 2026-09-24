// @vitest-environment node
/**
 * Service-level integration tests for src/lib/services/recurring-savings.ts —
 * tasks/24-recurring-transactions. Mirrors
 * src/lib/services/__tests__/recurring-transactions.integration.test.ts's
 * structure; "net-worth-neutral" here means the wallet's balance falls by
 * EXACTLY the goal's `current_amount` rise — the same assertion shape
 * src/lib/services/__tests__/savings.integration.test.ts already uses for
 * manual `contribute()`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { recurringSavingsContributions } from '@/lib/db/schema/recurring';
import { savingsContributions, savingsGoals } from '@/lib/db/schema/savings';
import { wallets } from '@/lib/db/schema/wallets';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { createGoal } from '@/lib/services/savings';
import {
  createRecurringContribution,
  deleteRecurringContribution,
  materializeRecurringContributions,
  pauseRecurringContribution,
  resumeRecurringContribution,
} from '@/lib/services/recurring-savings';
import {
  createTestHousehold,
  createTestHouseholdMember,
  createTestRecurringContribution,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestSavingsGoal,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { toLocalDate } from '@/lib/date/timezone';

const AMOUNT = 50_000_00n; // Rp50.000

async function walletBalance(walletId: string): Promise<bigint> {
  const [row] = await dbWrite.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.id, walletId));
  return row!.balance;
}

async function goalCurrentAmount(goalId: string): Promise<bigint> {
  const [row] = await dbWrite
    .select({ currentAmount: savingsGoals.currentAmount })
    .from(savingsGoals)
    .where(eq(savingsGoals.id, goalId));
  return row!.currentAmount;
}

describe('recurring-savings service', () => {
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

  describe('createRecurringContribution', () => {
    it('creates a future-dated rule with next_run_date = start_date, no synchronous contribution', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Dana Darurat',
        targetAmount: 10_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      const row = await createRecurringContribution(userId, {
        goalId: goal.id,
        walletId,
        amount: AMOUNT,
        frequency: 'monthly',
        startDate: '2099-01-01',
        endDate: null,
      });

      expect(row.status).toBe('active');
      expect(row.nextRunDate).toBe('2099-01-01');
      expect(await walletBalance(walletId)).toBe(0n);
      expect(await goalCurrentAmount(goal.id)).toBe(0n);
    });

    it('materializes the first contribution synchronously when start_date is today — net-worth-neutral', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Dana Darurat',
        targetAmount: 10_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);
      const today = toLocalDate(new Date());

      const row = await createRecurringContribution(userId, {
        goalId: goal.id,
        walletId,
        amount: AMOUNT,
        frequency: 'monthly',
        startDate: today,
        endDate: null,
      });

      // Wallet down, goal up, by the EXACT same amount — net worth unchanged.
      expect(await walletBalance(walletId)).toBe(-AMOUNT);
      expect(await goalCurrentAmount(goal.id)).toBe(AMOUNT);
      expect(row.nextRunDate > today).toBe(true);

      const [contribution] = await dbWrite
        .select()
        .from(savingsContributions)
        .where(eq(savingsContributions.savingsGoalId, goal.id));
      expect(contribution).toBeDefined();
      expect(contribution!.amount).toBe(AMOUNT);
      expect(contribution!.ledgerEntryId).not.toBeNull(); // real money movement, ADR-026
    });

    it('rejects a goal the caller cannot access (personal goal owned by someone else)', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const otherId = await createTestUser();
      userIds.push(otherId);
      const walletId = await createTestWallet(otherId);
      const goal = await createGoal(ownerId, {
        name: 'Bukan Milikmu',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      await expect(
        createRecurringContribution(otherId, {
          goalId: goal.id,
          walletId,
          amount: AMOUNT,
          frequency: 'monthly',
          startDate: '2099-01-01',
          endDate: null,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects an archived goal', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Diarsipkan',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);
      await dbWrite.update(savingsGoals).set({ status: 'archived' }).where(eq(savingsGoals.id, goal.id));

      await expect(
        createRecurringContribution(userId, {
          goalId: goal.id,
          walletId,
          amount: AMOUNT,
          frequency: 'monthly',
          startDate: '2099-01-01',
          endDate: null,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('allows a rule on a SHARED goal for any active household member', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const memberId = await createTestUser();
      userIds.push(memberId);
      const householdId = await createTestHousehold(ownerId);
      householdIds.push(householdId);
      await createTestHouseholdMember(householdId, memberId);
      await createTestHouseholdMember(householdId, ownerId, { role: 'owner' });

      const goal = await createGoal(ownerId, {
        name: 'Liburan Keluarga',
        targetAmount: 5_000_000_00n,
        targetDate: null,
        householdId,
      });
      goalIds.push(goal.id);

      const memberWalletId = await createTestWallet(memberId);
      const row = await createRecurringContribution(memberId, {
        goalId: goal.id,
        walletId: memberWalletId,
        amount: AMOUNT,
        frequency: 'weekly',
        startDate: '2099-01-01',
        endDate: null,
      });
      expect(row.userId).toBe(memberId);
    });
  });

  describe('pause / resume / delete', () => {
    it('pauses and resumes, preserving next_run_date (never resets to today)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Target',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);
      const ruleId = await createTestRecurringContribution(userId, goal.id, {
        walletId,
        nextRunDate: '2099-07-20',
      });

      const paused = await pauseRecurringContribution(userId, ruleId);
      expect(paused.status).toBe('paused');

      const resumed = await resumeRecurringContribution(userId, ruleId);
      expect(resumed.status).toBe('active');
      expect(resumed.nextRunDate).toBe('2099-07-20');
    });

    it('rejects pausing/deleting a rule owned by someone else', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const otherId = await createTestUser();
      userIds.push(otherId);
      const goal = await createGoal(ownerId, {
        name: 'Target',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);
      const ruleId = await createTestRecurringContribution(ownerId, goal.id);

      await expect(pauseRecurringContribution(otherId, ruleId)).rejects.toThrow(NotFoundError);
      await expect(deleteRecurringContribution(otherId, ruleId)).rejects.toThrow(NotFoundError);
    });

    it('deletes a rule', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const goal = await createGoal(userId, {
        name: 'Target',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);
      const ruleId = await createTestRecurringContribution(userId, goal.id);

      await deleteRecurringContribution(userId, ruleId);

      const [row] = await dbWrite
        .select()
        .from(recurringSavingsContributions)
        .where(eq(recurringSavingsContributions.id, ruleId));
      expect(row).toBeUndefined();
    });
  });

  describe('materializeRecurringContributions', () => {
    it('materializes a due row: wallet down, goal up, by the exact same amount (net-worth-neutral), and advances next_run_date', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Target',
        targetAmount: 100_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);
      const ruleId = await createTestRecurringContribution(userId, goal.id, {
        walletId,
        amount: AMOUNT,
        frequency: 'monthly',
        startDate: '2026-01-31',
        nextRunDate: '2026-01-31',
      });

      const result = await materializeRecurringContributions(new Date('2026-02-01T12:00:00Z'));
      expect(result.succeeded).toBeGreaterThanOrEqual(1);

      expect(await walletBalance(walletId)).toBe(-AMOUNT);
      expect(await goalCurrentAmount(goal.id)).toBe(AMOUNT);

      const [rule] = await dbWrite
        .select()
        .from(recurringSavingsContributions)
        .where(eq(recurringSavingsContributions.id, ruleId));
      // Same monthly end-of-month clamp as recurring-transactions.
      expect(rule!.nextRunDate.startsWith('2026-02-')).toBe(true);
    });

    it('is idempotent: calling twice for the same due date never creates a duplicate contribution', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Target',
        targetAmount: 100_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);
      await createTestRecurringContribution(userId, goal.id, {
        walletId,
        amount: AMOUNT,
        frequency: 'daily',
        startDate: '2026-01-01',
        nextRunDate: '2026-01-01',
      });

      const now = new Date('2026-01-01T12:00:00Z');
      await materializeRecurringContributions(now);
      await materializeRecurringContributions(now);

      expect(await walletBalance(walletId)).toBe(-AMOUNT); // moved exactly ONCE
      expect(await goalCurrentAmount(goal.id)).toBe(AMOUNT);

      const rows = await dbWrite
        .select()
        .from(savingsContributions)
        .where(eq(savingsContributions.savingsGoalId, goal.id));
      expect(rows).toHaveLength(1);
    });

    it('a failing row (goal archived out from under it) does not affect other due rows, and its next_run_date is not advanced', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const goodWalletId = await createTestWallet(userId);
      const goodGoal = await createGoal(userId, {
        name: 'Goal Baik',
        targetAmount: 100_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goodGoal.id);
      await createTestRecurringContribution(userId, goodGoal.id, {
        walletId: goodWalletId,
        amount: AMOUNT,
        frequency: 'daily',
        startDate: '2026-03-01',
        nextRunDate: '2026-03-01',
      });

      const badWalletId = await createTestWallet(userId);
      const badGoal = await createGoal(userId, {
        name: 'Goal Diarsipkan',
        targetAmount: 100_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(badGoal.id);
      const badRuleId = await createTestRecurringContribution(userId, badGoal.id, {
        walletId: badWalletId,
        amount: AMOUNT,
        frequency: 'daily',
        startDate: '2026-03-01',
        nextRunDate: '2026-03-01',
      });
      await dbWrite.update(savingsGoals).set({ status: 'archived' }).where(eq(savingsGoals.id, badGoal.id));

      const result = await materializeRecurringContributions(new Date('2026-03-01T12:00:00Z'));
      expect(result.succeeded).toBeGreaterThanOrEqual(1);
      expect(result.failed).toBeGreaterThanOrEqual(1);

      expect(await walletBalance(goodWalletId)).toBe(-AMOUNT);
      expect(await walletBalance(badWalletId)).toBe(0n);

      const [badRule] = await dbWrite
        .select()
        .from(recurringSavingsContributions)
        .where(eq(recurringSavingsContributions.id, badRuleId));
      expect(badRule!.nextRunDate).toBe('2026-03-01');
      expect(badRule!.status).toBe('active');
    });

    it('a paused rule is never materialized', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Target',
        targetAmount: 100_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);
      const ruleId = await createTestRecurringContribution(userId, goal.id, {
        walletId,
        status: 'paused',
        frequency: 'daily',
        startDate: '2026-04-01',
        nextRunDate: '2026-04-01',
      });

      await materializeRecurringContributions(new Date('2026-04-05T12:00:00Z'));

      expect(await walletBalance(walletId)).toBe(0n);
      const [rule] = await dbWrite
        .select()
        .from(recurringSavingsContributions)
        .where(eq(recurringSavingsContributions.id, ruleId));
      expect(rule!.nextRunDate).toBe('2026-04-01');
    });
  });
});
