// @vitest-environment node
/**
 * Integration test for the reconciliation queries — docs/05-financial-integrity.md
 * §5. Builds healthy data through the same path the app would (postEntries,
 * linked member-transfer transactions) and asserts every invariant query
 * returns zero rows. Runs against the real Neon database (.env).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { users } from '@/lib/db/schema/users';
import { wallets } from '@/lib/db/schema/wallets';
import { ledgerEntries, transactions } from '@/lib/db/schema/transactions';
import { postEntries } from '@/lib/finance/ledger';
import { createTransaction } from '@/lib/services/transactions';
import { createTestCategory, createTestUser, createTestWallet, deleteTestUser } from './test-helpers';
import { runReconciliation } from '../reconcile';

/**
 * I6: every non-void transaction has at least one non-void ledger entry.
 * There's no FK forcing this (`ledger_entries.transaction_id` is nullable,
 * and nothing points the other way from `transactions`), so — like I1/I11/I12
 * above — this can only be caught by a periodic query, never a CHECK
 * constraint. Inlined here rather than added to src/lib/db/reconcile.ts,
 * since this task's own scope is test coverage, not new production
 * reconciliation surface.
 */
async function orphanNonVoidTransactionIds(): Promise<string[]> {
  const rows = await dbWrite.execute<{ id: string }>(sql`
    SELECT t.id
    FROM transactions t
    LEFT JOIN ledger_entries le
           ON le.transaction_id = t.id AND le.voided_at IS NULL
    WHERE t.voided_at IS NULL
    GROUP BY t.id
    HAVING COUNT(le.id) = 0
  `);
  return rows.rows.map((r) => r.id);
}

describe('runReconciliation', () => {
  const simpleUserIds: string[] = [];

  afterEach(async () => {
    for (const id of simpleUserIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  it('reports no drift for a simple, healthy income transaction', async () => {
    const userId = await createTestUser();
    simpleUserIds.push(userId);
    const walletId = await createTestWallet(userId);

    await dbWrite.transaction(async (tx) => {
      await postEntries(tx, [
        { userId, walletId, amount: 500000n, source: 'adjustment', entryDate: new Date() },
      ]);
    });

    const report = await runReconciliation();

    expect(report.walletBalanceDrift.filter((d) => d.walletId === walletId)).toHaveLength(0);
    expect(report.ledgerOwnerMismatches).toHaveLength(0);
  });

  it('has zero global findings when the only data present is a healthy fixture', async () => {
    const userId = await createTestUser();
    simpleUserIds.push(userId);
    const walletId = await createTestWallet(userId);

    await dbWrite.transaction(async (tx) => {
      await postEntries(tx, [
        { userId, walletId, amount: 250000n, source: 'adjustment', entryDate: new Date() },
        { userId, walletId, amount: -50000n, source: 'adjustment', entryDate: new Date() },
      ]);
    });

    const report = await runReconciliation();
    expect(report.hasFindings).toBe(false);
  });

  describe('member transfer fixture', () => {
    it('reports no drift for a well-formed, linked member transfer', async () => {
      const senderId = await createTestUser();
      const receiverId = await createTestUser();
      const senderWallet = await createTestWallet(senderId);
      const receiverWallet = await createTestWallet(receiverId);
      const senderTxId = uuidv7();
      const receiverTxId = uuidv7();

      try {
        await dbWrite.transaction(async (tx) => {
          await tx.insert(transactions).values([
            {
              id: senderTxId,
              userId: senderId,
              type: 'transfer',
              amount: 100000n,
              transactionDate: new Date(),
              counterpartyUserId: receiverId,
              linkedTransactionId: receiverTxId,
              createdBy: senderId,
            },
            {
              id: receiverTxId,
              userId: receiverId,
              type: 'transfer',
              amount: 100000n,
              transactionDate: new Date(),
              counterpartyUserId: senderId,
              linkedTransactionId: senderTxId,
              createdBy: senderId,
            },
          ]);

          await postEntries(tx, [
            {
              userId: senderId,
              walletId: senderWallet,
              amount: -100000n,
              source: 'transaction',
              entryDate: new Date(),
              transactionId: senderTxId,
            },
            {
              userId: receiverId,
              walletId: receiverWallet,
              amount: 100000n,
              source: 'transaction',
              entryDate: new Date(),
              transactionId: receiverTxId,
            },
          ]);
        });

        const report = await runReconciliation();

        expect(
          report.walletBalanceDrift.filter((d) => [senderWallet, receiverWallet].includes(d.walletId)),
        ).toHaveLength(0);
        expect(report.ledgerOwnerMismatches).toHaveLength(0);
        expect(
          report.unbalancedMemberTransfers.filter((t) => t.transactionId === senderTxId),
        ).toHaveLength(0);
        expect(
          report.invalidCreatedByRows.filter((id) => [senderTxId, receiverTxId].includes(id)),
        ).toHaveLength(0);
        expect(
          report.oneWayTransferLinks.filter((id) => [senderTxId, receiverTxId].includes(id)),
        ).toHaveLength(0);
      } finally {
        // Cleanup order matters: ledger_entries.transaction_id and
        // transactions.created_by are both ON DELETE RESTRICT (see
        // src/lib/db/schema/transactions.ts), so ledger entries go first,
        // then the transaction rows, then wallets/users.
        await dbWrite
          .delete(ledgerEntries)
          .where(inArray(ledgerEntries.userId, [senderId, receiverId]));
        await dbWrite.delete(transactions).where(inArray(transactions.id, [senderTxId, receiverTxId]));
        await dbWrite.delete(wallets).where(inArray(wallets.userId, [senderId, receiverId]));
        await dbWrite.delete(users).where(inArray(users.id, [senderId, receiverId]));
      }
    });
  });

  describe('I6 — every non-void transaction has at least one non-void ledger entry', () => {
    it('a transaction recorded through the real service is never orphaned', async () => {
      const userId = await createTestUser();
      simpleUserIds.push(userId);
      const walletId = await createTestWallet(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });

      const created = await createTransaction(userId, {
        type: 'expense',
        amount: 25_000_00n,
        categoryId,
        walletId,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(await orphanNonVoidTransactionIds()).not.toContain(created.id);
    });

    it('flags a transaction row inserted with no backing ledger entry — proves the query actually catches the violation it exists for', async () => {
      const userId = await createTestUser();
      simpleUserIds.push(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });
      const txId = uuidv7();

      // Deliberately simulates the bug I6 exists to catch: a transaction row
      // written without ever calling postEntries in the same DB transaction.
      // There's no FK to stop this — that's exactly why I6 is a query
      // invariant, not a CHECK constraint (see docs/05-financial-integrity.md §5).
      await dbWrite.insert(transactions).values({
        id: txId,
        userId,
        type: 'expense',
        categoryId,
        amount: 10_000_00n,
        transactionDate: new Date(),
        createdBy: userId,
      });

      try {
        expect(await orphanNonVoidTransactionIds()).toContain(txId);
      } finally {
        await dbWrite.delete(transactions).where(eq(transactions.id, txId));
      }
    });
  });
});
