// @vitest-environment node
/**
 * Service-level integration tests for src/lib/services/budgets.ts — writes
 * only (upsert/delete/materialize). Read-side "spent" calculation lives in
 * src/features/budgets/__tests__/queries.integration.test.ts, same split as
 * wallets (src/lib/services/__tests__/wallets.integration.test.ts vs
 * src/features/wallets/__tests__/queries.integration.test.ts).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { budgets } from '@/lib/db/schema/budgets';
import { households } from '@/lib/db/schema/households';
import { users } from '@/lib/db/schema/users';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { createHousehold } from '@/lib/services/households';
import {
  deleteBudget,
  materializeRecurringBudgets,
  upsertHouseholdBudget,
  upsertPersonalBudget,
} from '@/lib/services/budgets';
import {
  createTestCategory,
  createTestHousehold,
  createTestHouseholdMember,
  createTestUser,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';

const PERIOD = '2026-09';
const AMOUNT = 500_000_00n; // Rp500.000

describe('budgets service', () => {
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

  describe('upsertPersonalBudget', () => {
    it('creates a personal budget for an owned expense category', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan', type: 'expense' });

      const row = await upsertPersonalBudget(userId, {
        categoryId,
        amount: AMOUNT,
        period: PERIOD,
        isRecurring: true,
      });

      expect(row.userId).toBe(userId);
      expect(row.categoryId).toBe(categoryId);
      expect(row.householdId).toBeNull();
      expect(row.categoryKey).toBeNull();
      expect(row.amount).toBe(AMOUNT);
      expect(row.periodStart).toBe('2026-09-01');
      expect(row.periodEnd).toBe('2026-09-30');
      expect(row.isRecurring).toBe(true);
    });

    it('rejects a category owned by someone else', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const otherId = await createTestUser();
      userIds.push(otherId);
      const categoryId = await createTestCategory(ownerId, { name: 'Makan', type: 'expense' });

      await expect(
        upsertPersonalBudget(otherId, { categoryId, amount: AMOUNT, period: PERIOD, isRecurring: true }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects an INCOME category — a budget is a spending cap', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Gaji', type: 'income' });

      await expect(
        upsertPersonalBudget(userId, { categoryId, amount: AMOUNT, period: PERIOD, isRecurring: true }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects amount <= 0', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan', type: 'expense' });

      await expect(
        upsertPersonalBudget(userId, { categoryId, amount: 0n, period: PERIOD, isRecurring: true }),
      ).rejects.toThrow(ValidationError);
      await expect(
        upsertPersonalBudget(userId, { categoryId, amount: -1n, period: PERIOD, isRecurring: true }),
      ).rejects.toThrow(ValidationError);
    });

    it('re-submitting the same category+period UPDATES the existing row instead of creating a second one', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan', type: 'expense' });

      const first = await upsertPersonalBudget(userId, {
        categoryId,
        amount: AMOUNT,
        period: PERIOD,
        isRecurring: true,
      });
      const second = await upsertPersonalBudget(userId, {
        categoryId,
        amount: AMOUNT * 2n,
        period: PERIOD,
        isRecurring: false,
      });

      expect(second.id).toBe(first.id); // same row, not a new one
      expect(second.amount).toBe(AMOUNT * 2n);
      expect(second.isRecurring).toBe(false);

      const rows = await dbWrite.select().from(budgets).where(eq(budgets.userId, userId));
      expect(rows).toHaveLength(1);
    });
  });

  describe('upsertHouseholdBudget', () => {
    it('lets ANY active member create a household budget, not just the owner', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      const memberId = await createTestUser();
      userIds.push(memberId);
      await createTestHouseholdMember(household.id, memberId, { role: 'member', status: 'active' });

      const row = await upsertHouseholdBudget(memberId, household.id, {
        categoryKey: 'food_drinks',
        amount: AMOUNT,
        period: PERIOD,
        isRecurring: true,
      });

      expect(row.householdId).toBe(household.id);
      expect(row.categoryKey).toBe('food_drinks');
      expect(row.userId).toBeNull();
      expect(row.categoryId).toBeNull();
      expect(row.createdBy).toBe(memberId);
    });

    it('rejects a caller who is not an active member — NotFoundError (never confirms the household exists)', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      const outsiderId = await createTestUser();
      userIds.push(outsiderId);

      await expect(
        upsertHouseholdBudget(outsiderId, household.id, {
          categoryKey: 'food_drinks',
          amount: AMOUNT,
          period: PERIOD,
          isRecurring: true,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects a system_key that is not in the catalog', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      await expect(
        upsertHouseholdBudget(ownerId, household.id, {
          categoryKey: 'not_a_real_key',
          amount: AMOUNT,
          period: PERIOD,
          isRecurring: true,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects an INCOME system_key (e.g. "salary") — a household budget targets spending', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      await expect(
        upsertHouseholdBudget(ownerId, household.id, {
          categoryKey: 'salary',
          amount: AMOUNT,
          period: PERIOD,
          isRecurring: true,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('a custom category can never be targeted — there is no catalog key for one to pass', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      // A real custom category exists, but its system_key is NULL — there is
      // structurally no string a caller could pass here to reach it.
      await createTestCategory(ownerId, { name: 'Kopi Spesialti', type: 'expense' });

      await expect(
        upsertHouseholdBudget(ownerId, household.id, {
          categoryKey: 'kopi_spesialti',
          amount: AMOUNT,
          period: PERIOD,
          isRecurring: true,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('re-submitting the same category_key+period UPDATES the existing row', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      const first = await upsertHouseholdBudget(ownerId, household.id, {
        categoryKey: 'food_drinks',
        amount: AMOUNT,
        period: PERIOD,
        isRecurring: true,
      });
      const second = await upsertHouseholdBudget(ownerId, household.id, {
        categoryKey: 'food_drinks',
        amount: AMOUNT * 3n,
        period: PERIOD,
        isRecurring: true,
      });

      expect(second.id).toBe(first.id);
      expect(second.amount).toBe(AMOUNT * 3n);
    });
  });

  describe('deleteBudget', () => {
    it('the owner can delete their own personal budget', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan', type: 'expense' });
      const row = await upsertPersonalBudget(userId, {
        categoryId,
        amount: AMOUNT,
        period: PERIOD,
        isRecurring: true,
      });

      await deleteBudget(userId, row.id);

      const [remaining] = await dbWrite.select().from(budgets).where(eq(budgets.id, row.id));
      expect(remaining).toBeUndefined();
    });

    it('a different user cannot delete someone else\'s personal budget — NotFoundError', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const otherId = await createTestUser();
      userIds.push(otherId);
      const categoryId = await createTestCategory(ownerId, { name: 'Makan', type: 'expense' });
      const row = await upsertPersonalBudget(ownerId, {
        categoryId,
        amount: AMOUNT,
        period: PERIOD,
        isRecurring: true,
      });

      await expect(deleteBudget(otherId, row.id)).rejects.toThrow(NotFoundError);
      const [stillThere] = await dbWrite.select().from(budgets).where(eq(budgets.id, row.id));
      expect(stillThere).toBeDefined();
    });

    it('any active household member can delete a household budget, not just its creator', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const memberId = await createTestUser();
      userIds.push(memberId);
      await createTestHouseholdMember(household.id, memberId, { role: 'member', status: 'active' });

      const row = await upsertHouseholdBudget(ownerId, household.id, {
        categoryKey: 'food_drinks',
        amount: AMOUNT,
        period: PERIOD,
        isRecurring: true,
      });

      await deleteBudget(memberId, row.id);
      const [remaining] = await dbWrite.select().from(budgets).where(eq(budgets.id, row.id));
      expect(remaining).toBeUndefined();
    });

    it('a non-member cannot delete a household budget — NotFoundError', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const outsiderId = await createTestUser();
      userIds.push(outsiderId);

      const row = await upsertHouseholdBudget(ownerId, household.id, {
        categoryKey: 'food_drinks',
        amount: AMOUNT,
        period: PERIOD,
        isRecurring: true,
      });

      await expect(deleteBudget(outsiderId, row.id)).rejects.toThrow(NotFoundError);
    });

    it('a nonexistent budget id throws NotFoundError', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await expect(deleteBudget(userId, '01234567-89ab-cdef-0123-456789abcdef')).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('materializeRecurringBudgets', () => {
    // A fixed instant that is 2026-10-01 00:00 WIB (2026-09-30T17:00:00Z) —
    // the "1st of the month" instant this whole describe block rolls
    // forward from.
    const FIRST_OF_OCT_WIB = new Date('2026-09-30T17:00:00.000Z');
    const NOT_FIRST_OF_MONTH_WIB = new Date('2026-09-15T04:00:00.000Z'); // 2026-09-15 11:00 WIB

    it('does nothing when "now" is not the 1st in the relevant timezone', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan', type: 'expense' });
      await upsertPersonalBudget(userId, {
        categoryId,
        amount: AMOUNT,
        period: '2026-09',
        isRecurring: true,
      });

      const result = await materializeRecurringBudgets(NOT_FIRST_OF_MONTH_WIB);
      expect(result.personalCreated).toBe(0);

      const rows = await dbWrite.select().from(budgets).where(eq(budgets.userId, userId));
      expect(rows).toHaveLength(1); // only the September row — nothing materialized
    });

    it('materializes a new personal period from the prior recurring budget, preserving category/amount', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan', type: 'expense' });
      await upsertPersonalBudget(userId, {
        categoryId,
        amount: AMOUNT,
        period: '2026-09',
        isRecurring: true,
      });

      const result = await materializeRecurringBudgets(FIRST_OF_OCT_WIB);
      expect(result.personalCreated).toBeGreaterThanOrEqual(1);

      const [octRow] = await dbWrite
        .select()
        .from(budgets)
        .where(and(eq(budgets.userId, userId), eq(budgets.periodStart, '2026-10-01')));
      expect(octRow).toBeDefined();
      expect(octRow!.categoryId).toBe(categoryId);
      expect(octRow!.amount).toBe(AMOUNT);
      expect(octRow!.isRecurring).toBe(true);
      expect(octRow!.periodEnd).toBe('2026-10-31');
    });

    it('is idempotent — calling it twice for the same rollover creates exactly one new instance', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan', type: 'expense' });
      await upsertPersonalBudget(userId, {
        categoryId,
        amount: AMOUNT,
        period: '2026-09',
        isRecurring: true,
      });

      await materializeRecurringBudgets(FIRST_OF_OCT_WIB);
      const second = await materializeRecurringBudgets(FIRST_OF_OCT_WIB);
      expect(second.personalCreated).toBe(0); // already there — nothing new the second time

      const rows = await dbWrite
        .select()
        .from(budgets)
        .where(and(eq(budgets.userId, userId), eq(budgets.periodStart, '2026-10-01')));
      expect(rows).toHaveLength(1);
    });

    it('does NOT roll over a budget with is_recurring = false', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan', type: 'expense' });
      await upsertPersonalBudget(userId, {
        categoryId,
        amount: AMOUNT,
        period: '2026-09',
        isRecurring: false,
      });

      await materializeRecurringBudgets(FIRST_OF_OCT_WIB);

      const rows = await dbWrite
        .select()
        .from(budgets)
        .where(and(eq(budgets.userId, userId), eq(budgets.periodStart, '2026-10-01')));
      expect(rows).toHaveLength(0);
    });

    it('materializes a new household period the same way, scoped to the household own timezone', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await upsertHouseholdBudget(ownerId, household.id, {
        categoryKey: 'food_drinks',
        amount: AMOUNT,
        period: '2026-09',
        isRecurring: true,
      });

      const result = await materializeRecurringBudgets(FIRST_OF_OCT_WIB);
      expect(result.householdCreated).toBeGreaterThanOrEqual(1);

      const [octRow] = await dbWrite
        .select()
        .from(budgets)
        .where(and(eq(budgets.householdId, household.id), eq(budgets.periodStart, '2026-10-01')));
      expect(octRow).toBeDefined();
      expect(octRow!.categoryKey).toBe('food_drinks');
      expect(octRow!.amount).toBe(AMOUNT);
    });

    it('only rolls over entities whose OWN local date is the 1st (a household on a different timezone is unaffected by another timezone\'s midnight)', async () => {
      const ownerId = await createTestUser();
      userIds.push(ownerId);
      // WIB is UTC+7; pick a timezone far enough away (UTC-10, Honolulu)
      // that FIRST_OF_OCT_WIB (2026-09-30T17:00:00Z = 2026-09-30 07:00
      // Honolulu) is still September there — this household must NOT roll
      // over on this call.
      const household = await createHousehold(ownerId, { name: 'Keluarga', timezone: 'Pacific/Honolulu' });
      householdIds.push(household.id);
      await upsertHouseholdBudget(ownerId, household.id, {
        categoryKey: 'food_drinks',
        amount: AMOUNT,
        period: '2026-09',
        isRecurring: true,
      });

      await materializeRecurringBudgets(FIRST_OF_OCT_WIB);

      const rows = await dbWrite
        .select()
        .from(budgets)
        .where(and(eq(budgets.householdId, household.id), eq(budgets.periodStart, '2026-10-01')));
      expect(rows).toHaveLength(0);

      // Sanity: users.timezone/households.timezone really do default to
      // Asia/Jakarta for everyone else, so this household is a genuine,
      // deliberate outlier for this test, not an artifact of bad fixture data.
      const [defaultTzUser] = await dbWrite.select({ timezone: users.timezone }).from(users).where(eq(users.id, ownerId));
      expect(defaultTzUser!.timezone).toBe('Asia/Jakarta');
      const [hh] = await dbWrite.select({ timezone: households.timezone }).from(households).where(eq(households.id, household.id));
      expect(hh!.timezone).toBe('Pacific/Honolulu');
    });
  });
});
