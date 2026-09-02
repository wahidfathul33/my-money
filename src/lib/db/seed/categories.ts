/**
 * Canonical category catalog — docs/03-domain-model.md §7.1,
 * docs/16-decision-log.md ADR-027, tasks/06-categories/spec.md.
 *
 * One catalog, defined in code (not the database), seeded identically for
 * every new user. Each entry's `systemKey` is stable and NEVER changes or
 * gets reused once released — it's the only thing that lets household
 * aggregation collapse "Makan & Minum" belonging to two different members
 * onto one report row, exactly, without comparing names (which fails
 * silently on "Makan dan Minum" vs "Makanan").
 *
 * Adding a built-in category later means adding an entry here AND a
 * migration that inserts it for existing users — never editing or reusing
 * an already-released `systemKey`.
 */
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { categories } from '../schema/categories';
import type { TransactionClient } from '../index';

export interface CategoryCatalogEntry {
  readonly systemKey: string;
  readonly name: string;
  readonly type: 'expense' | 'income';
  readonly icon: string;
  readonly color: string;
}

/**
 * 10 expense + 6 income, per docs/03 §7.1. Order here becomes the seeded
 * `sort_order`, which is also the order §7.1 lists them in.
 */
export const CATEGORY_CATALOG = [
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
] as const satisfies readonly CategoryCatalogEntry[];

/** Union of every released `system_key` — used to type-narrow catalog lookups. */
export type SystemCategoryKey = (typeof CATEGORY_CATALOG)[number]['systemKey'];

/**
 * Seeds the canonical catalog for a brand new user. MUST be called inside an
 * already-open `dbWrite.transaction(...)` — this function never opens its
 * own transaction (same shape as `postEntries`, src/lib/finance/ledger.ts).
 *
 * Idempotent via `ON CONFLICT DO NOTHING` targeting
 * `categories_user_system_key_uniq` (the partial unique index on
 * `(user_id, system_key) WHERE system_key IS NOT NULL` —
 * docs/04-database-schema.md §6): calling this twice for the same user
 * inserts the missing rows (if any) and silently skips ones that already
 * exist, rather than throwing or duplicating.
 */
export async function seedCategories(tx: TransactionClient, userId: string): Promise<void> {
  await tx
    .insert(categories)
    .values(
      CATEGORY_CATALOG.map((entry, index) => ({
        id: uuidv7(),
        userId,
        name: entry.name,
        type: entry.type,
        systemKey: entry.systemKey,
        icon: entry.icon,
        color: entry.color,
        sortOrder: index,
      })),
    )
    .onConflictDoNothing({
      target: [categories.userId, categories.systemKey],
      // Matches `categories_user_system_key_uniq`'s partial predicate
      // exactly — Postgres only applies ON CONFLICT to a partial unique
      // index when the clause's WHERE matches the index's WHERE verbatim.
      where: sql`${categories.systemKey} IS NOT NULL`,
    });
}
