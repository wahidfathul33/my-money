// @vitest-environment node
/**
 * Direct database-level tests for the two constraints
 * tasks/06-categories/todo.md calls out explicitly:
 *   "Integration: trigger menolak kedalaman 2"
 *   "Integration: CHECK categories_system_no_parent menolak kategori
 *    bawaan ber-parent"
 *
 * These insert straight through `dbWrite`, bypassing
 * src/lib/services/categories.ts entirely — its `resolveParent` pre-checks
 * already reject both cases before a query is even sent (see
 * src/lib/services/__tests__/categories.integration.test.ts), which proves
 * the SERVICE is safe but not that the DATABASE itself would refuse them
 * on its own, independent of any application code ever calling it
 * correctly. This file exists to prove that second, stronger guarantee.
 *
 * `dbWrite`'s underlying driver wraps the real Postgres error in a
 * `DrizzleQueryError` whose OWN `.message` is just "Failed query: <sql>
 * params: <params>" — the actual reason (trigger RAISE EXCEPTION text,
 * CHECK constraint name) lives one level down, on `.cause.message` (see
 * `pgCause()` in src/lib/services/categories.ts, discovered the hard way
 * when a `.rejects.toThrow(/regex/)` against the wrong level silently
 * never matched). `causeMessage()` below unwraps that so assertions here
 * check the real message.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { categories } from '@/lib/db/schema/categories';
import { createTestCategory, createTestUser, deleteTestUser } from './test-helpers';

function causeMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'cause' in err) {
    const cause = (err as { cause: unknown }).cause;
    if (typeof cause === 'object' && cause !== null && 'message' in cause) {
      return String((cause as { message: unknown }).message);
    }
  }
  return err instanceof Error ? err.message : String(err);
}

describe('categories — database-level constraints (bypassing the service)', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  it('enforce_category_depth() trigger rejects nesting a category under one that already has a parent', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    const topLevelId = await createTestCategory(userId, { name: 'Makanan', type: 'expense' });
    const oneLevelDeepId = await createTestCategory(userId, {
      name: 'Kopi',
      type: 'expense',
      parentId: topLevelId,
    });

    // Depth 2: parenting a new row under `oneLevelDeepId`, which itself has
    // a parent. The trigger (docs/04-database-schema.md §6) must reject
    // this at INSERT time, with no service layer involved.
    let caught: unknown;
    try {
      await dbWrite.insert(categories).values({
        id: uuidv7(),
        userId,
        name: 'Kopi Susu',
        type: 'expense',
        parentId: oneLevelDeepId,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught, 'insert at depth 2 should have thrown').toBeDefined();
    expect(causeMessage(caught)).toMatch(/satu tingkat kedalaman/);
  });

  it('enforce_category_depth() trigger also rejects it on UPDATE, not just INSERT', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    const topLevelId = await createTestCategory(userId, { name: 'Makanan', type: 'expense' });
    const oneLevelDeepId = await createTestCategory(userId, {
      name: 'Kopi',
      type: 'expense',
      parentId: topLevelId,
    });
    const anotherTopLevelId = await createTestCategory(userId, {
      name: 'Belanja',
      type: 'expense',
    });

    let caught: unknown;
    try {
      await dbWrite
        .update(categories)
        .set({ parentId: oneLevelDeepId })
        .where(eq(categories.id, anotherTopLevelId));
    } catch (err) {
      caught = err;
    }
    expect(caught, 'update to depth 2 should have thrown').toBeDefined();
    expect(causeMessage(caught)).toMatch(/satu tingkat kedalaman/);
  });

  it('categories_system_no_parent CHECK rejects a built-in category (system_key set) with a parent', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    const topLevelId = await createTestCategory(userId, { name: 'Makanan', type: 'expense' });

    let caught: unknown;
    try {
      await dbWrite.insert(categories).values({
        id: uuidv7(),
        userId,
        name: 'Fake System Child',
        type: 'expense',
        systemKey: 'food_drinks_fake_for_test',
        parentId: topLevelId,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught, 'insert of a system-keyed row with a parent should have thrown').toBeDefined();
    expect(causeMessage(caught)).toMatch(/categories_system_no_parent/);
  });
});
