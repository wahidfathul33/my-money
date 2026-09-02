/**
 * Wallets read queries — `dbRead` only (see src/lib/db/read.ts). Every query
 * here scopes with `ownedBy()` (src/lib/db/scoped.ts), following the pattern
 * established in task 04 (src/app/(app)/page.tsx, src/lib/auth/require-user.ts).
 */
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { ledgerEntries, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import type { Money } from '@/lib/finance/money';
import {
  WALLET_GROUP_LABEL,
  WALLET_TYPE_ORDER,
  type WalletType,
} from '@/features/wallets/wallet-type-meta';

export type WalletRow = typeof wallets.$inferSelect;

export interface WalletGroup {
  type: WalletType;
  label: string;
  wallets: WalletRow[];
  /** Sum of the group's active wallet balances. Signed — negative for the
   * credit_card ("Liabilitas") group, since that balance is always ≤ 0. */
  total: Money;
}

export interface WalletListResult {
  groups: WalletGroup[];
  archived: WalletRow[];
  /** Σ balance for cash/bank/ewallet, active only — excludes credit cards
   * entirely (docs/03 §6.1: "Total Kas" tidak menyertakan kartu kredit). */
  totalCash: Money;
  /** Σ ABS(balance) for active credit cards — the liability side. */
  totalCreditCardLiability: Money;
}

/**
 * Every wallet owned by the user, grouped per `type` (credit cards get
 * their own group labeled "Liabilitas" — tasks/05-wallets/spec.md), plus an
 * archived bucket kept separate so archived wallets stay out of totals and
 * out of any picker built from `groups`, while remaining reachable for
 * history (docs/03 §6.3: "riwayatnya tetap ada").
 */
export async function listWallets(userId: string): Promise<WalletListResult> {
  const rows = await dbRead
    .select()
    .from(wallets)
    .where(ownedBy(wallets, userId))
    .orderBy(asc(wallets.type), asc(wallets.sortOrder), asc(wallets.createdAt));

  const active = rows.filter((w) => !w.isArchived);
  const archived = rows.filter((w) => w.isArchived);

  const groups: WalletGroup[] = WALLET_TYPE_ORDER.map((type) => {
    const walletsOfType = active.filter((w) => w.type === type);
    return {
      type,
      label: WALLET_GROUP_LABEL[type],
      wallets: walletsOfType,
      total: walletsOfType.reduce((sum, w) => sum + w.balance, 0n),
    };
  }).filter((group) => group.wallets.length > 0);

  const totalCash = active
    .filter((w) => w.type !== 'credit_card')
    .reduce((sum, w) => sum + w.balance, 0n);

  const totalCreditCardLiability = active
    .filter((w) => w.type === 'credit_card')
    .reduce((sum, w) => sum + (w.balance < 0n ? -w.balance : w.balance), 0n);

  return { groups, archived, totalCash, totalCreditCardLiability };
}

export interface WalletLedgerEntry {
  id: string;
  amount: Money;
  source: string;
  entryDate: Date;
}

export interface WalletDetail extends WalletRow {
  recentEntries: WalletLedgerEntry[];
}

/**
 * A single wallet plus its most recent non-void ledger entries. Entries are
 * ALSO scoped by `ownedBy` (not just `wallet_id`) as defense in depth —
 * docs/04 §7's invariant I11 says `ledger_entries.user_id` always equals the
 * wallet owner's, but a read that doesn't lean on that invariant holding is
 * one fewer thing that can go silently wrong.
 */
export async function getWallet(userId: string, walletId: string): Promise<WalletDetail | null> {
  const [wallet] = await dbRead
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, walletId), ownedBy(wallets, userId)))
    .limit(1);

  if (!wallet) return null;

  const recentEntries = await dbRead
    .select({
      id: ledgerEntries.id,
      amount: ledgerEntries.amount,
      source: ledgerEntries.source,
      entryDate: ledgerEntries.entryDate,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.walletId, walletId),
        ownedBy(ledgerEntries, userId),
        isNull(ledgerEntries.voidedAt),
      ),
    )
    .orderBy(desc(ledgerEntries.entryDate))
    .limit(20);

  return { ...wallet, recentEntries };
}

/** Active (non-archived) wallets only — the shape a wallet picker needs
 * (docs/03 §6.3: archived wallets "hilang dari pemilih"). */
export async function listActiveWallets(userId: string): Promise<WalletRow[]> {
  return dbRead
    .select()
    .from(wallets)
    .where(and(ownedBy(wallets, userId), eq(wallets.isArchived, false)))
    .orderBy(asc(wallets.type), asc(wallets.sortOrder));
}

/** True when the wallet has at least one ledger entry — used to decide
 * whether the UI offers "Hapus" or only "Arsipkan" (docs/03 §6.3). */
export async function walletHasLedgerEntries(userId: string, walletId: string): Promise<boolean> {
  const [row] = await dbRead
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.walletId, walletId), ownedBy(ledgerEntries, userId)))
    .limit(1);
  return Boolean(row);
}

// Kept here (not inlined at call sites) so the "credit_card excluded from
// cash" rule has exactly one implementation.
export function isCashWalletType(type: WalletType): boolean {
  return type !== 'credit_card';
}
