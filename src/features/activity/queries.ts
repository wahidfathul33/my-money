/**
 * Activity reads — `dbRead` only (docs/11-tech-architecture.md §2). Backs
 * `/activity` (docs/09-screen-specs.md §14) and the unread badge on the
 * context switcher / "Lainnya" menu.
 *
 * "Activity", for now, is exactly one shape: transactions someone ELSE
 * wrote into the caller's own ledger — `created_by <> user_id`, which (per
 * `tx_created_by_rule`, src/lib/db/schema/transactions.ts) can only ever be
 * the receiving side of a member transfer. `acknowledged_at` is NULL by
 * default on every ordinary transaction too (nothing else ever sets it), so
 * filtering on `acknowledged_at IS NULL` alone would wrongly sweep in every
 * income/expense row a user has ever recorded — `created_by <> user_id`
 * is the filter that actually means "written by someone else", and it is
 * NEVER omitted below.
 */
import { and, count, desc, eq, isNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { dbRead } from '@/lib/db/read';
import { households, ledgerEntries, transactions, users, wallets } from '@/lib/db/schema';
import type { Money } from '@/lib/finance/money';

const sender = alias(users, 'activity_sender');

export interface ActivityWalletInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface ActivityItem {
  id: string;
  /** Always positive — docs/03 §9.2/§9.3. This is always an INCOMING
   * transfer from the caller's own point of view (Activity only ever shows
   * rows the caller owns, not ones they sent). */
  amount: Money;
  transactionDate: Date;
  note: string | null;
  senderName: string | null;
  senderEmail: string;
  /** The caller's own wallet this entry landed in — `null` only if the
   * live entry is somehow missing (defensive; shouldn't happen for a
   * non-voided row, since `createMemberTransfer` always posts one). */
  wallet: ActivityWalletInfo | null;
  householdName: string | null;
  /** `null` = still in "Belum ditinjau"; set = "Sebelumnya". */
  acknowledgedAt: Date | null;
}

function activitySelection() {
  return {
    id: transactions.id,
    amount: transactions.amount,
    transactionDate: transactions.transactionDate,
    note: transactions.note,
    acknowledgedAt: transactions.acknowledgedAt,
    senderName: sender.name,
    senderEmail: sender.email,
    householdName: households.name,
    walletId: wallets.id,
    walletName: wallets.name,
    walletIcon: wallets.icon,
    walletColor: wallets.color,
  };
}

type ActivityRow = Awaited<ReturnType<typeof fetchActivityRows>>;

async function fetchActivityRows(userId: string, limit: number) {
  return dbRead
    .select(activitySelection())
    .from(transactions)
    .innerJoin(sender, eq(sender.id, transactions.createdBy))
    .leftJoin(households, eq(households.id, transactions.householdId))
    .leftJoin(
      ledgerEntries,
      and(eq(ledgerEntries.transactionId, transactions.id), isNull(ledgerEntries.voidedAt)),
    )
    .leftJoin(wallets, eq(wallets.id, ledgerEntries.walletId))
    .where(
      and(
        eq(transactions.userId, userId),
        ne(transactions.createdBy, transactions.userId),
        isNull(transactions.voidedAt),
      ),
    )
    .orderBy(desc(transactions.transactionDate), desc(transactions.id))
    .limit(limit);
}

function toActivityItem(row: ActivityRow[number]): ActivityItem {
  return {
    id: row.id,
    amount: row.amount,
    transactionDate: row.transactionDate,
    note: row.note,
    senderName: row.senderName,
    senderEmail: row.senderEmail,
    wallet: row.walletId
      ? { id: row.walletId, name: row.walletName!, icon: row.walletIcon!, color: row.walletColor! }
      : null,
    householdName: row.householdName,
    acknowledgedAt: row.acknowledgedAt,
  };
}

/**
 * Every non-void transaction someone else wrote into the caller's ledger,
 * newest first — the `/activity` page partitions this into "Belum
 * ditinjau" (`acknowledgedAt === null`) and "Sebelumnya" client-side rather
 * than two separate queries, since it's the same predicate either way.
 */
export async function listActivity(userId: string, limit = 100): Promise<ActivityItem[]> {
  const rows = await fetchActivityRows(userId, limit);
  return rows.map(toActivityItem);
}

/** The badge count — context switcher + "Lainnya" menu (todo.md). */
export async function countUnacknowledged(userId: string): Promise<number> {
  const [row] = await dbRead
    .select({ count: count() })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        ne(transactions.createdBy, transactions.userId),
        isNull(transactions.voidedAt),
        isNull(transactions.acknowledgedAt),
      ),
    );
  return row?.count ?? 0;
}
