// @vitest-environment node
/**
 * Integration test for `getRecentTransactions`'s transfer merge — real Neon
 * database (see .env, loaded via vitest.config.ts). tasks/08-transfers-self
 * added this: a self-transfer (src/lib/services/transfers.ts) doesn't fit
 * the income/expense LEFT JOIN this query is built on, so it's fetched
 * separately (src/features/transfers/queries.ts `listRecentTransfers`) and
 * merged by date — this test proves that merge is correct, not just that
 * income/expense still works (already covered by
 * src/lib/services/__tests__/transactions.integration.test.ts).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createTransaction } from '@/lib/services/transactions';
import { createSelfTransfer } from '@/lib/services/transfers';
import { createTestCategory, createTestUser, createTestWallet, deleteTestUser } from '@/lib/db/__tests__/test-helpers';
import { getRecentTransactions } from '../queries';

describe('getRecentTransactions — transfer merge', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  it('interleaves transfers with income/expense, newest first, with no category/single wallet on the transfer item', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    const bca = await createTestWallet(userId, { name: 'BCA' });
    const gopay = await createTestWallet(userId, { name: 'GoPay' });
    const category = await createTestCategory(userId, { type: 'expense' });

    await createTransaction(userId, {
      type: 'expense',
      amount: 20_000_00n,
      categoryId: category,
      walletId: bca,
      transactionDate: new Date('2026-01-01T00:00:00Z'),
      note: null,
      idempotencyKey: crypto.randomUUID(),
    });
    await createSelfTransfer(userId, {
      fromWalletId: bca,
      toWalletId: gopay,
      amount: 100_000_00n,
      transactionDate: new Date('2026-01-02T00:00:00Z'),
      note: null,
      idempotencyKey: crypto.randomUUID(),
    });
    await createTransaction(userId, {
      type: 'income',
      amount: 500_000_00n,
      categoryId: await createTestCategory(userId, { type: 'income', name: 'Gaji' }),
      walletId: gopay,
      transactionDate: new Date('2026-01-03T00:00:00Z'),
      note: null,
      idempotencyKey: crypto.randomUUID(),
    });

    const list = await getRecentTransactions(userId);
    expect(list).toHaveLength(3);

    // Newest first, transfer sandwiched by date between the two records.
    expect(list[0]?.type).toBe('income');
    expect(list[1]?.type).toBe('transfer');
    expect(list[2]?.type).toBe('expense');

    const transferItem = list[1]!;
    expect(transferItem.category).toBeNull();
    expect(transferItem.wallet).toBeNull();
    expect(transferItem.transfer?.fromWallet.name).toBe('BCA');
    expect(transferItem.transfer?.toWallet.name).toBe('GoPay');
    expect(transferItem.amount).toBe(100_000_00n);
  });
});
