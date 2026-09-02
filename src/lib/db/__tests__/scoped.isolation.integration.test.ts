// @vitest-environment node
/**
 * Cross-user isolation — THE TEMPLATE.
 *
 * tasks/04-authentication/spec.md: "Test isolasi yang ditulis di task ini
 * menjadi template untuk seluruh task berikutnya. Setiap modul baru wajib
 * punya padanannya." Every later module (transactions, assets, debts,
 * savings, budgets, ...) needs its own copy of this shape: prove a second
 * user's `ownedBy`-scoped read excludes the first user's rows, AND that a
 * write scoped the same way cannot touch them either — not because
 * something explicitly forbids it, but because the WHERE clause structurally
 * can't match another user's row (docs/12-security-and-auth.md §3 "Lapisan
 * 4").
 *
 * Run against wallets and categories — the two entities this task actually
 * writes real data to (seedNewUser). Runs against the real Neon database,
 * same pattern as src/lib/finance/__tests__/ledger.integration.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { wallets } from '@/lib/db/schema/wallets';
import { categories } from '@/lib/db/schema/categories';
import { ownedBy } from '@/lib/db/scoped';
import { createTestCategory, createTestUser, createTestWallet, deleteTestUser } from './test-helpers';

describe('cross-user isolation template — ownedBy()', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  describe('wallets', () => {
    it("a read scoped with ownedBy() never returns another user's wallet", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);

      const aliceWallet = await createTestWallet(alice, { name: "Alice's BCA" });
      await createTestWallet(bob, { name: "Bob's Tunai" });

      const bobsView = await dbWrite.select().from(wallets).where(ownedBy(wallets, bob));

      expect(bobsView.every((w) => w.userId === bob)).toBe(true);
      expect(bobsView.some((w) => w.id === aliceWallet)).toBe(false);
    });

    it("a write scoped with ownedBy() affects 0 rows against another user's wallet id", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);

      const aliceWallet = await createTestWallet(alice, { name: "Alice's BCA" });

      // The exact shape a real service uses (see docs/11-tech-architecture.md
      // §6): scope by id AND ownedBy(table, actorId). Bob supplies Alice's
      // wallet id; the WHERE clause can't match it.
      const result = await dbWrite
        .update(wallets)
        .set({ name: 'Renamed by Bob' })
        .where(and(eq(wallets.id, aliceWallet), ownedBy(wallets, bob)));

      expect(result.rowCount).toBe(0);

      const [stillAlices] = await dbWrite.select().from(wallets).where(eq(wallets.id, aliceWallet));
      expect(stillAlices?.name).toBe("Alice's BCA");
    });
  });

  describe('categories', () => {
    it("a read scoped with ownedBy() never returns another user's category", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);

      const aliceCategory = await createTestCategory(alice, { name: 'Kopi Spesialti' });
      await createTestCategory(bob, { name: 'Bensin' });

      const bobsView = await dbWrite.select().from(categories).where(ownedBy(categories, bob));

      expect(bobsView.every((c) => c.userId === bob)).toBe(true);
      expect(bobsView.some((c) => c.id === aliceCategory)).toBe(false);
    });

    it("a write scoped with ownedBy() affects 0 rows against another user's category id", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);

      const aliceCategory = await createTestCategory(alice, { name: 'Kopi Spesialti' });

      const result = await dbWrite
        .update(categories)
        .set({ name: 'Renamed by Bob' })
        .where(and(eq(categories.id, aliceCategory), ownedBy(categories, bob)));

      expect(result.rowCount).toBe(0);

      const [stillAlices] = await dbWrite.select().from(categories).where(eq(categories.id, aliceCategory));
      expect(stillAlices?.name).toBe('Kopi Spesialti');
    });
  });
});
