// @vitest-environment node
/**
 * Integration tests for the wallets read queries — real Neon database (see
 * .env, loaded via vitest.config.ts). Builds data through the service layer
 * (src/lib/services/wallets.ts) the same way the app would, then asserts on
 * `dbRead`-backed queries (src/features/wallets/queries.ts).
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  adjustWalletBalance,
  archiveWallet,
  createWallet,
} from '@/lib/services/wallets';
import { createTestUser, deleteTestUser } from '@/lib/db/__tests__/test-helpers';
import {
  getWallet,
  listActiveWallets,
  listWallets,
  walletHasLedgerEntries,
} from '../queries';

describe('wallets queries', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  describe('listWallets', () => {
    it('groups active wallets per type, labels credit cards "Liabilitas", and totals each group', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await createWallet(userId, { name: 'Tunai', type: 'cash', openingBalance: 50_000_00n });
      await createWallet(userId, { name: 'BCA', type: 'bank', openingBalance: 500_000_00n });
      await createWallet(userId, { name: 'BRI', type: 'bank', openingBalance: 200_000_00n });
      await createWallet(userId, { name: 'Visa', type: 'credit_card', openingBalance: -100_000_00n });

      const { groups } = await listWallets(userId);

      const bankGroup = groups.find((g) => g.type === 'bank');
      expect(bankGroup?.wallets).toHaveLength(2);
      expect(bankGroup?.total).toBe(700_000_00n);

      const ccGroup = groups.find((g) => g.type === 'credit_card');
      expect(ccGroup?.label).toBe('Liabilitas');
      expect(ccGroup?.total).toBe(-100_000_00n);
    });

    it('excludes archived wallets from groups and totals, but keeps them in `archived`', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      const active = await createWallet(userId, { name: 'BCA', type: 'bank', openingBalance: 100_000_00n });
      const archived = await createWallet(userId, {
        name: 'Rekening Lama',
        type: 'bank',
        openingBalance: 300_000_00n,
      });
      await archiveWallet(userId, archived);

      const { groups, archived: archivedList } = await listWallets(userId);

      const bankGroup = groups.find((g) => g.type === 'bank');
      expect(bankGroup?.wallets.map((w) => w.id)).toEqual([active]);
      expect(bankGroup?.total).toBe(100_000_00n); // Archived wallet's balance excluded.
      expect(archivedList.map((w) => w.id)).toEqual([archived]);
    });

    it('totalCash excludes credit cards — docs/03 §6.1 "Total Kas tidak menyertakan kartu kredit"', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await createWallet(userId, { name: 'Tunai', type: 'cash', openingBalance: 100_000_00n });
      await createWallet(userId, { name: 'BCA', type: 'bank', openingBalance: 200_000_00n });
      await createWallet(userId, {
        name: 'Visa',
        type: 'credit_card',
        openingBalance: -900_000_00n,
      });

      const { totalCash, totalCreditCardLiability } = await listWallets(userId);

      expect(totalCash).toBe(300_000_00n); // 100k + 200k, credit card excluded entirely.
      expect(totalCreditCardLiability).toBe(900_000_00n); // ABS(balance).
    });

    it("a read never returns another user's wallets — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      await createWallet(alice, { name: "Alice's BCA", type: 'bank', openingBalance: 100_000_00n });
      await createWallet(bob, { name: "Bob's Tunai", type: 'cash', openingBalance: 0n });

      const { groups } = await listWallets(bob);
      const allWallets = groups.flatMap((g) => g.wallets);

      expect(allWallets.every((w) => w.name !== "Alice's BCA")).toBe(true);
    });
  });

  describe('getWallet', () => {
    it('returns the wallet with its recent non-void entries, most recent first', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createWallet(userId, {
        name: 'BCA',
        type: 'bank',
        openingBalance: 100_000_00n,
      });
      await adjustWalletBalance(userId, walletId, 150_000_00n);

      const detail = await getWallet(userId, walletId);

      expect(detail?.balance).toBe(150_000_00n);
      expect(detail?.recentEntries).toHaveLength(2);
      expect(detail?.recentEntries[0]?.source).toBe('adjustment'); // Most recent first.
    });

    it("returns null for another user's wallet id — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceWallet = await createWallet(alice, {
        name: 'Alice BCA',
        type: 'bank',
        openingBalance: 0n,
      });

      const detail = await getWallet(bob, aliceWallet);
      expect(detail).toBeNull();
    });
  });

  describe('walletHasLedgerEntries', () => {
    it('is false for a freshly created wallet with a zero opening balance', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createWallet(userId, { name: 'Tunai', type: 'cash', openingBalance: 0n });

      expect(await walletHasLedgerEntries(userId, walletId)).toBe(false);
    });

    it('is true once an opening_balance entry exists', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createWallet(userId, {
        name: 'Tunai',
        type: 'cash',
        openingBalance: 10_000_00n,
      });

      expect(await walletHasLedgerEntries(userId, walletId)).toBe(true);
    });
  });

  describe('listActiveWallets', () => {
    it('excludes archived wallets — the shape a wallet picker needs', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const active = await createWallet(userId, { name: 'Aktif', type: 'cash', openingBalance: 0n });
      const archived = await createWallet(userId, { name: 'Arsip', type: 'cash', openingBalance: 0n });
      await archiveWallet(userId, archived);

      const rows = await listActiveWallets(userId);

      expect(rows.map((w) => w.id)).toEqual([active]);
    });
  });
});
