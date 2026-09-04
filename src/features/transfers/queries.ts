/**
 * Transfers reads — `dbRead` only (docs/11-tech-architecture.md §2).
 * Restricted throughout to `type = 'transfer' AND counterparty_user_id IS
 * NULL` — self-transfers only; member transfers (task 13) will need their
 * own shape since they write ONE entry per transaction, not two.
 *
 * A self-transfer's two `ledger_entries` share `transaction_id` but land on
 * different wallets, so every query here joins `ledger_entries` → `wallets`
 * and returns TWO rows per transfer, then groups them back into one item by
 * `transactions.id` — the negative entry is `fromWallet`, the positive one
 * `toWallet`.
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { ledgerEntries, transactions, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import type { Money } from '@/lib/finance/money';

export interface TransferWalletInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface TransferListItem {
  id: string;
  /** Always positive — docs/03 §9.2. Direction lives in fromWallet/toWallet, not the sign. */
  amount: Money;
  transactionDate: Date;
  note: string | null;
  fromWallet: TransferWalletInfo;
  toWallet: TransferWalletInfo;
}

function selectTransferRowShape() {
  return {
    id: transactions.id,
    amount: transactions.amount,
    transactionDate: transactions.transactionDate,
    note: transactions.note,
    entryAmount: ledgerEntries.amount,
    walletId: wallets.id,
    walletName: wallets.name,
    walletIcon: wallets.icon,
    walletColor: wallets.color,
  };
}

type TransferRow = Awaited<ReturnType<typeof fetchTransferRows>>[number];

async function fetchTransferRows(userId: string, limit: number, transactionId?: string) {
  return dbRead
    .select(selectTransferRowShape())
    .from(transactions)
    .innerJoin(
      ledgerEntries,
      and(eq(ledgerEntries.transactionId, transactions.id), isNull(ledgerEntries.voidedAt)),
    )
    .innerJoin(wallets, eq(wallets.id, ledgerEntries.walletId))
    .where(
      and(
        ownedBy(transactions, userId),
        isNull(transactions.voidedAt),
        eq(transactions.type, 'transfer'),
        isNull(transactions.counterpartyUserId),
        transactionId ? eq(transactions.id, transactionId) : undefined,
      ),
    )
    .orderBy(desc(transactions.transactionDate), desc(transactions.id))
    .limit(limit);
}

/** Groups the (up to) two ledger-entry rows per transfer back into one item, keyed by transaction id. */
function groupIntoTransfers(rows: TransferRow[]): TransferListItem[] {
  interface Building {
    id: string;
    amount: Money;
    transactionDate: Date;
    note: string | null;
    fromWallet?: TransferWalletInfo;
    toWallet?: TransferWalletInfo;
  }

  const byId = new Map<string, Building>();
  for (const row of rows) {
    let entry = byId.get(row.id);
    if (!entry) {
      entry = { id: row.id, amount: row.amount, transactionDate: row.transactionDate, note: row.note };
      byId.set(row.id, entry);
    }
    const walletInfo: TransferWalletInfo = {
      id: row.walletId,
      name: row.walletName,
      icon: row.walletIcon,
      color: row.walletColor,
    };
    if (row.entryAmount < 0n) entry.fromWallet = walletInfo;
    else entry.toWallet = walletInfo;
  }

  const items: TransferListItem[] = [];
  for (const entry of byId.values()) {
    // Both sides must be present — a transfer with only one live entry left
    // (shouldn't happen; both are posted in the same dbWrite.transaction)
    // is dropped rather than shown half-formed.
    if (entry.fromWallet && entry.toWallet) {
      items.push({ ...entry, fromWallet: entry.fromWallet, toWallet: entry.toWallet });
    }
  }
  return items.sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime());
}

/** The caller's most recent non-void self-transfers, newest first — merged into the transaction history by src/features/transactions/queries.ts. */
export async function listRecentTransfers(userId: string, limit = 50): Promise<TransferListItem[]> {
  // 2 ledger rows per transfer, so over-fetch the row limit to still get
  // `limit` distinct transfers back after grouping.
  const rows = await fetchTransferRows(userId, limit * 2);
  return groupIntoTransfers(rows).slice(0, limit);
}

/** A single transfer's from/to wallet detail (for the detail sheet) — `null` if it doesn't exist, isn't the caller's, or is voided. */
export async function getTransferDetail(
  userId: string,
  transactionId: string,
): Promise<TransferListItem | null> {
  const rows = await fetchTransferRows(userId, 2, transactionId);
  const [item] = groupIntoTransfers(rows);
  return item ?? null;
}
