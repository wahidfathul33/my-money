// @vitest-environment node
/**
 * Integration tests for postEntries against the real Neon database (see
 * .env, loaded via vitest.config.ts). These prove the two things
 * docs/05-financial-integrity.md §3 requires:
 *   - Multiple entries to the same wallet aggregate into exactly one UPDATE.
 *   - Balance always equals the sum of that wallet's ledger entries.
 *
 * Atomicity/rollback proof lives in ledger.rollback.integration.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { dbWrite } from '@/lib/db/write';
import { wallets } from '@/lib/db/schema/wallets';
import { ledgerEntries } from '@/lib/db/schema/transactions';
import type { TransactionClient } from '@/lib/db';
import { postEntries } from '../ledger';
import { createTestUser, createTestWallet, deleteTestUser } from '@/lib/db/__tests__/test-helpers';

describe('postEntries', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  it('aggregates multiple entries to the same wallet: balance = sum(entries)', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    const walletId = await createTestWallet(userId);

    await dbWrite.transaction(async (tx) => {
      await postEntries(tx, [
        { userId, walletId, amount: 500000n, source: 'adjustment', entryDate: new Date() },
        { userId, walletId, amount: -125000n, source: 'adjustment', entryDate: new Date() },
        { userId, walletId, amount: 30000n, source: 'adjustment', entryDate: new Date() },
      ]);
    });

    const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletId));
    expect(wallet?.balance).toBe(405000n);

    const entries = await dbWrite
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.walletId, walletId));
    expect(entries).toHaveLength(3);
    const sum = entries.reduce((acc, e) => acc + e.amount, 0n);
    expect(sum).toBe(wallet?.balance);
  });

  it('accumulates balance correctly across several separate postEntries calls', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    const walletId = await createTestWallet(userId);

    const amounts = [100000n, -40000n, 250000n, -10000n];
    for (const amount of amounts) {
      await dbWrite.transaction(async (tx) => {
        await postEntries(tx, [
          { userId, walletId, amount, source: 'adjustment', entryDate: new Date() },
        ]);
      });
    }

    const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletId));
    const expected = amounts.reduce((a, b) => a + b, 0n);
    expect(wallet?.balance).toBe(expected);
  });

  it('issues exactly one UPDATE per wallet, even with multiple entries against it', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    const walletId = await createTestWallet(userId);

    const statements: string[] = [];
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED });
    const loggedDb = drizzle({
      client: pool,
      logger: { logQuery: (query) => statements.push(query) },
    });

    try {
      await loggedDb.transaction(async (tx) => {
        await postEntries(tx as unknown as TransactionClient, [
          { userId, walletId, amount: 10000n, source: 'adjustment', entryDate: new Date() },
          { userId, walletId, amount: 20000n, source: 'adjustment', entryDate: new Date() },
        ]);
      });
    } finally {
      await pool.end();
    }

    const updateStatements = statements.filter((s) => /update\s+"wallets"/i.test(s));
    expect(updateStatements).toHaveLength(1);

    const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletId));
    expect(wallet?.balance).toBe(30000n);
  });

  it('issues one UPDATE per wallet when entries span two different wallets', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    const walletA = await createTestWallet(userId, { name: 'Wallet A' });
    const walletB = await createTestWallet(userId, { name: 'Wallet B' });

    const statements: string[] = [];
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED });
    const loggedDb = drizzle({
      client: pool,
      logger: { logQuery: (query) => statements.push(query) },
    });

    try {
      await loggedDb.transaction(async (tx) => {
        // Self-wallet transfer shape: money out of A, into B, one call.
        await postEntries(tx as unknown as TransactionClient, [
          { userId, walletId: walletA, amount: -50000n, source: 'transaction', entryDate: new Date() },
          { userId, walletId: walletB, amount: 50000n, source: 'transaction', entryDate: new Date() },
        ]);
      });
    } finally {
      await pool.end();
    }

    const updateStatements = statements.filter((s) => /update\s+"wallets"/i.test(s));
    expect(updateStatements).toHaveLength(2);

    const [a] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletA));
    const [b] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletB));
    expect(a?.balance).toBe(-50000n);
    expect(b?.balance).toBe(50000n);
  });

  it('rejects an entry whose wallet does not belong to the stated owner', async () => {
    const ownerId = await createTestUser();
    userIds.push(ownerId);
    const otherId = await createTestUser();
    userIds.push(otherId);
    const walletId = await createTestWallet(ownerId);

    await expect(
      dbWrite.transaction(async (tx) => {
        // otherId does not own walletId — postEntries must refuse to touch it.
        await postEntries(tx, [
          { userId: otherId, walletId, amount: 10000n, source: 'adjustment', entryDate: new Date() },
        ]);
      }),
    ).rejects.toThrow();

    const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletId));
    expect(wallet?.balance).toBe(0n);
    const entries = await dbWrite
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.walletId, walletId));
    expect(entries).toHaveLength(0);
  });

  it('supports two entries owned by two different users in one call (member transfer shape)', async () => {
    const senderId = await createTestUser();
    userIds.push(senderId);
    const receiverId = await createTestUser();
    userIds.push(receiverId);
    const senderWallet = await createTestWallet(senderId);
    const receiverWallet = await createTestWallet(receiverId);

    await dbWrite.transaction(async (tx) => {
      await postEntries(tx, [
        {
          userId: senderId,
          walletId: senderWallet,
          amount: -100000n,
          source: 'transaction',
          entryDate: new Date(),
        },
        {
          userId: receiverId,
          walletId: receiverWallet,
          amount: 100000n,
          source: 'transaction',
          entryDate: new Date(),
        },
      ]);
    });

    const [sender] = await dbWrite.select().from(wallets).where(eq(wallets.id, senderWallet));
    const [receiver] = await dbWrite.select().from(wallets).where(eq(wallets.id, receiverWallet));
    expect(sender?.balance).toBe(-100000n);
    expect(receiver?.balance).toBe(100000n);
  });
});
