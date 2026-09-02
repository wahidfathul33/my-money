/**
 * Category reads — src/lib/db/read.ts only (docs/11-tech-architecture.md §2:
 * "queries.ts ← baca, dipanggil Server Component"). No `dbWrite` import
 * anywhere in this file.
 */
import { and, count, desc, eq, gte, isNull } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { categories } from '@/lib/db/schema/categories';
import { transactions } from '@/lib/db/schema/transactions';
import { ownedBy } from '@/lib/db/scoped';

export type CategoryRow = typeof categories.$inferSelect;

export interface CategoryWithChildren extends CategoryRow {
  children: CategoryRow[];
}

export interface ListCategoriesOptions {
  includeArchived?: boolean;
}

/**
 * All of the caller's categories of one type, hierarchical: top-level
 * categories with their (max one level, docs/03 §7.3) sub-categories
 * nested under `children`, both ordered by `sort_order`.
 */
export async function listCategories(
  userId: string,
  type: 'expense' | 'income',
  options: ListCategoriesOptions = {},
): Promise<CategoryWithChildren[]> {
  const conditions = [ownedBy(categories, userId), eq(categories.type, type)];
  if (!options.includeArchived) {
    conditions.push(eq(categories.isArchived, false));
  }

  const rows = await dbRead
    .select()
    .from(categories)
    .where(and(...conditions))
    .orderBy(categories.sortOrder);

  const childrenByParent = new Map<string, CategoryRow[]>();
  for (const row of rows) {
    if (row.parentId === null) continue;
    const siblings = childrenByParent.get(row.parentId) ?? [];
    siblings.push(row);
    childrenByParent.set(row.parentId, siblings);
  }

  return rows
    .filter((row) => row.parentId === null)
    .map((row) => ({ ...row, children: childrenByParent.get(row.id) ?? [] }));
}

const RECENT_WINDOW_DAYS = 30;

/**
 * The caller's most-used categories of one type in the last 30 days, most
 * frequent first — feeds the quick-pick shortcut on the record-transaction
 * screen (task 07, tasks/06-categories/todo.md "untuk task 07").
 */
export async function getRecentCategories(
  userId: string,
  type: 'expense' | 'income',
  limit = 6,
): Promise<CategoryRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - RECENT_WINDOW_DAYS);

  const ranked = await dbRead
    .select({ categoryId: transactions.categoryId, uses: count() })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(categories.type, type),
        eq(categories.isArchived, false),
        gte(transactions.transactionDate, since),
        isNull(transactions.voidedAt),
      ),
    )
    .groupBy(transactions.categoryId)
    .orderBy(desc(count()))
    .limit(limit);

  if (ranked.length === 0) return [];

  const ids = ranked.map((r) => r.categoryId).filter((id): id is string => id !== null);
  const rows = await dbRead.select().from(categories).where(ownedBy(categories, userId));
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Preserve the usage-count ranking from `ranked`, not the arbitrary order
  // the follow-up `rows` select returns.
  return ids.map((id) => byId.get(id)).filter((row): row is CategoryRow => row !== undefined);
}

/** Number of (non-void) transactions using this category — checked before offering delete vs. archive. */
export async function getCategoryUsageCount(userId: string, categoryId: string): Promise<number> {
  const [row] = await dbRead
    .select({ n: count() })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.categoryId, categoryId),
        isNull(transactions.voidedAt),
      ),
    );
  return row?.n ?? 0;
}
