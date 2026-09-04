// @vitest-environment node
/**
 * Direct database-level tests for the constraints
 * tasks/14-budgets/spec.md and todo.md call out explicitly:
 *   "CHECK budget_scope_exclusive menolak budget bercakupan ganda — diverifikasi test"
 *   "Unique index mencegah dua budget untuk kategori & periode yang sama — diverifikasi test"
 *
 * These insert straight through `dbWrite`, bypassing
 * src/lib/services/budgets.ts entirely (whose upserts can never PRODUCE a
 * dual-scope or duplicate row by construction) — this file proves the
 * DATABASE itself refuses them, independent of any application code ever
 * calling it correctly. Same rationale and `causeMessage()` unwrapping
 * pattern as src/lib/db/__tests__/categories-constraints.integration.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { dbWrite } from '@/lib/db/write';
import { budgets } from '@/lib/db/schema/budgets';
import { uuidv7 } from 'uuidv7';
import {
  createTestCategory,
  createTestHousehold,
  createTestUser,
  deleteTestHousehold,
  deleteTestUser,
} from './test-helpers';

function causeMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'cause' in err) {
    const cause = (err as { cause: unknown }).cause;
    if (typeof cause === 'object' && cause !== null && 'message' in cause) {
      return String((cause as { message: unknown }).message);
    }
  }
  return err instanceof Error ? err.message : String(err);
}

const PERIOD_START = '2026-09-01';
const PERIOD_END = '2026-09-30';
const AMOUNT = 500_000_00n;

describe('budgets — database-level constraints (bypassing the service)', () => {
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

  it('budget_scope_exclusive CHECK rejects a row with BOTH personal and household scope set', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    const categoryId = await createTestCategory(userId, { name: 'Makanan', type: 'expense' });
    const householdId = await createTestHousehold(userId);
    householdIds.push(householdId);

    let caught: unknown;
    try {
      await dbWrite.insert(budgets).values({
        id: uuidv7(),
        userId,
        householdId,
        categoryId,
        categoryKey: 'food_drinks',
        amount: AMOUNT,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        createdBy: userId,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught, 'dual-scope insert should have thrown').toBeDefined();
    expect(causeMessage(caught)).toMatch(/budget_scope_exclusive/);
  });

  it('budget_scope_exclusive CHECK rejects a row with NEITHER scope set', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    let caught: unknown;
    try {
      await dbWrite.insert(budgets).values({
        id: uuidv7(),
        userId: null,
        householdId: null,
        categoryId: null,
        categoryKey: null,
        amount: AMOUNT,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        createdBy: userId,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught, 'scope-less insert should have thrown').toBeDefined();
    expect(causeMessage(caught)).toMatch(/budget_scope_exclusive/);
  });

  it('budget_scope_exclusive CHECK rejects a "personal" row missing its category_id', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    let caught: unknown;
    try {
      await dbWrite.insert(budgets).values({
        id: uuidv7(),
        userId,
        householdId: null,
        categoryId: null,
        categoryKey: null,
        amount: AMOUNT,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        createdBy: userId,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught, 'personal row without category_id should have thrown').toBeDefined();
    expect(causeMessage(caught)).toMatch(/budget_scope_exclusive/);
  });

  it('budgets_personal_uniq rejects a second budget for the same user+category+period', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    const categoryId = await createTestCategory(userId, { name: 'Makanan', type: 'expense' });

    await dbWrite.insert(budgets).values({
      id: uuidv7(),
      userId,
      categoryId,
      amount: AMOUNT,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      createdBy: userId,
    });

    let caught: unknown;
    try {
      await dbWrite.insert(budgets).values({
        id: uuidv7(),
        userId,
        categoryId,
        amount: AMOUNT * 2n,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        createdBy: userId,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught, 'duplicate personal budget insert should have thrown').toBeDefined();
    expect(causeMessage(caught)).toMatch(/budgets_personal_uniq/);
  });

  it('budgets_household_uniq rejects a second budget for the same household+category_key+period', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    const householdId = await createTestHousehold(userId);
    householdIds.push(householdId);

    await dbWrite.insert(budgets).values({
      id: uuidv7(),
      householdId,
      categoryKey: 'food_drinks',
      amount: AMOUNT,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      createdBy: userId,
    });

    let caught: unknown;
    try {
      await dbWrite.insert(budgets).values({
        id: uuidv7(),
        householdId,
        categoryKey: 'food_drinks',
        amount: AMOUNT * 2n,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        createdBy: userId,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught, 'duplicate household budget insert should have thrown').toBeDefined();
    expect(causeMessage(caught)).toMatch(/budgets_household_uniq/);
  });

  it('budgets_household_uniq allows the SAME category_key in a DIFFERENT period (not a duplicate)', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    const householdId = await createTestHousehold(userId);
    householdIds.push(householdId);

    await dbWrite.insert(budgets).values({
      id: uuidv7(),
      householdId,
      categoryKey: 'food_drinks',
      amount: AMOUNT,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      createdBy: userId,
    });

    // October, not September — a different periodStart, so this must succeed.
    await expect(
      dbWrite.insert(budgets).values({
        id: uuidv7(),
        householdId,
        categoryKey: 'food_drinks',
        amount: AMOUNT,
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        createdBy: userId,
      }),
    ).resolves.not.toThrow();
  });

  it('budget_amount_positive CHECK rejects a zero or negative amount', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    const categoryId = await createTestCategory(userId, { name: 'Makanan', type: 'expense' });

    let caught: unknown;
    try {
      await dbWrite.insert(budgets).values({
        id: uuidv7(),
        userId,
        categoryId,
        amount: 0n,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        createdBy: userId,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught, 'zero-amount insert should have thrown').toBeDefined();
    expect(causeMessage(caught)).toMatch(/budget_amount_positive/);
  });
});
