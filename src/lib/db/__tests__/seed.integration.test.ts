// @vitest-environment node
/**
 * Integration tests for seedNewUser — tasks/04-authentication/spec.md
 * acceptance:
 *   "Login pertama membuat kategori bawaan + dompet 'Tunai' dalam satu transaction."
 *   "Login kedua TIDAK menduplikasi seed."
 *
 * Runs against the real Neon database (see .env, loaded via vitest.config.ts).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { categories } from '@/lib/db/schema/categories';
import { wallets } from '@/lib/db/schema/wallets';
import { users } from '@/lib/db/schema/users';
import { CANONICAL_CATEGORIES, seedNewUser, STARTER_WALLET_NAME } from '../seed';
import { createTestUser, deleteTestUser } from './test-helpers';

describe('seedNewUser', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  it('seeds all 16 canonical categories (10 expense + 6 income) and a Tunai cash wallet with balance 0, and sets default_wallet_id', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    await dbWrite.transaction(async (tx) => {
      await seedNewUser(tx, userId);
    });

    const seededCategories = await dbWrite
      .select()
      .from(categories)
      .where(eq(categories.userId, userId));
    expect(seededCategories).toHaveLength(CANONICAL_CATEGORIES.length);
    expect(seededCategories.filter((c) => c.type === 'expense')).toHaveLength(10);
    expect(seededCategories.filter((c) => c.type === 'income')).toHaveLength(6);
    expect(seededCategories.every((c) => c.systemKey !== null)).toBe(true);

    for (const canonical of CANONICAL_CATEGORIES) {
      const match = seededCategories.find((row) => row.systemKey === canonical.systemKey);
      expect(match, `missing category for system_key ${canonical.systemKey}`).toBeDefined();
      expect(match?.name).toBe(canonical.name);
      expect(match?.type).toBe(canonical.type);
    }

    const seededWallets = await dbWrite.select().from(wallets).where(eq(wallets.userId, userId));
    expect(seededWallets).toHaveLength(1);
    expect(seededWallets[0]?.name).toBe(STARTER_WALLET_NAME);
    expect(seededWallets[0]?.type).toBe('cash');
    expect(seededWallets[0]?.balance).toBe(0n);

    const [user] = await dbWrite.select().from(users).where(eq(users.id, userId));
    expect(user?.defaultWalletId).toBe(seededWallets[0]?.id);
  });

  it('is idempotent: a second call does not duplicate categories or the starter wallet', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    await dbWrite.transaction(async (tx) => {
      await seedNewUser(tx, userId);
    });
    const [walletsAfterFirst] = await dbWrite
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId));

    // Simulates the `createUser` event firing twice for the same user —
    // defensive: in real usage Auth.js only fires it once per new adapter
    // user, but the acceptance criterion requires this to hold regardless.
    await dbWrite.transaction(async (tx) => {
      await seedNewUser(tx, userId);
    });

    const seededCategories = await dbWrite
      .select()
      .from(categories)
      .where(eq(categories.userId, userId));
    expect(seededCategories).toHaveLength(CANONICAL_CATEGORIES.length);

    const seededWallets = await dbWrite.select().from(wallets).where(eq(wallets.userId, userId));
    expect(seededWallets).toHaveLength(1);
    // Same wallet, not a second one with a different id.
    expect(seededWallets[0]?.id).toBe(walletsAfterFirst?.id);
  });
});
