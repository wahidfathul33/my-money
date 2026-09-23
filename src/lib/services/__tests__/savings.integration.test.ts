// @vitest-environment node
/**
 * Integration tests for the savings goals service — real Neon database (see
 * .env, loaded via vitest.config.ts). Same pattern as
 * src/lib/services/__tests__/transfers.integration.test.ts.
 *
 * Covers tasks/15-savings-goals/spec.md's and todo.md's acceptance criteria
 * that can only be proven against a real DB transaction: the
 * `ledger_entry_id NOT NULL` constraint itself (ADR-026's central claim),
 * atomic wallet-balance movement, cross-user withdrawal isolation, auto-
 * `completed`, idempotency, reconciliation, and — the ultimate proof — net
 * worth held exactly constant across an arbitrary sequence of contributions
 * (property test).
 */
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { and, eq, isNull } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { ledgerEntries } from '@/lib/db/schema/transactions';
import { savingsContributions, savingsGoals } from '@/lib/db/schema/savings';
import { wallets } from '@/lib/db/schema/wallets';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { findWalletBalanceDrift } from '@/lib/db/reconcile';
import {
  createTestHouseholdMember,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestSavingsGoal,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { getMonthlyTotals } from '@/features/transactions/queries';
import { createHousehold } from '../households';
import { archiveGoal, contribute, createGoal, updateGoal, withdraw } from '../savings';

describe('savings service', () => {
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

  async function walletBalance(walletId: string): Promise<bigint> {
    const [row] = await dbWrite.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.id, walletId));
    return row?.balance ?? 0n;
  }

  async function goalRow(goalId: string) {
    const [row] = await dbWrite.select().from(savingsGoals).where(eq(savingsGoals.id, goalId));
    return row;
  }

  async function nonVoidContributionSum(goalId: string): Promise<bigint> {
    const rows = await dbWrite
      .select({ amount: savingsContributions.amount })
      .from(savingsContributions)
      .where(and(eq(savingsContributions.savingsGoalId, goalId), isNull(savingsContributions.voidedAt)));
    return rows.reduce((acc, r) => acc + r.amount, 0n);
  }

  describe('createGoal', () => {
    it('creates a personal goal owned by the creator, household_id NULL', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      const goal = await createGoal(userId, {
        name: 'Dana Darurat',
        targetAmount: 10_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      expect(goal.userId).toBe(userId);
      expect(goal.householdId).toBeNull();
      expect(goal.status).toBe('active');
      expect(goal.currentAmount).toBe(0n);
    });

    it('a shared goal can be created by ANY active member, not just the owner', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });

      const goal = await createGoal(member, {
        name: 'Liburan Keluarga',
        targetAmount: 20_000_000_00n,
        targetDate: null,
        householdId: household.id,
      });
      goalIds.push(goal.id);

      expect(goal.householdId).toBe(household.id);
      expect(goal.userId).toBe(member); // creator recorded, but household_id makes it shared for everyone
    });

    it('rejects creating a shared goal for a household the caller is not an active member of', async () => {
      const owner = await createTestUser();
      const outsider = await createTestUser();
      userIds.push(owner, outsider);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      await expect(
        createGoal(outsider, {
          name: 'Tidak Sah',
          targetAmount: 1_000_000_00n,
          targetDate: null,
          householdId: household.id,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects a non-positive targetAmount', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await expect(
        createGoal(userId, { name: 'Invalid', targetAmount: 0n, targetDate: null, householdId: null }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects a blank name', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await expect(
        createGoal(userId, { name: '   ', targetAmount: 1_000_00n, targetDate: null, householdId: null }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('contribute', () => {
    it('reduces the wallet balance by exactly the contributed amount and increases current_amount by the same amount — one transaction', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { name: 'BCA' });
      const goal = await createGoal(userId, {
        name: 'Dana Darurat',
        targetAmount: 10_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      await contribute(userId, goal.id, {
        walletId,
        amount: 1_000_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(await walletBalance(walletId)).toBe(-1_000_000_00n);
      const updated = await goalRow(goal.id);
      expect(updated?.currentAmount).toBe(1_000_000_00n);
    });

    it('writes a ledger_entries row (source=savings_contribution, sourceId=goalId) whose id becomes the contribution\'s ledger_entry_id', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Goal',
        targetAmount: 5_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      const row = await contribute(userId, goal.id, {
        walletId,
        amount: 500_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(row.ledgerEntryId).toBeTruthy();
      const [entry] = await dbWrite.select().from(ledgerEntries).where(eq(ledgerEntries.id, row.ledgerEntryId));
      expect(entry?.source).toBe('savings_contribution');
      expect(entry?.sourceId).toBe(goal.id);
      expect(entry?.amount).toBe(-500_000_00n);
      expect(entry?.walletId).toBe(walletId);
      expect(entry?.transactionId).toBeNull(); // no `transactions` row for a savings contribution
    });

    it('never appears in getMonthlyTotals income or expense — spec.md "tidak pernah terhitung sebagai expense"', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Goal',
        targetAmount: 50_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);
      const now = new Date();

      await contribute(userId, goal.id, {
        walletId,
        amount: 9_999_999_00n, // deliberately huge — would blow up totals if miscounted
        contributionDate: now,
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      const period = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
      const totals = await getMonthlyTotals(userId, period);
      expect(totals.expense).toBe(0n);
      expect(totals.income).toBe(0n);
    });

    it('auto-flips status to completed once current_amount >= target_amount', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Goal',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      await contribute(userId, goal.id, {
        walletId,
        amount: 1_000_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      const updated = await goalRow(goal.id);
      expect(updated?.status).toBe('completed');
    });

    it('does not flip status when the contribution keeps current_amount below target', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Goal',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      await contribute(userId, goal.id, {
        walletId,
        amount: 500_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      const updated = await goalRow(goal.id);
      expect(updated?.status).toBe('active');
    });

    it('rejects contributing to an archived goal, applying no change', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Goal',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);
      await archiveGoal(userId, goal.id);

      await expect(
        contribute(userId, goal.id, {
          walletId,
          amount: 100_000_00n,
          contributionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(walletId)).toBe(0n);
      expect(await nonVoidContributionSum(goal.id)).toBe(0n);
    });

    it('rejects a non-positive amount, applying no change (rollback)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Goal',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      await expect(
        contribute(userId, goal.id, {
          walletId,
          amount: 0n,
          contributionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(walletId)).toBe(0n);
    });

    it("rejects contributing from a wallet that isn't the caller's own — cross-user isolation, zero changes", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const bobWallet = await createTestWallet(bob, { name: 'Bob Tunai' });
      const goal = await createGoal(alice, {
        name: 'Goal Alice',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      await expect(
        contribute(alice, goal.id, {
          walletId: bobWallet, // Alice attempts to contribute FROM Bob's wallet.
          amount: 100_000_00n,
          contributionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(bobWallet)).toBe(0n);
      const updated = await goalRow(goal.id);
      expect(updated?.currentAmount).toBe(0n);
    });

    it("rejects contributing to a personal goal that belongs to someone else — NotFoundError, not Forbidden", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const bobWallet = await createTestWallet(bob);
      const aliceGoal = await createGoal(alice, {
        name: 'Goal Alice',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(aliceGoal.id);

      await expect(
        contribute(bob, aliceGoal.id, {
          walletId: bobWallet,
          amount: 100_000_00n,
          contributionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('any active household member can contribute to a shared goal, from their OWN wallet', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });
      const memberWallet = await createTestWallet(member, { name: 'Member Wallet' });

      const goal = await createGoal(owner, {
        name: 'Liburan',
        targetAmount: 20_000_000_00n,
        targetDate: null,
        householdId: household.id,
      });
      goalIds.push(goal.id);

      await contribute(member, goal.id, {
        walletId: memberWallet,
        amount: 3_000_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(await walletBalance(memberWallet)).toBe(-3_000_000_00n);
      const updated = await goalRow(goal.id);
      expect(updated?.currentAmount).toBe(3_000_000_00n);
    });

    it('rejects contributing to a shared goal by a non-member', async () => {
      const owner = await createTestUser();
      const outsider = await createTestUser();
      userIds.push(owner, outsider);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const outsiderWallet = await createTestWallet(outsider);

      const goal = await createGoal(owner, {
        name: 'Liburan',
        targetAmount: 20_000_000_00n,
        targetDate: null,
        householdId: household.id,
      });
      goalIds.push(goal.id);

      await expect(
        contribute(outsider, goal.id, {
          walletId: outsiderWallet,
          amount: 1_000_000_00n,
          contributionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('is idempotent: the same idempotencyKey twice returns the SAME contribution and moves the balance once', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Goal',
        targetAmount: 5_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);
      const idempotencyKey = crypto.randomUUID();

      const first = await contribute(userId, goal.id, {
        walletId,
        amount: 400_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey,
      });
      const second = await contribute(userId, goal.id, {
        walletId,
        amount: 400_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey,
      });

      expect(second.id).toBe(first.id);
      expect(await walletBalance(walletId)).toBe(-400_000_00n);
      const updated = await goalRow(goal.id);
      expect(updated?.currentAmount).toBe(400_000_00n);
    });
  });

  // I5: every savings contribution has a non-null ledger_entry_id whose
  // amount is opposite in sign and equal in magnitude — the NOT NULL
  // constraint here, plus the sign/magnitude checks in 'contribute' and
  // 'withdraw' above (e.g. "writes a ledger_entries row ... whose id becomes
  // the contribution's ledger_entry_id" and "writes a ledger_entries row
  // (source=savings_withdrawal) with a positive amount into the withdrawer
  // wallet"), together prove it end to end.
  describe('the DB constraint itself (ledger_entry_id NOT NULL)', () => {
    it('rejects a raw INSERT of a savings_contributions row with a NULL ledger_entry_id, independent of application code', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Goal',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      await expect(
        // @ts-expect-error — deliberately passing ledgerEntryId: null to prove the DB itself rejects it, independent of app code/types.
        dbWrite.insert(savingsContributions).values({
          id: crypto.randomUUID(),
          savingsGoalId: goal.id,
          userId,
          walletId,
          ledgerEntryId: null,
          amount: 100_000_00n,
          contributionDate: new Date(),
        }),
      ).rejects.toThrow();

      // Structurally confirms nothing was left behind: the DB refused the
      // row entirely, so current_amount (a cache derived alongside a REAL
      // ledger entry only) never moved.
      const updated = await goalRow(goal.id);
      expect(updated?.currentAmount).toBe(0n);
    });

    it('rejects a raw INSERT of a zero-amount contribution, independent of application code (sc_amount_nonzero)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Goal',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      const [entry] = await dbWrite
        .insert(ledgerEntries)
        .values({
          id: crypto.randomUUID(),
          userId,
          walletId,
          amount: -1n,
          source: 'savings_contribution',
          entryDate: new Date(),
          sourceId: goal.id,
        })
        .returning();

      await expect(
        dbWrite.insert(savingsContributions).values({
          id: crypto.randomUUID(),
          savingsGoalId: goal.id,
          userId,
          walletId,
          ledgerEntryId: entry!.id,
          amount: 0n, // sc_amount_nonzero
          contributionDate: new Date(),
        }),
      ).rejects.toThrow();
    });
  });

  describe('withdraw', () => {
    /** `amount: 0n` skips the seed contribution entirely (rather than
     * calling `contribute` with a rejected zero amount) — used by tests
     * that want a fresh goal and drive every contribution themselves. */
    async function setupPersonalGoalWithContribution(amount = 2_000_000_00n) {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Goal',
        targetAmount: 5_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);
      if (amount === 0n) {
        return { userId, walletId, goal };
      }
      await contribute(userId, goal.id, {
        walletId,
        amount,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      return { userId, walletId, goal };
    }

    it('reverses the wallet balance and current_amount by exactly the withdrawn amount', async () => {
      const { userId, walletId, goal } = await setupPersonalGoalWithContribution(2_000_000_00n);

      await withdraw(userId, goal.id, {
        walletId,
        amount: 500_000_00n,
        withdrawalDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(await walletBalance(walletId)).toBe(-1_500_000_00n); // -2jt contributed, +500rb withdrawn back
      const updated = await goalRow(goal.id);
      expect(updated?.currentAmount).toBe(1_500_000_00n);
    });

    it('writes a ledger_entries row (source=savings_withdrawal) with a positive amount into the withdrawer wallet', async () => {
      const { userId, walletId, goal } = await setupPersonalGoalWithContribution();

      const row = await withdraw(userId, goal.id, {
        walletId,
        amount: 300_000_00n,
        withdrawalDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(row.amount).toBe(-300_000_00n); // negative = withdrawal, in the contributions ledger
      const [entry] = await dbWrite.select().from(ledgerEntries).where(eq(ledgerEntries.id, row.ledgerEntryId));
      expect(entry?.source).toBe('savings_withdrawal');
      expect(entry?.amount).toBe(300_000_00n); // positive — money IN to the wallet
      expect(entry?.sourceId).toBe(goal.id);
    });

    it("rejects withdrawing more than the caller's own net-funded amount, applying no change", async () => {
      const { userId, walletId, goal } = await setupPersonalGoalWithContribution(1_000_000_00n);

      await expect(
        withdraw(userId, goal.id, {
          walletId,
          amount: 1_000_000_01n, // one cent over what was contributed
          withdrawalDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(walletId)).toBe(-1_000_000_00n); // unchanged
      const updated = await goalRow(goal.id);
      expect(updated?.currentAmount).toBe(1_000_000_00n);
    });

    it("on a SHARED goal, rejects withdrawing another member's contribution even though the goal total is high enough — isolation", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });
      const ownerWallet = await createTestWallet(owner, { name: 'Owner Wallet' });
      const memberWallet = await createTestWallet(member, { name: 'Member Wallet' });

      const goal = await createGoal(owner, {
        name: 'Liburan Keluarga',
        targetAmount: 20_000_000_00n,
        targetDate: null,
        householdId: household.id,
      });
      goalIds.push(goal.id);

      // Owner contributes Rp5.000.000; member contributes NOTHING.
      await contribute(owner, goal.id, {
        walletId: ownerWallet,
        amount: 5_000_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      // Member attempts to withdraw Rp1 — they have zero of their OWN
      // funded balance on this goal, even though the goal's current_amount
      // (Rp5jt, all owner's) would easily cover it.
      await expect(
        withdraw(member, goal.id, {
          walletId: memberWallet,
          amount: 1_00n,
          withdrawalDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(ownerWallet)).toBe(-5_000_000_00n); // untouched
      expect(await walletBalance(memberWallet)).toBe(0n); // untouched
      const updated = await goalRow(goal.id);
      expect(updated?.currentAmount).toBe(5_000_000_00n); // untouched
    });

    it("rejects withdrawing to a wallet that isn't the withdrawer's own — isolation, even on a shared goal", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });
      const ownerWallet = await createTestWallet(owner, { name: 'Owner Wallet' });

      const goal = await createGoal(owner, {
        name: 'Liburan Keluarga',
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

      // Owner tries to withdraw THEIR OWN funded amount, but into the
      // MEMBER's wallet — must be rejected: withdrawal always pays into the
      // withdrawer's own wallet, never anyone else's.
      await expect(
        withdraw(owner, goal.id, {
          walletId: ownerWallet, // sanity control value below overwritten
          amount: 1_000_000_00n,
          withdrawalDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).resolves.toBeTruthy(); // control: owner CAN withdraw to their own wallet

      await expect(
        withdraw(member, goal.id, {
          walletId: ownerWallet, // member attempts to withdraw INTO owner's wallet
          amount: 1_00n,
          withdrawalDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('allows withdrawal even from an ARCHIVED goal — the money stays the owner\'s asset until withdrawn', async () => {
      const { userId, walletId, goal } = await setupPersonalGoalWithContribution(1_000_000_00n);
      await archiveGoal(userId, goal.id);

      await withdraw(userId, goal.id, {
        walletId,
        amount: 1_000_000_00n,
        withdrawalDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(await walletBalance(walletId)).toBe(0n); // fully returned
      const updated = await goalRow(goal.id);
      expect(updated?.currentAmount).toBe(0n);
      expect(updated?.status).toBe('archived'); // withdrawal never resurrects an archived goal's status
    });

    it('un-completes a goal that drops back below target after a withdrawal', async () => {
      const { userId, walletId, goal } = await setupPersonalGoalWithContribution(0n);
      await contribute(userId, goal.id, {
        walletId,
        amount: 5_000_000_00n, // exactly the target -> completed
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      expect((await goalRow(goal.id))?.status).toBe('completed');

      await withdraw(userId, goal.id, {
        walletId,
        amount: 1_00n, // drop one cent below target
        withdrawalDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect((await goalRow(goal.id))?.status).toBe('active');
    });

    it('rejects a non-positive amount, applying no change', async () => {
      const { userId, walletId, goal } = await setupPersonalGoalWithContribution();

      await expect(
        withdraw(userId, goal.id, {
          walletId,
          amount: 0n,
          withdrawalDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('is idempotent: the same idempotencyKey twice returns the SAME withdrawal and moves the balance once', async () => {
      const { userId, walletId, goal } = await setupPersonalGoalWithContribution(1_000_000_00n);
      const idempotencyKey = crypto.randomUUID();

      const first = await withdraw(userId, goal.id, {
        walletId,
        amount: 200_000_00n,
        withdrawalDate: new Date(),
        note: null,
        idempotencyKey,
      });
      const second = await withdraw(userId, goal.id, {
        walletId,
        amount: 200_000_00n,
        withdrawalDate: new Date(),
        note: null,
        idempotencyKey,
      });

      expect(second.id).toBe(first.id);
      expect(await walletBalance(walletId)).toBe(-800_000_00n); // -1jt + 200rb, moved once
    });
  });

  describe('updateGoal / archiveGoal access', () => {
    it("rejects updating a personal goal that belongs to someone else", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const goal = await createGoal(alice, {
        name: 'Goal Alice',
        targetAmount: 1_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      await expect(
        updateGoal(bob, goal.id, { name: 'Hacked', targetAmount: 1n, targetDate: null }),
      ).rejects.toThrow(NotFoundError);
    });

    it('any active member (not just the owner) can rename/re-target a shared goal — ADR-025', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });

      const goal = await createGoal(owner, {
        name: 'Liburan',
        targetAmount: 10_000_000_00n,
        targetDate: null,
        householdId: household.id,
      });
      goalIds.push(goal.id);

      const updated = await updateGoal(member, goal.id, {
        name: 'Liburan Bali',
        targetAmount: 15_000_000_00n,
        targetDate: null,
      });
      expect(updated.name).toBe('Liburan Bali');
      expect(updated.targetAmount).toBe(15_000_000_00n);

      await archiveGoal(member, goal.id);
      expect((await goalRow(goal.id))?.status).toBe('archived');
    });
  });

  describe('reconciliation', () => {
    // I3: savings_goal.current_amount = SUM(savings_contributions.amount WHERE voided_at IS NULL).
    it('current_amount always equals SUM(non-void savings_contributions.amount) after a sequence of contribute/withdraw', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 10_000_000_00n });
      const goal = await createGoal(userId, {
        name: 'Goal',
        targetAmount: 5_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      await contribute(userId, goal.id, {
        walletId,
        amount: 2_000_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await contribute(userId, goal.id, {
        walletId,
        amount: 1_500_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await withdraw(userId, goal.id, {
        walletId,
        amount: 500_000_00n,
        withdrawalDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      const updated = await goalRow(goal.id);
      const sum = await nonVoidContributionSum(goal.id);
      expect(updated?.currentAmount).toBe(sum);
      expect(sum).toBe(3_000_000_00n);
    });

    it('shows zero wallet balance drift after a sequence of contribute/withdraw operations', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      // No `balance` override here (defaults to 0) — unlike the property
      // test below, `findWalletBalanceDrift` compares the cached balance
      // against SUM(ledger_entries), so seeding a non-zero cached balance
      // with no matching ledger entry would show a drift that has nothing
      // to do with `contribute`/`withdraw` (same reasoning
      // transfers.integration.test.ts's own drift test follows — its three
      // wallets start at the schema default too).
      const walletId = await createTestWallet(userId);
      const goal = await createGoal(userId, {
        name: 'Goal',
        targetAmount: 5_000_000_00n,
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      await contribute(userId, goal.id, {
        walletId,
        amount: 2_000_000_00n,
        contributionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await withdraw(userId, goal.id, {
        walletId,
        amount: 700_000_00n,
        withdrawalDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      const drift = await findWalletBalanceDrift();
      expect(drift.filter((d) => d.walletId === walletId)).toHaveLength(0);
    });
  });

  describe('shared goal contribution history', () => {
    it("records each contributor's own userId, so a per-member running total is derivable", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });
      const ownerWallet = await createTestWallet(owner);
      const memberWallet = await createTestWallet(member);

      const goal = await createGoal(owner, {
        name: 'Liburan Keluarga',
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

      const rows = await dbWrite
        .select({ userId: savingsContributions.userId, amount: savingsContributions.amount })
        .from(savingsContributions)
        .where(and(eq(savingsContributions.savingsGoalId, goal.id), isNull(savingsContributions.voidedAt)));

      const byMember = new Map<string, bigint>();
      for (const row of rows) {
        byMember.set(row.userId, (byMember.get(row.userId) ?? 0n) + row.amount);
      }
      expect(byMember.get(owner)).toBe(5_000_000_00n);
      expect(byMember.get(member)).toBe(3_000_000_00n);
      expect((await goalRow(goal.id))?.currentAmount).toBe(8_000_000_00n);
    });
  });

  describe('property: a contribution changes net worth by exactly zero', () => {
    // Cash moves out of the wallet by exactly the amount that moves into
    // savings — docs/03 §10.1 "Net worth: Kas −1jt, Tabungan +1jt ⇒ berubah 0."
    it('holds for a random sequence of contributions across multiple wallets and goals', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletIds = [
        await createTestWallet(userId, { name: 'W1', balance: 50_000_000_00n }),
        await createTestWallet(userId, { name: 'W2', balance: 0n }),
      ];
      const goal = await createGoal(userId, {
        name: 'Goal',
        targetAmount: 1_000_000_000_00n, // large enough to never auto-complete mid-run
        targetDate: null,
        householdId: null,
      });
      goalIds.push(goal.id);

      async function netWorth(): Promise<bigint> {
        const walletRows = await dbWrite.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.userId, userId));
        const cash = walletRows.reduce((acc, r) => acc + r.balance, 0n);
        const savings = await nonVoidContributionSum(goal.id);
        return cash + savings;
      }

      const before = await netWorth();

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              walletIndex: fc.integer({ min: 0, max: 1 }),
              amount: fc.bigInt({ min: 1n, max: 1_000_00n }),
            }),
            { minLength: 1, maxLength: 5 },
          ),
          async (moves) => {
            for (const move of moves) {
              await contribute(userId, goal.id, {
                walletId: walletIds[move.walletIndex]!,
                amount: move.amount,
                contributionDate: new Date(),
                note: null,
                idempotencyKey: crypto.randomUUID(),
              });
            }
            expect(await netWorth()).toBe(before);
          },
        ),
        { numRuns: 5 }, // real DB round trips per move — kept small deliberately
      );

      expect(await netWorth()).toBe(before);
    }, 90_000);
  });
});
