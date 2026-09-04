// @vitest-environment node
/**
 * Integration tests for the transfers read queries — real Neon database
 * (see .env, loaded via vitest.config.ts). Builds data through the service
 * layer (src/lib/services/transfers.ts) the same way the app would, then
 * asserts on `dbRead`-backed queries (../queries.ts).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createSelfTransfer, voidTransfer } from '@/lib/services/transfers';
import { createTestUser, createTestWallet, deleteTestUser } from '@/lib/db/__tests__/test-helpers';
import { getTransferDetail, listRecentTransfers } from '../queries';

describe('transfers queries', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  describe('listRecentTransfers', () => {
    it('returns fromWallet/toWallet resolved from the two ledger entries, newest first', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });

      await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 500_000_00n,
        transactionDate: new Date('2026-01-01T00:00:00Z'),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await createSelfTransfer(userId, {
        fromWalletId: gopay,
        toWalletId: bca,
        amount: 100_000_00n,
        transactionDate: new Date('2026-01-05T00:00:00Z'),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      const list = await listRecentTransfers(userId);
      expect(list).toHaveLength(2);

      // Newest first.
      expect(list[0]?.fromWallet.name).toBe('GoPay');
      expect(list[0]?.toWallet.name).toBe('BCA');
      expect(list[0]?.amount).toBe(100_000_00n);

      expect(list[1]?.fromWallet.name).toBe('BCA');
      expect(list[1]?.toWallet.name).toBe('GoPay');
      expect(list[1]?.amount).toBe(500_000_00n);
    });

    it('excludes a voided transfer', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });

      const transfer = await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 500_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await voidTransfer(userId, transfer.id);

      const list = await listRecentTransfers(userId);
      expect(list).toHaveLength(0);
    });

    it("never returns another user's transfer — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceBca = await createTestWallet(alice, { name: 'Alice BCA' });
      const aliceGopay = await createTestWallet(alice, { name: 'Alice GoPay' });

      await createSelfTransfer(alice, {
        fromWalletId: aliceBca,
        toWalletId: aliceGopay,
        amount: 500_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(await listRecentTransfers(bob)).toHaveLength(0);
    });
  });

  describe('getTransferDetail', () => {
    it('returns the single transfer by id', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });

      const transfer = await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 250_000_00n,
        transactionDate: new Date(),
        note: 'pindah dana',
        idempotencyKey: crypto.randomUUID(),
      });

      const detail = await getTransferDetail(userId, transfer.id);
      expect(detail?.fromWallet.name).toBe('BCA');
      expect(detail?.toWallet.name).toBe('GoPay');
      expect(detail?.amount).toBe(250_000_00n);
      expect(detail?.note).toBe('pindah dana');
    });

    it('returns null for a nonexistent id', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      expect(await getTransferDetail(userId, crypto.randomUUID())).toBeNull();
    });
  });
});
