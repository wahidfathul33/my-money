/**
 * Wallets service — dbWrite transactions live here, per
 * docs/11-tech-architecture.md §3 (only src/lib/services/** may import
 * `@/lib/db/write`). Every mutation here re-verifies ownership INSIDE the
 * transaction (`ownedBy`), even though the Server Action layer above also
 * calls `requireUser()` first — tasks/05-wallets/spec.md "Batasan": "verifikasi
 * kepemilikan di dalam transaction".
 *
 * `wallets.balance` is a cache. The only function allowed to change it is
 * `postEntries` (src/lib/finance/ledger.ts) — nothing here ever writes
 * `balance` directly. See docs/03-domain-model.md §6.3 and §1.1.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { ledgerEntries, users, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import { postEntries } from '@/lib/finance/ledger';
import type { Money } from '@/lib/finance/money';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

export type Wallet = typeof wallets.$inferSelect;
export type WalletType = Wallet['type'];

/**
 * Default icon/color per type at creation time — kept local to this service
 * (not imported from src/features/wallets/wallet-type-meta.ts) so
 * src/lib/services/** stays the lower layer: features depend on services,
 * not the other way around. The UI's full curated icon/color catalog (used
 * for the picker in the create/edit form) lives in the features module;
 * this is just the four starting defaults.
 */
const DEFAULT_ICON_COLOR: Record<WalletType, { icon: string; color: string }> = {
  cash: { icon: 'wallet', color: 'emerald' },
  bank: { icon: 'landmark', color: 'blue' },
  ewallet: { icon: 'smartphone', color: 'violet' },
  credit_card: { icon: 'credit-card', color: 'rose' },
};

function assertNonPositiveForCreditCard(type: WalletType, balance: Money, field: string): void {
  if (type === 'credit_card' && balance > 0n) {
    throw new ValidationError({
      [field]: ['Saldo kartu kredit tidak boleh positif — kartu kredit adalah liabilitas.'],
    });
  }
}

export interface CreateWalletInput {
  name: string;
  type: WalletType;
  openingBalance: Money;
}

/**
 * Inserts the wallet row and, when `openingBalance !== 0`, writes one
 * `opening_balance` ledger entry in the SAME transaction — docs/03 §6.3:
 * "saldo awal bukan pengecualian", so `wallets.balance` never starts life
 * out of sync with `SUM(ledger_entries.amount)`.
 */
export async function createWallet(userId: string, input: CreateWalletInput): Promise<string> {
  assertNonPositiveForCreditCard(input.type, input.openingBalance, 'openingBalance');

  return dbWrite.transaction(async (tx) => {
    const id = uuidv7();
    const meta = DEFAULT_ICON_COLOR[input.type];

    await tx.insert(wallets).values({
      id,
      userId,
      name: input.name,
      type: input.type,
      icon: meta.icon,
      color: meta.color,
    });

    if (input.openingBalance !== 0n) {
      await postEntries(tx, [
        {
          userId,
          walletId: id,
          amount: input.openingBalance,
          source: 'opening_balance',
          entryDate: new Date(),
        },
      ]);
    }

    return id;
  });
}

export interface UpdateWalletInput {
  name: string;
  icon: string;
  color: string;
}

/** Renames a wallet and updates its icon/color. `type` is immutable after
 * creation (docs/03 §7.3-equivalent rule for wallets — todo.md "jenis tidak
 * dapat diubah") — not accepted here. */
export async function updateWallet(
  userId: string,
  walletId: string,
  input: UpdateWalletInput,
): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const result = await tx
      .update(wallets)
      .set({ name: input.name, icon: input.icon, color: input.color, updatedAt: new Date() })
      .where(and(eq(wallets.id, walletId), ownedBy(wallets, userId)));

    if (result.rowCount === 0) {
      throw new NotFoundError('Dompet tidak ditemukan');
    }
  });
}

/**
 * Archives a wallet — docs/03 §6.3: "active -> archive -> archived", never a
 * hard delete for a wallet with history. Also clears `users.default_wallet_id`
 * when the archived wallet was the default, since an archived wallet must
 * disappear from every picker (docs/03 §5: "hilang dari pemilih").
 */
export async function archiveWallet(userId: string, walletId: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const result = await tx
      .update(wallets)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(and(eq(wallets.id, walletId), ownedBy(wallets, userId)));

    if (result.rowCount === 0) {
      throw new NotFoundError('Dompet tidak ditemukan');
    }

    await tx
      .update(users)
      .set({ defaultWalletId: null })
      .where(and(eq(users.id, userId), eq(users.defaultWalletId, walletId)));
  });
}

export async function restoreWallet(userId: string, walletId: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const result = await tx
      .update(wallets)
      .set({ isArchived: false, updatedAt: new Date() })
      .where(and(eq(wallets.id, walletId), ownedBy(wallets, userId)));

    if (result.rowCount === 0) {
      throw new NotFoundError('Dompet tidak ditemukan');
    }
  });
}

/**
 * Hard-deletes a wallet — only allowed when it has ZERO ledger entries
 * (docs/03 §6.3). `ledger_entries.wallet_id` is `ON DELETE RESTRICT`
 * (docs/04 §7), so the database would refuse this anyway; the explicit
 * count check here exists to fail with a clear, translatable message
 * instead of a raw FK-violation error.
 */
export async function deleteWallet(userId: string, walletId: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const [wallet] = await tx
      .select({ id: wallets.id })
      .from(wallets)
      .where(and(eq(wallets.id, walletId), ownedBy(wallets, userId)))
      .limit(1);
    if (!wallet) {
      throw new NotFoundError('Dompet tidak ditemukan');
    }

    const countRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.walletId, walletId));
    const count = countRows[0]?.count ?? 0;

    if (count > 0) {
      throw new ValidationError({
        walletId: ['Dompet ini punya riwayat transaksi. Arsipkan sebagai gantinya.'],
      });
    }

    await tx
      .update(users)
      .set({ defaultWalletId: null })
      .where(and(eq(users.id, userId), eq(users.defaultWalletId, walletId)));

    await tx.delete(wallets).where(and(eq(wallets.id, walletId), ownedBy(wallets, userId)));
  });
}

/**
 * Records a balance adjustment — docs/03 §6 "Aturan Penting": never
 * overwrites `balance`. Computes the delta between the wallet's cached
 * balance and the user-entered actual balance, and writes exactly that
 * delta as one `adjustment` entry, so the correction is visible in history
 * rather than silently absorbed.
 */
export async function adjustWalletBalance(
  userId: string,
  walletId: string,
  actualBalance: Money,
): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(and(eq(wallets.id, walletId), ownedBy(wallets, userId)))
      .limit(1);
    if (!wallet) {
      throw new NotFoundError('Dompet tidak ditemukan');
    }

    assertNonPositiveForCreditCard(wallet.type, actualBalance, 'actualBalance');

    const delta = actualBalance - wallet.balance;
    if (delta === 0n) {
      return; // Nothing to adjust — avoid a zero-amount entry (ledger_amount_nonzero).
    }

    await postEntries(tx, [
      {
        userId,
        walletId,
        amount: delta,
        source: 'adjustment',
        entryDate: new Date(),
      },
    ]);
  });
}

/**
 * Persists a new display order. `sort_order` is a flat integer column
 * (docs/04 §5) — callers pass the ids of one visual group (or the whole
 * list) in their new order; each gets its array index as `sort_order`.
 * Ownership of every id is verified up front, inside the same transaction,
 * before any row is written — a single id belonging to another user aborts
 * the whole reorder rather than partially applying it.
 */
export async function reorderWallets(userId: string, orderedIds: string[]): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const owned = await tx
      .select({ id: wallets.id })
      .from(wallets)
      .where(and(inArray(wallets.id, orderedIds), ownedBy(wallets, userId)));

    if (owned.length !== new Set(orderedIds).size) {
      throw new NotFoundError('Satu atau lebih dompet tidak ditemukan');
    }

    for (const [index, walletId] of orderedIds.entries()) {
      await tx
        .update(wallets)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(and(eq(wallets.id, walletId), ownedBy(wallets, userId)));
    }
  });
}

/** Sets `users.default_wallet_id` — editable from wallet detail (tasks/05 spec). */
export async function setDefaultWallet(userId: string, walletId: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const [wallet] = await tx
      .select({ id: wallets.id, isArchived: wallets.isArchived })
      .from(wallets)
      .where(and(eq(wallets.id, walletId), ownedBy(wallets, userId)))
      .limit(1);
    if (!wallet) {
      throw new NotFoundError('Dompet tidak ditemukan');
    }
    if (wallet.isArchived) {
      throw new ValidationError({ walletId: ['Dompet yang diarsipkan tidak bisa jadi dompet utama.'] });
    }

    await tx.update(users).set({ defaultWalletId: walletId }).where(eq(users.id, userId));
  });
}
