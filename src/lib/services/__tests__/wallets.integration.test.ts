// @vitest-environment node
/**
 * Integration tests for the wallets service — real Neon database (see
 * .env, loaded via vitest.config.ts). Same pattern as
 * src/lib/services/__tests__/onboarding.integration.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { users } from '@/lib/db/schema/users';
import { wallets } from '@/lib/db/schema/wallets';
import { ledgerEntries } from '@/lib/db/schema/transactions';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { findWalletBalanceDrift } from '@/lib/db/reconcile';
import { createTestUser, deleteTestUser } from '@/lib/db/__tests__/test-helpers';
import {
  adjustWalletBalance,
  archiveWallet,
  createWallet,
  deleteWallet,
  reorderWallets,
  restoreWallet,
  setDefaultWallet,
  updateWallet,
} from '../wallets';

describe('wallets service', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  describe('createWallet', () => {
    it('inserts the wallet with balance 0 and writes no ledger entry for a zero opening balance', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      const walletId = await createWallet(userId, { name: 'BCA', type: 'bank', openingBalance: 0n });

      const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletId));
      expect(wallet?.balance).toBe(0n);

      const entries = await dbWrite
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.walletId, walletId));
      expect(entries).toHaveLength(0);
    });

    it('writes an opening_balance entry and sets balance for a nonzero opening balance — docs/03 §6.3', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      const walletId = await createWallet(userId, {
        name: 'BCA',
        type: 'bank',
        openingBalance: 500_000_00n,
      });

      const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletId));
      expect(wallet?.balance).toBe(500_000_00n);

      const entries = await dbWrite
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.walletId, walletId));
      expect(entries).toHaveLength(1);
      expect(entries[0]?.source).toBe('opening_balance');
      expect(entries[0]?.amount).toBe(500_000_00n);
    });

    it('rejects a credit card with a positive opening balance — liability semantics', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await expect(
        createWallet(userId, { name: 'Visa', type: 'credit_card', openingBalance: 100_000_00n }),
      ).rejects.toThrow(ValidationError);

      const created = await dbWrite.select().from(wallets).where(eq(wallets.userId, userId));
      expect(created).toHaveLength(0); // Transaction rolled back — no partial wallet row left behind.
    });

    it('accepts a credit card with a negative (or zero) opening balance', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      const walletId = await createWallet(userId, {
        name: 'Visa',
        type: 'credit_card',
        openingBalance: -200_000_00n,
      });

      const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletId));
      expect(wallet?.balance).toBe(-200_000_00n);
    });
  });

  // I9: a credit_card wallet is never positive-balanced.
  describe('the DB CHECK itself (wallets_cc_non_positive)', () => {
    it('rejects a raw UPDATE that pushes a credit card balance positive, independent of application code', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createWallet(userId, {
        name: 'Visa',
        type: 'credit_card',
        openingBalance: 0n,
      });

      await expect(
        dbWrite.update(wallets).set({ balance: 100n }).where(eq(wallets.id, walletId)),
      ).rejects.toThrow();
    });
  });

  describe('updateWallet', () => {
    it('renames the wallet and updates icon/color, leaving type and balance untouched', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createWallet(userId, { name: 'BCA', type: 'bank', openingBalance: 0n });

      await updateWallet(userId, walletId, { name: 'BCA Utama', icon: 'landmark', color: 'indigo' });

      const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletId));
      expect(wallet?.name).toBe('BCA Utama');
      expect(wallet?.icon).toBe('landmark');
      expect(wallet?.color).toBe('indigo');
      expect(wallet?.type).toBe('bank');
    });

    it("throws NotFoundError and changes nothing when the wallet belongs to another user — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceWallet = await createWallet(alice, { name: 'Alice BCA', type: 'bank', openingBalance: 0n });

      await expect(
        updateWallet(bob, aliceWallet, { name: 'Renamed by Bob', icon: 'wallet', color: 'rose' }),
      ).rejects.toThrow(NotFoundError);

      const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, aliceWallet));
      expect(wallet?.name).toBe('Alice BCA');
    });
  });

  describe('archiveWallet / restoreWallet', () => {
    it('archives the wallet and clears users.default_wallet_id when it was the default', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createWallet(userId, { name: 'BCA', type: 'bank', openingBalance: 0n });
      await setDefaultWallet(userId, walletId);

      await archiveWallet(userId, walletId);

      const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletId));
      expect(wallet?.isArchived).toBe(true);
      const [user] = await dbWrite.select().from(users).where(eq(users.id, userId));
      expect(user?.defaultWalletId).toBeNull();
    });

    it('restore flips is_archived back to false', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createWallet(userId, { name: 'BCA', type: 'bank', openingBalance: 0n });
      await archiveWallet(userId, walletId);

      await restoreWallet(userId, walletId);

      const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletId));
      expect(wallet?.isArchived).toBe(false);
    });

    it("cannot archive another user's wallet — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceWallet = await createWallet(alice, { name: 'Alice BCA', type: 'bank', openingBalance: 0n });

      await expect(archiveWallet(bob, aliceWallet)).rejects.toThrow(NotFoundError);

      const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, aliceWallet));
      expect(wallet?.isArchived).toBe(false);
    });
  });

  describe('deleteWallet', () => {
    it('hard-deletes a wallet with zero ledger entries', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createWallet(userId, { name: 'BCA', type: 'bank', openingBalance: 0n });

      await deleteWallet(userId, walletId);

      const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletId));
      expect(wallet).toBeUndefined();
    });

    it('refuses to delete a wallet that has a ledger entry — docs/03 §6.3', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createWallet(userId, {
        name: 'BCA',
        type: 'bank',
        openingBalance: 100_000_00n,
      });

      await expect(deleteWallet(userId, walletId)).rejects.toThrow(ValidationError);

      const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletId));
      expect(wallet).toBeDefined(); // Still there — the wallet must survive the rejected delete.
    });

    it("cannot delete another user's wallet — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceWallet = await createWallet(alice, { name: 'Alice BCA', type: 'bank', openingBalance: 0n });

      await expect(deleteWallet(bob, aliceWallet)).rejects.toThrow(NotFoundError);

      const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, aliceWallet));
      expect(wallet).toBeDefined();
    });
  });

  describe('adjustWalletBalance', () => {
    it('writes an adjustment entry for exactly the delta, never overwriting balance directly', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createWallet(userId, {
        name: 'BCA',
        type: 'bank',
        openingBalance: 100_000_00n,
      });

      await adjustWalletBalance(userId, walletId, 150_000_00n);

      const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletId));
      expect(wallet?.balance).toBe(150_000_00n);

      const entries = await dbWrite
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.walletId, walletId));
      expect(entries).toHaveLength(2); // opening_balance + adjustment
      const adjustment = entries.find((e) => e.source === 'adjustment');
      expect(adjustment?.amount).toBe(50_000_00n); // 150k - 100k delta, not the absolute 150k.
    });

    it('writes nothing when the actual balance equals the cached balance', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createWallet(userId, {
        name: 'BCA',
        type: 'bank',
        openingBalance: 100_000_00n,
      });

      await adjustWalletBalance(userId, walletId, 100_000_00n);

      const entries = await dbWrite
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.walletId, walletId));
      expect(entries).toHaveLength(1); // Only the original opening_balance — no zero-amount entry.
    });

    it('rejects an actual balance that would push a credit card positive', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createWallet(userId, {
        name: 'Visa',
        type: 'credit_card',
        openingBalance: -50_000_00n,
      });

      await expect(adjustWalletBalance(userId, walletId, 10_000_00n)).rejects.toThrow(ValidationError);

      const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletId));
      expect(wallet?.balance).toBe(-50_000_00n); // Unchanged.
    });

    it("cannot adjust another user's wallet — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceWallet = await createWallet(alice, {
        name: 'Alice BCA',
        type: 'bank',
        openingBalance: 100_000_00n,
      });

      await expect(adjustWalletBalance(bob, aliceWallet, 999_000_00n)).rejects.toThrow(NotFoundError);

      const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, aliceWallet));
      expect(wallet?.balance).toBe(100_000_00n);
    });
  });

  describe('reorderWallets', () => {
    it('persists sort_order matching the given order', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const w1 = await createWallet(userId, { name: 'Satu', type: 'cash', openingBalance: 0n });
      const w2 = await createWallet(userId, { name: 'Dua', type: 'cash', openingBalance: 0n });
      const w3 = await createWallet(userId, { name: 'Tiga', type: 'cash', openingBalance: 0n });

      await reorderWallets(userId, [w3, w1, w2]);

      const rows = await dbWrite
        .select({ id: wallets.id, sortOrder: wallets.sortOrder })
        .from(wallets)
        .where(eq(wallets.userId, userId));
      const byId = new Map(rows.map((r) => [r.id, r.sortOrder]));
      expect(byId.get(w3)).toBe(0);
      expect(byId.get(w1)).toBe(1);
      expect(byId.get(w2)).toBe(2);
    });

    it("rejects (and applies nothing) when one id doesn't belong to the caller — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceWallet = await createWallet(alice, { name: 'Alice', type: 'cash', openingBalance: 0n });
      const bobWallet = await createWallet(bob, { name: 'Bob', type: 'cash', openingBalance: 0n });

      await expect(reorderWallets(bob, [bobWallet, aliceWallet])).rejects.toThrow(NotFoundError);

      const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, aliceWallet));
      expect(wallet?.sortOrder).toBe(0); // Untouched.
    });
  });

  describe('setDefaultWallet', () => {
    it('sets users.default_wallet_id', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createWallet(userId, { name: 'BCA', type: 'bank', openingBalance: 0n });

      await setDefaultWallet(userId, walletId);

      const [user] = await dbWrite.select().from(users).where(eq(users.id, userId));
      expect(user?.defaultWalletId).toBe(walletId);
    });

    it('refuses to set an archived wallet as default', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createWallet(userId, { name: 'BCA', type: 'bank', openingBalance: 0n });
      await archiveWallet(userId, walletId);

      await expect(setDefaultWallet(userId, walletId)).rejects.toThrow(ValidationError);
    });

    it("cannot set another user's wallet as default — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceWallet = await createWallet(alice, { name: 'Alice BCA', type: 'bank', openingBalance: 0n });

      await expect(setDefaultWallet(bob, aliceWallet)).rejects.toThrow(NotFoundError);

      const [bobUser] = await dbWrite.select().from(users).where(eq(users.id, bob));
      expect(bobUser?.defaultWalletId).not.toBe(aliceWallet);
    });
  });

  describe('reconciliation — wallets.balance always equals SUM(ledger_entries.amount)', () => {
    it('shows zero drift after a sequence of create/adjust/archive operations', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      const w1 = await createWallet(userId, { name: 'BCA', type: 'bank', openingBalance: 500_000_00n });
      const w2 = await createWallet(userId, {
        name: 'Visa',
        type: 'credit_card',
        openingBalance: -100_000_00n,
      });
      await adjustWalletBalance(userId, w1, 480_000_00n);
      await adjustWalletBalance(userId, w2, -150_000_00n);
      await archiveWallet(userId, w1);
      await restoreWallet(userId, w1);

      const drift = await findWalletBalanceDrift();
      const ourDrift = drift.filter((d) => d.walletId === w1 || d.walletId === w2);
      expect(ourDrift).toHaveLength(0);
    });
  });
});
