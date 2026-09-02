/**
 * Per-user seed — docs/03-domain-model.md §7, tasks/04-authentication/spec.md,
 * tasks/06-categories/spec.md.
 *
 * Runs once, atomically, on a brand new user's first login (wired to
 * Auth.js's `createUser` event — see src/lib/services/onboarding.ts). Forcing
 * someone to build a category list before they can record their first
 * transaction is the single most effective way to lose them, so both the
 * canonical category catalog AND a starter "Tunai" wallet are seeded
 * automatically instead.
 *
 * The catalog itself (`CATEGORY_CATALOG`) and its idempotent inserter
 * (`seedCategories`) live in ./seed/categories.ts — task 06's home for them,
 * per its spec ("Berkas yang Disentuh"). This file just wires that into the
 * same one-transaction first-login flow task 04 built, alongside the
 * starter wallet.
 *
 * Like `postEntries` (src/lib/finance/ledger.ts), `seedNewUser` is a pure
 * function over an injected transaction client — it never opens its own
 * transaction and never imports `@/lib/db/write` itself, so it stays outside
 * the `src/lib/services/**`-only import boundary (`no-restricted-imports` in
 * eslint.config.mjs) while still being usable only from inside one.
 */
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { wallets } from './schema/wallets';
import { users } from './schema/users';
import { seedCategories } from './seed/categories';
import type { TransactionClient } from './index';

export { CATEGORY_CATALOG, seedCategories } from './seed/categories';
export type { CategoryCatalogEntry, SystemCategoryKey } from './seed/categories';

export const STARTER_WALLET_NAME = 'Tunai';

/**
 * Seeds the canonical categories and a starter "Tunai" wallet (balance 0 —
 * no `ledger_entry` needed, per docs/03 §6.3: only a nonzero opening balance
 * writes one) for a brand new user, and points `users.default_wallet_id` at
 * it. MUST be called inside an already-open `dbWrite.transaction(...)`.
 *
 * Idempotent by construction, not by a guard clause: `categories_user_system_key_uniq`
 * and the caller only ever invoking this from Auth.js's `createUser` event
 * (fired once per new adapter user, never on subsequent logins) are what
 * make a second run impossible in practice. A defensive existence check is
 * still worth having so this function is safe to call more than once, e.g.
 * in tests.
 */
export async function seedNewUser(tx: TransactionClient, userId: string): Promise<void> {
  const [existingWallet] = await tx
    .select({ id: wallets.id })
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);
  if (existingWallet) {
    // Already seeded (e.g. this function was called twice for the same
    // user) — do nothing rather than violate the unique category/system_key
    // index or create a second starter wallet.
    return;
  }

  await seedCategories(tx, userId);

  const walletId = uuidv7();
  await tx.insert(wallets).values({
    id: walletId,
    userId,
    name: STARTER_WALLET_NAME,
    type: 'cash',
    // balance defaults to 0 — see docs/03 §6.3, no ledger_entry required.
  });

  await tx.update(users).set({ defaultWalletId: walletId }).where(eq(users.id, userId));
}
