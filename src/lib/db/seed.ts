/**
 * Per-user seed — docs/03-domain-model.md §7, tasks/04-authentication/spec.md.
 *
 * Runs once, atomically, on a brand new user's first login (wired to
 * Auth.js's `createUser` event — see src/lib/services/onboarding.ts). Forcing
 * someone to build a category list before they can record their first
 * transaction is the single most effective way to lose them, so both the
 * canonical category catalog AND a starter "Tunai" wallet are seeded
 * automatically instead.
 *
 * Like `postEntries` (src/lib/finance/ledger.ts), this is a pure function
 * over an injected transaction client — it never opens its own transaction
 * and never imports `@/lib/db/write` itself, so it stays outside the
 * `src/lib/services/**`-only import boundary (`no-restricted-imports` in
 * eslint.config.mjs) while still being usable only from inside one.
 */
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { categories } from './schema/categories';
import { wallets } from './schema/wallets';
import { users } from './schema/users';
import type { TransactionClient } from './index';

interface CategorySeed {
  systemKey: string;
  name: string;
  type: 'expense' | 'income';
  icon: string;
  color: string;
}

/**
 * The one canonical catalog, identical for every new user — docs/03 §7.1.
 * `systemKey` is stable and never changes; it's what makes household
 * aggregation exact regardless of what any individual renames their copy to.
 */
export const CANONICAL_CATEGORIES: readonly CategorySeed[] = [
  // Pengeluaran (10)
  { systemKey: 'food_drinks', name: 'Makan & Minum', type: 'expense', icon: 'utensils', color: 'orange' },
  { systemKey: 'transport', name: 'Transportasi', type: 'expense', icon: 'car', color: 'blue' },
  { systemKey: 'shopping', name: 'Belanja', type: 'expense', icon: 'shopping-bag', color: 'pink' },
  { systemKey: 'bills', name: 'Tagihan', type: 'expense', icon: 'receipt', color: 'amber' },
  { systemKey: 'entertainment', name: 'Hiburan', type: 'expense', icon: 'popcorn', color: 'violet' },
  { systemKey: 'health', name: 'Kesehatan', type: 'expense', icon: 'heart-pulse', color: 'red' },
  { systemKey: 'education', name: 'Pendidikan', type: 'expense', icon: 'graduation-cap', color: 'sky' },
  { systemKey: 'insurance', name: 'Asuransi', type: 'expense', icon: 'shield', color: 'teal' },
  { systemKey: 'donation', name: 'Donasi', type: 'expense', icon: 'heart-handshake', color: 'rose' },
  { systemKey: 'other_out', name: 'Lainnya', type: 'expense', icon: 'more-horizontal', color: 'slate' },
  // Pemasukan (6)
  { systemKey: 'salary', name: 'Gaji', type: 'income', icon: 'wallet', color: 'emerald' },
  { systemKey: 'freelance', name: 'Freelance', type: 'income', icon: 'laptop', color: 'cyan' },
  { systemKey: 'business', name: 'Bisnis', type: 'income', icon: 'briefcase', color: 'indigo' },
  { systemKey: 'investment', name: 'Investasi', type: 'income', icon: 'trending-up', color: 'green' },
  { systemKey: 'gift', name: 'Hadiah', type: 'income', icon: 'gift', color: 'fuchsia' },
  { systemKey: 'other_in', name: 'Lainnya', type: 'income', icon: 'more-horizontal', color: 'slate' },
] as const;

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

  await tx.insert(categories).values(
    CANONICAL_CATEGORIES.map((c, index) => ({
      id: uuidv7(),
      userId,
      name: c.name,
      type: c.type,
      systemKey: c.systemKey,
      icon: c.icon,
      color: c.color,
      sortOrder: index,
    })),
  );

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
