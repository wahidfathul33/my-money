import { and, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '../../src/lib/db/write';
import { categories } from '../../src/lib/db/schema/categories';
import { wallets } from '../../src/lib/db/schema/wallets';
import { transactions } from '../../src/lib/db/schema/transactions';
import { createTransaction } from '../../src/lib/services/transactions';
import { postEntries } from '../../src/lib/finance/ledger';

/**
 * DB-seeding helpers for e2e/transactions-history.spec.ts — same rationale
 * as e2e/helpers/auth-session.ts: seeding 30+ transactions through the real
 * UI (one Add Transaction sheet flow at a time) would make the infinite-
 * scroll spec take minutes and be needlessly flaky. These call the same
 * `createTransaction` service the app itself uses, so the DATA these
 * produce is exactly what a real user's UI-driven transaction looks like —
 * only the "how it got created" step is skipped.
 */

/** `seedSessionUser`/`seedNewUser` (e2e/fixtures/authenticated.ts) already create a starter "Tunai" wallet and the 16 canonical categories — this just looks them up. */
export async function getDefaultWalletAndCategory(
  userId: string,
): Promise<{ walletId: string; categoryId: string }> {
  const [wallet] = await dbWrite.select({ id: wallets.id }).from(wallets).where(eq(wallets.userId, userId)).limit(1);
  const [category] = await dbWrite
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.type, 'expense')))
    .limit(1);
  if (!wallet || !category) {
    throw new Error('getDefaultWalletAndCategory: seedNewUser did not create the expected wallet/category');
  }
  return { walletId: wallet.id, categoryId: category.id };
}

export interface SeedTransactionsOptions {
  /** Newest transaction's date; each subsequent one is 1 minute older. */
  newestDate?: Date;
  note?: string;
}

/** Seeds `count` expense transactions, newest-first, 1 minute apart — enough to exceed the batch-30 page size for the infinite-scroll spec. */
export async function seedExpenseTransactions(
  userId: string,
  walletId: string,
  categoryId: string,
  count: number,
  options: SeedTransactionsOptions = {},
): Promise<void> {
  const newestDate = options.newestDate ?? new Date();
  for (let i = 0; i < count; i++) {
    const transactionDate = new Date(newestDate.getTime() - i * 60_000);
    await createTransaction(userId, {
      type: 'expense',
      amount: BigInt(10_000 + i) * 100n,
      categoryId,
      walletId,
      transactionDate,
      note: options.note ? `${options.note} ${i}` : null,
      idempotencyKey: crypto.randomUUID(),
    });
  }
}

/** Self-transfer fixture — `createTransaction` refuses `type: 'transfer'` by design (src/lib/services/transactions.ts), so this writes the two-ledger-entry shape directly, matching task 08's eventual output. */
export async function seedSelfTransfer(
  userId: string,
  fromWalletId: string,
  toWalletId: string,
  amount: bigint,
  transactionDate: Date,
  note: string | null = null,
): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const id = uuidv7();
    await tx.insert(transactions).values({
      id,
      userId,
      type: 'transfer',
      categoryId: null,
      amount,
      transactionDate,
      note,
      createdBy: userId,
    });
    await postEntries(tx, [
      { userId, walletId: fromWalletId, amount: -amount, source: 'transaction', entryDate: transactionDate, transactionId: id },
      { userId, walletId: toWalletId, amount, source: 'transaction', entryDate: transactionDate, transactionId: id },
    ]);
  });
}
