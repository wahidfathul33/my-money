// @vitest-environment node
/**
 * Integration tests for `seedCategories` itself — tasks/06-categories/todo.md
 * "Integration test: seeder dipanggil dua kali → satu set kategori".
 *
 * Deliberately calls `seedCategories` directly (not through `seedNewUser`,
 * which has its own defensive early-return guard) so this proves the
 * idempotency comes from `ON CONFLICT DO NOTHING` against
 * `categories_user_system_key_uniq` itself, not from a guard clause upstream.
 * Runs against the real Neon database (see .env, loaded via vitest.config.ts).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { categories } from '@/lib/db/schema/categories';
import { CATEGORY_CATALOG, seedCategories } from '../categories';
import { createTestUser, deleteTestUser } from '@/lib/db/__tests__/test-helpers';

describe('seedCategories', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  it('inserts all 16 catalog entries with system_key set', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    await dbWrite.transaction((tx) => seedCategories(tx, userId));

    const rows = await dbWrite.select().from(categories).where(eq(categories.userId, userId));
    expect(rows).toHaveLength(CATEGORY_CATALOG.length);
    expect(rows.every((r) => r.systemKey !== null)).toBe(true);
  });

  it('is idempotent on its own via ON CONFLICT DO NOTHING: calling it twice for the same user does not duplicate or throw', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    await dbWrite.transaction((tx) => seedCategories(tx, userId));
    // Second call, no guard clause upstream this time.
    await expect(dbWrite.transaction((tx) => seedCategories(tx, userId))).resolves.not.toThrow();

    const rows = await dbWrite.select().from(categories).where(eq(categories.userId, userId));
    expect(rows).toHaveLength(CATEGORY_CATALOG.length);
    // Exactly one row per system_key — the whole point of the unique index.
    const keys = rows.map((r) => r.systemKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
