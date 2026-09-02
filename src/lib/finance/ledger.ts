/**
 * The golden rule: every balance change goes through the ledger —
 * docs/05-financial-integrity.md §3.
 *
 *   wallets.balance is NEVER updated without writing ledger_entries inside
 *   the SAME DB transaction.
 *
 * `postEntries` is the ONLY function allowed to touch `wallets.balance`.
 * It must be called inside an already-open `dbWrite.transaction(...)` — it
 * never opens its own transaction, so every caller's multi-table write stays
 * atomic as a whole.
 *
 * This module is pure application logic operating on an injected transaction
 * client; it does not import `@/lib/db/read` or `@/lib/db/write` itself (see
 * docs/11-tech-architecture.md §3 — lib/finance stays free of live I/O so it
 * can be reasoned about and tested as plain functions). It does import the
 * schema table definitions, which are pure data descriptors, not connections.
 */
import { and, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { entrySourceEnum } from '@/lib/db/schema/enums';
import { ledgerEntries } from '@/lib/db/schema/transactions';
import { wallets } from '@/lib/db/schema/wallets';
import type { TransactionClient } from '@/lib/db';
import type { Money } from './money';

type EntrySource = (typeof entrySourceEnum.enumValues)[number];

export interface PostEntryInput {
  /** Owner of the wallet this entry posts against — NOT necessarily whoever
   * is recording it. See "Penyaring userId" below. */
  userId: string;
  walletId: string;
  /** Signed: negative = money out, positive = money in. */
  amount: Money;
  source: EntrySource;
  entryDate: Date;
  transactionId?: string;
  sourceId?: string;
}

export type LedgerEntry = typeof ledgerEntries.$inferSelect;

/**
 * Writes one or more ledger entries and adjusts wallet balances atomically.
 * MUST be called inside an active transaction.
 *
 * Two points that are easy to get wrong:
 *
 * 1. The `UPDATE` uses `balance = balance + delta` INSIDE SQL, never a
 *    read-modify-write round trip through the application. Read-then-write
 *    loses updates under concurrent requests.
 *
 * 2. The `userId` filter on each wallet's UPDATE comes from THAT entry's
 *    owner, never from `entries[0].userId`. A member transfer posts two
 *    entries owned by two different people in one call — using the first
 *    entry's owner for both would make the second UPDATE match no row, and
 *    that wallet's balance would silently fail to change. Callers must
 *    populate each entry's `userId` with the WALLET'S OWNER, never with
 *    whoever is currently recording the entry.
 */
export async function postEntries(
  tx: TransactionClient,
  entries: PostEntryInput[],
): Promise<LedgerEntry[]> {
  if (entries.length === 0) {
    throw new RangeError('postEntries: at least one entry is required');
  }

  const inserted = await tx
    .insert(ledgerEntries)
    .values(
      entries.map((e) => ({
        id: uuidv7(),
        userId: e.userId,
        walletId: e.walletId,
        amount: e.amount,
        source: e.source,
        transactionId: e.transactionId ?? null,
        sourceId: e.sourceId ?? null,
        entryDate: e.entryDate,
      })),
    )
    .returning();

  // Aggregate per wallet so one wallet needs only one UPDATE.
  const deltaByWallet = new Map<string, Money>();
  const ownerByWallet = new Map<string, string>();
  for (const e of entries) {
    deltaByWallet.set(e.walletId, (deltaByWallet.get(e.walletId) ?? 0n) + e.amount);
    ownerByWallet.set(e.walletId, e.userId);
  }

  for (const [walletId, delta] of deltaByWallet) {
    const ownerId = ownerByWallet.get(walletId)!;
    // The userId filter uses THIS entry's owner, not the first entry's — see
    // the doc comment above. It also enforces invariant I11 structurally:
    // ledger_entries.user_id always equals wallets.user_id for its wallet_id.
    const result = await tx
      .update(wallets)
      .set({ balance: sql`${wallets.balance} + ${delta}`, updatedAt: new Date() })
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, ownerId)));

    if (result.rowCount === 0) {
      throw new Error(
        `postEntries: no wallet ${walletId} owned by user ${ownerId} — refusing to post an entry against a wallet that isn't the entry owner's`,
      );
    }
  }

  return inserted;
}
