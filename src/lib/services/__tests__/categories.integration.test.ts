// @vitest-environment node
/**
 * Integration tests for the categories service — tasks/06-categories/spec.md
 * "Kriteria Penerimaan" and todo.md "Test". Runs against the real Neon
 * database (see .env, loaded via vitest.config.ts), same pattern as
 * src/lib/db/__tests__/seed.integration.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { categories } from '@/lib/db/schema/categories';
import { transactions } from '@/lib/db/schema/transactions';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  reorderCategories,
  restoreCategory,
  updateCategory,
} from '../categories';
import {
  createTestCategory,
  createTestUser,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { uuidv7 } from 'uuidv7';

async function selectCategory(id: string) {
  const [row] = await dbWrite.select().from(categories).where(eq(categories.id, id));
  return row;
}

async function createTestTransaction(userId: string, categoryId: string) {
  const id = uuidv7();
  await dbWrite.insert(transactions).values({
    id,
    userId,
    type: 'expense',
    categoryId,
    amount: 10000n,
    transactionDate: new Date(),
    createdBy: userId,
  });
  return id;
}

describe('categories service', () => {
  const userIds: string[] = [];
  const transactionIds: string[] = [];

  afterEach(async () => {
    // Transactions first — categories.userId cascades from users, but
    // transactions.category_id is ON DELETE RESTRICT, and cascade order
    // across two separate FKs from the same `users` row isn't guaranteed.
    for (const id of transactionIds.splice(0)) {
      await dbWrite.delete(transactions).where(eq(transactions.id, id));
    }
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  describe('createCategory', () => {
    it('creates a custom category with system_key = NULL', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      const created = await createCategory({
        userId,
        name: 'Kopi Spesialti',
        type: 'expense',
        icon: 'coffee',
        color: 'amber',
      });

      expect(created.systemKey).toBeNull();
      const row = await selectCategory(created.id);
      expect(row?.systemKey).toBeNull();
      expect(row?.nameNorm).toBe('kopi spesialti');
    });

    it('ignores a systemKey field smuggled in through the input object', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      // CreateCategoryInput has no `systemKey` field — `as any` simulates a
      // caller that bypasses the type system (e.g. a hand-crafted request).
      const created = await createCategory({
        userId,
        name: 'Kategori Palsu',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
        systemKey: 'food_drinks',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      expect(created.systemKey).toBeNull();
    });

    it('rejects a blank name (after trim)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await expect(
        createCategory({ userId, name: '   ', type: 'expense', icon: 'tag', color: 'slate' }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects a name over 40 characters', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await expect(
        createCategory({
          userId,
          name: 'x'.repeat(41),
          type: 'expense',
          icon: 'tag',
          color: 'slate',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects an icon outside the curated set', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await expect(
        createCategory({
          userId,
          name: 'Test',
          type: 'expense',
          icon: 'not-a-real-icon',
          color: 'slate',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects a color outside the curated palette', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await expect(
        createCategory({ userId, name: 'Test', type: 'expense', icon: 'tag', color: 'magenta' }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects a duplicate name within the same type, case-insensitively', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await createCategory({
        userId,
        name: 'Kopi',
        type: 'expense',
        icon: 'coffee',
        color: 'amber',
      });
      await expect(
        createCategory({ userId, name: 'KOPI', type: 'expense', icon: 'coffee', color: 'amber' }),
      ).rejects.toThrow(ValidationError);
    });

    it('allows the same name across different types', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await createCategory({
        userId,
        name: 'Lainnya',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });
      const income = await createCategory({
        userId,
        name: 'Lainnya',
        type: 'income',
        icon: 'tag',
        color: 'slate',
      });
      expect(income.name).toBe('Lainnya');
    });

    it('accepts a top-level category (built-in or custom) as parent, one level only', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const parent = await createCategory({
        userId,
        name: 'Makanan',
        type: 'expense',
        icon: 'utensils',
        color: 'orange',
      });
      const child = await createCategory({
        userId,
        name: 'Kopi',
        type: 'expense',
        icon: 'coffee',
        color: 'amber',
        parentId: parent.id,
      });
      expect(child.parentId).toBe(parent.id);
    });

    it('rejects nesting under a category that itself has a parent (depth > 1)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const parent = await createCategory({
        userId,
        name: 'Makanan',
        type: 'expense',
        icon: 'utensils',
        color: 'orange',
      });
      const child = await createCategory({
        userId,
        name: 'Kopi',
        type: 'expense',
        icon: 'coffee',
        color: 'amber',
        parentId: parent.id,
      });
      await expect(
        createCategory({
          userId,
          name: 'Kopi Susu',
          type: 'expense',
          icon: 'coffee',
          color: 'amber',
          parentId: child.id,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects a parent of a different type than the child', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const parent = await createCategory({
        userId,
        name: 'Gaji',
        type: 'income',
        icon: 'wallet',
        color: 'emerald',
      });
      await expect(
        createCategory({
          userId,
          name: 'Kopi',
          type: 'expense',
          icon: 'coffee',
          color: 'amber',
          parentId: parent.id,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects a parent owned by another user', async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const alicesCategory = await createTestCategory(alice, {
        name: 'Alice Cat',
        type: 'expense',
      });
      await expect(
        createCategory({
          userId: bob,
          name: 'Bob Sub',
          type: 'expense',
          icon: 'tag',
          color: 'slate',
          parentId: alicesCategory,
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateCategory', () => {
    it('renames a category and updates name_norm accordingly', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const created = await createCategory({
        userId,
        name: 'Foo Bar',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });

      await updateCategory({ userId, categoryId: created.id, name: 'Baz Qux' });

      const row = await selectCategory(created.id);
      expect(row?.name).toBe('Baz Qux');
      expect(row?.nameNorm).toBe('baz qux');
    });

    it('renaming a built-in category does NOT change its system_key', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const systemCategoryId = await createTestCategory(userId, {
        name: 'Makan & Minum',
        type: 'expense',
        systemKey: 'food_drinks',
      });

      await updateCategory({ userId, categoryId: systemCategoryId, name: 'Makan Minum Baru' });

      const row = await selectCategory(systemCategoryId);
      expect(row?.name).toBe('Makan Minum Baru');
      expect(row?.systemKey).toBe('food_drinks');
    });

    it('ignores a systemKey field smuggled in through the input object', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const custom = await createCategory({
        userId,
        name: 'Custom',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });

      await updateCategory({
        userId,
        categoryId: custom.id,
        name: 'Custom Renamed',
        systemKey: 'food_drinks',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const row = await selectCategory(custom.id);
      expect(row?.systemKey).toBeNull();
    });

    it('ignores a type field smuggled in through the input object — type never changes after creation', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const created = await createCategory({
        userId,
        name: 'Test',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });

      await updateCategory({
        userId,
        categoryId: created.id,
        name: 'Test Renamed',
        type: 'income',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const row = await selectCategory(created.id);
      expect(row?.type).toBe('expense');
    });

    it('rejects adding a parent to a built-in category', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const parent = await createCategory({
        userId,
        name: 'Custom Parent',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });
      const systemCategoryId = await createTestCategory(userId, {
        name: 'Tagihan',
        type: 'expense',
        systemKey: 'bills',
      });

      await expect(
        updateCategory({ userId, categoryId: systemCategoryId, parentId: parent.id }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects moving a category that already has children under a new parent', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const parentA = await createCategory({
        userId,
        name: 'Parent A',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });
      const parentB = await createCategory({
        userId,
        name: 'Parent B',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });
      await createCategory({
        userId,
        name: 'Child of A',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
        parentId: parentA.id,
      });

      await expect(
        updateCategory({ userId, categoryId: parentA.id, parentId: parentB.id }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects a duplicate name on rename', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await createCategory({
        userId,
        name: 'Sudah Ada',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });
      const other = await createCategory({
        userId,
        name: 'Belum Ada',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });

      await expect(
        updateCategory({ userId, categoryId: other.id, name: 'sudah ada' }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('archive / restore', () => {
    it('archives and restores both built-in and custom categories', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const custom = await createCategory({
        userId,
        name: 'Custom',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });
      const systemCategoryId = await createTestCategory(userId, {
        name: 'Tagihan',
        type: 'expense',
        systemKey: 'bills',
      });

      await archiveCategory(userId, custom.id);
      await archiveCategory(userId, systemCategoryId);
      expect((await selectCategory(custom.id))?.isArchived).toBe(true);
      expect((await selectCategory(systemCategoryId))?.isArchived).toBe(true);

      await restoreCategory(userId, custom.id);
      expect((await selectCategory(custom.id))?.isArchived).toBe(false);
    });
  });

  describe('deleteCategory', () => {
    it('deletes an unused custom category', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const created = await createCategory({
        userId,
        name: 'Test',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });

      await deleteCategory(userId, created.id);
      expect(await selectCategory(created.id)).toBeUndefined();
    });

    it('refuses to delete a built-in category — archive is the only option', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const systemCategoryId = await createTestCategory(userId, {
        name: 'Tagihan',
        type: 'expense',
        systemKey: 'bills',
      });

      await expect(deleteCategory(userId, systemCategoryId)).rejects.toThrow(ForbiddenError);
      expect(await selectCategory(systemCategoryId)).toBeDefined();
    });

    it('refuses to delete a category used by a transaction, and archiving it still works', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const created = await createCategory({
        userId,
        name: 'Test',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });
      const txId = await createTestTransaction(userId, created.id);
      transactionIds.push(txId);

      await expect(deleteCategory(userId, created.id)).rejects.toThrow(ValidationError);
      expect(await selectCategory(created.id)).toBeDefined();

      // The rejected dialog's fallback — archiving a used category must
      // still succeed.
      await expect(archiveCategory(userId, created.id)).resolves.not.toThrow();
      expect((await selectCategory(created.id))?.isArchived).toBe(true);
    });

    it('refuses to delete a category that has sub-categories', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const parent = await createCategory({
        userId,
        name: 'Parent',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });
      await createCategory({
        userId,
        name: 'Child',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
        parentId: parent.id,
      });

      await expect(deleteCategory(userId, parent.id)).rejects.toThrow(ValidationError);
    });
  });

  describe('reorderCategories', () => {
    it('persists a new sort order', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const a = await createCategory({
        userId,
        name: 'A',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });
      const b = await createCategory({
        userId,
        name: 'B',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });
      const c = await createCategory({
        userId,
        name: 'C',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
      });

      await reorderCategories(userId, [c.id, a.id, b.id]);

      expect((await selectCategory(c.id))?.sortOrder).toBe(0);
      expect((await selectCategory(a.id))?.sortOrder).toBe(1);
      expect((await selectCategory(b.id))?.sortOrder).toBe(2);
    });

    it("rejects a list containing another user's category id, without partially applying it", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceCat = await createTestCategory(alice, { name: 'Alice', type: 'expense' });
      const bobCat1 = await createTestCategory(bob, {
        name: 'Bob 1',
        type: 'expense',
        sortOrder: 0,
      });
      const bobCat2 = await createTestCategory(bob, {
        name: 'Bob 2',
        type: 'expense',
        sortOrder: 1,
      });

      await expect(reorderCategories(bob, [bobCat2, aliceCat, bobCat1])).rejects.toThrow(
        NotFoundError,
      );

      // Bob's own categories are untouched — no partial write.
      expect((await selectCategory(bobCat1))?.sortOrder).toBe(0);
      expect((await selectCategory(bobCat2))?.sortOrder).toBe(1);
    });
  });

  describe('cross-user isolation', () => {
    it("updateCategory on another user's category throws NotFoundError and leaves it unchanged", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceCat = await createTestCategory(alice, { name: 'Alice Cat', type: 'expense' });

      await expect(
        updateCategory({ userId: bob, categoryId: aliceCat, name: 'Hacked by Bob' }),
      ).rejects.toThrow(NotFoundError);
      expect((await selectCategory(aliceCat))?.name).toBe('Alice Cat');
    });

    it("archiveCategory on another user's category throws NotFoundError and leaves it unchanged", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceCat = await createTestCategory(alice, { name: 'Alice Cat', type: 'expense' });

      await expect(archiveCategory(bob, aliceCat)).rejects.toThrow(NotFoundError);
      expect((await selectCategory(aliceCat))?.isArchived).toBe(false);
    });

    it("deleteCategory on another user's category throws NotFoundError and leaves it unchanged", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceCat = await createTestCategory(alice, { name: 'Alice Cat', type: 'expense' });

      await expect(deleteCategory(bob, aliceCat)).rejects.toThrow(NotFoundError);
      expect(await selectCategory(aliceCat)).toBeDefined();
    });
  });
});
