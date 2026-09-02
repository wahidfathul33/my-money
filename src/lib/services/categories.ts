/**
 * Categories service — orchestration layer for tasks/06-categories/spec.md.
 * Every write to `categories` goes through here (docs/11-tech-architecture.md
 * §3: "Hanya lib/services/** yang boleh mengimpor lib/db/write").
 *
 * The three invariants this file exists to protect, all from
 * docs/03-domain-model.md §7.3 / ADR-027:
 *   1. `system_key` is set ONLY by the seeder (src/lib/db/seed/categories.ts)
 *      — no function here ever accepts it as input, from any caller, ever.
 *   2. `type` can never change after creation — no function here has a
 *      parameter for it past `createCategory`.
 *   3. Built-in categories (`system_key IS NOT NULL`) can be renamed but
 *      never deleted, only archived.
 * Depth (max 1 level) and per-type name uniqueness are enforced by the
 * database itself (`categories_depth_check` trigger,
 * `categories_user_name_type_uniq` — docs/04-database-schema.md §6); this
 * layer adds ownership checks and turns raw constraint violations into
 * domain errors instead of leaking Postgres error codes to the UI.
 */
import { and, desc, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { categories } from '@/lib/db/schema/categories';
import { transactions } from '@/lib/db/schema/transactions';
import { ownedBy } from '@/lib/db/scoped';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { isIconName } from '@/lib/icons';
import type { TransactionClient } from '@/lib/db';

type CategoryType = 'expense' | 'income';
type CategoryRow = typeof categories.$inferSelect;

/**
 * Curated color tokens — a fixed palette, not a free color picker (spec:
 * "Ikon dari set terkurasi, bukan unggahan" applies the same reasoning to
 * color). Exported for `src/features/categories/schema.ts` (Zod validation)
 * and the color picker UI, so the picker's swatches and this service's
 * validation can never drift apart into two different lists.
 */
export const CATEGORY_COLORS = [
  'slate',
  'red',
  'orange',
  'amber',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'fuchsia',
  'pink',
  'rose',
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export function isCategoryColor(value: string): value is CategoryColor {
  return (CATEGORY_COLORS as readonly string[]).includes(value);
}

/** Postgres unique_violation — see https://www.postgresql.org/docs/current/errcodes-appendix.html */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Drizzle wraps the raw `pg`-wire error (which carries `.code` /
 * `.constraint`) in a `DrizzleQueryError`, exposed as `.cause` — the field
 * these helpers actually need to look at is one level down from the error
 * `catch` receives, not on it directly.
 */
function pgCause(err: unknown): Record<string, unknown> | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const cause = 'cause' in err ? (err as { cause: unknown }).cause : undefined;
  if (typeof cause === 'object' && cause !== null) return cause as Record<string, unknown>;
  // Fall back to the error itself in case a caller passes the unwrapped
  // pg error directly (e.g. from a driver that doesn't wrap).
  return err as Record<string, unknown>;
}

function pgErrorCode(err: unknown): string | undefined {
  const cause = pgCause(err);
  return cause && 'code' in cause ? String(cause.code) : undefined;
}

function pgConstraintName(err: unknown): string | undefined {
  const cause = pgCause(err);
  return cause && 'constraint' in cause ? String(cause.constraint) : undefined;
}

/**
 * Translates the two constraint violations user input can actually trigger
 * into `ValidationError`s with an Indonesian, field-attributed message.
 * Anything else (a bug, not a user mistake) is rethrown as-is.
 */
function translateWriteError(err: unknown): never {
  if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) {
    const constraint = pgConstraintName(err);
    if (constraint === 'categories_user_name_type_uniq') {
      throw new ValidationError({ name: ['Nama kategori sudah dipakai untuk jenis ini'] });
    }
  }
  // enforce_category_depth() raises a plain plpgsql exception (SQLSTATE
  // P0001), not a constraint violation — matched by message since it has
  // no stable machine-readable code. In practice `resolveParent` above
  // catches every depth violation before it reaches the database; this is
  // defense in depth for the trigger itself, not the primary guard.
  const cause = pgCause(err);
  const causeMessage = cause && 'message' in cause ? String(cause.message) : undefined;
  if (causeMessage?.includes('satu tingkat kedalaman')) {
    throw new ValidationError({ parentId: ['Sub-kategori hanya boleh satu tingkat'] });
  }
  throw err;
}

async function findOwnCategory(
  tx: TransactionClient,
  userId: string,
  categoryId: string,
): Promise<CategoryRow> {
  const [row] = await tx
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), ownedBy(categories, userId)))
    .limit(1);
  if (!row) throw new NotFoundError('Kategori tidak ditemukan');
  return row;
}

/**
 * A category can be a parent (one level of sub-categories, docs/03 §7.3) —
 * built-in categories included, since `categories_system_no_parent` only
 * constrains a system row's OWN `parent_id`, not whether other rows may
 * point at it. This resolves and validates a `parentId` for create/update:
 * owned by the same user, itself top-level (no grandparent — the DB trigger
 * would reject this too, but failing here gives a field-attributed error
 * instead of a generic one), and same `type` as the child (not enforced by
 * the database, but nesting an expense under an income parent — or vice
 * versa — has no sensible meaning).
 */
async function resolveParent(
  tx: TransactionClient,
  userId: string,
  parentId: string,
  childType: CategoryType,
): Promise<void> {
  const parent = await findOwnCategory(tx, userId, parentId);
  if (parent.parentId !== null) {
    throw new ValidationError({ parentId: ['Sub-kategori hanya boleh satu tingkat'] });
  }
  if (parent.type !== childType) {
    throw new ValidationError({ parentId: ['Induk kategori harus jenis yang sama'] });
  }
}

export interface CreateCategoryInput {
  userId: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  parentId?: string | null;
}

/**
 * Creates a custom category. `system_key` is NEVER accepted here — it's
 * hardcoded to `null` below, full stop. This is what tasks/06-categories/
 * spec.md calls "the reason this task exists": if this function ever grew a
 * `systemKey` parameter, a user could mint a fake `food_drinks` and corrupt
 * household aggregation for everyone who thinks that key means one specific
 * canonical category.
 */
export async function createCategory(input: CreateCategoryInput): Promise<CategoryRow> {
  const name = input.name.trim();
  if (!name) throw new ValidationError({ name: ['Nama kategori wajib diisi'] });
  if (name.length > 40) throw new ValidationError({ name: ['Nama kategori maksimal 40 karakter'] });
  if (!isIconName(input.icon)) throw new ValidationError({ icon: ['Ikon tidak valid'] });
  if (!isCategoryColor(input.color)) throw new ValidationError({ color: ['Warna tidak valid'] });

  return dbWrite.transaction(async (tx) => {
    if (input.parentId) {
      await resolveParent(tx, input.userId, input.parentId, input.type);
    }

    const [maxSort] = await tx
      .select({ sortOrder: categories.sortOrder })
      .from(categories)
      .where(and(ownedBy(categories, input.userId), eq(categories.type, input.type)))
      .orderBy(desc(categories.sortOrder))
      .limit(1);

    try {
      const [created] = await tx
        .insert(categories)
        .values({
          id: uuidv7(),
          userId: input.userId,
          name,
          type: input.type,
          systemKey: null, // ALWAYS — see doc comment above.
          icon: input.icon,
          color: input.color,
          parentId: input.parentId ?? null,
          sortOrder: (maxSort?.sortOrder ?? -1) + 1,
        })
        .returning();
      if (!created) throw new Error('Insert kategori tidak mengembalikan baris');
      return created;
    } catch (err) {
      translateWriteError(err);
    }
  });
}

export interface UpdateCategoryInput {
  userId: string;
  categoryId: string;
  name?: string;
  icon?: string;
  color?: string;
  /** `undefined` = leave unchanged, `null` = detach from parent. */
  parentId?: string | null;
}

/**
 * Updates name/icon/color/parent. Deliberately has NO `type` parameter and
 * NO `systemKey` parameter — docs/03 §7.3: "type tidak dapat diubah setelah
 * dibuat" and "system_key tidak dapat diubah dan tidak dapat diisi
 * pengguna." Renaming a built-in category is explicitly allowed (its
 * `system_key` is simply never touched, by construction — there's no code
 * path in this function that could touch it).
 */
export async function updateCategory(input: UpdateCategoryInput): Promise<CategoryRow> {
  if (input.icon !== undefined && !isIconName(input.icon)) {
    throw new ValidationError({ icon: ['Ikon tidak valid'] });
  }
  if (input.color !== undefined && !isCategoryColor(input.color)) {
    throw new ValidationError({ color: ['Warna tidak valid'] });
  }
  let name: string | undefined;
  if (input.name !== undefined) {
    name = input.name.trim();
    if (!name) throw new ValidationError({ name: ['Nama kategori wajib diisi'] });
    if (name.length > 40)
      throw new ValidationError({ name: ['Nama kategori maksimal 40 karakter'] });
  }

  return dbWrite.transaction(async (tx) => {
    const existing = await findOwnCategory(tx, input.userId, input.categoryId);

    if (input.parentId !== undefined && input.parentId !== null) {
      if (input.parentId === input.categoryId) {
        throw new ValidationError({
          parentId: ['Kategori tidak bisa menjadi induk dirinya sendiri'],
        });
      }
      if (existing.systemKey !== null) {
        // Defense in depth: categories_system_no_parent CHECK would reject
        // this at the database level too, but this gives a field-attributed
        // error instead of a raw constraint violation.
        throw new ValidationError({ parentId: ['Kategori bawaan tidak boleh punya induk'] });
      }
      // A category that's already a parent can't become a child itself —
      // that would silently push its existing children to depth 2, which
      // the depth trigger can't catch (it only validates the row being
      // written, not rows that reference it).
      const [child] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.parentId, input.categoryId), ownedBy(categories, input.userId)))
        .limit(1);
      if (child) {
        throw new ValidationError({
          parentId: ['Kategori ini sudah punya sub-kategori dan tidak bisa dipindah'],
        });
      }
      await resolveParent(tx, input.userId, input.parentId, existing.type);
    }

    try {
      const [updated] = await tx
        .update(categories)
        .set({
          ...(name !== undefined && { name }),
          ...(input.icon !== undefined && { icon: input.icon }),
          ...(input.color !== undefined && { color: input.color }),
          ...(input.parentId !== undefined && { parentId: input.parentId }),
          updatedAt: new Date(),
        })
        .where(and(eq(categories.id, input.categoryId), ownedBy(categories, input.userId)))
        .returning();
      if (!updated) throw new NotFoundError('Kategori tidak ditemukan');
      return updated;
    } catch (err) {
      translateWriteError(err);
    }
  });
}

/**
 * Archives a category — built-in or custom (docs/03 §7.3: built-ins can be
 * archived, never deleted). Archiving doesn't touch `system_key`, `type`,
 * or usage; a used category can always be archived even though it can never
 * be deleted.
 */
export async function archiveCategory(userId: string, categoryId: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    await findOwnCategory(tx, userId, categoryId);
    await tx
      .update(categories)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(and(eq(categories.id, categoryId), ownedBy(categories, userId)));
  });
}

export async function restoreCategory(userId: string, categoryId: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    await findOwnCategory(tx, userId, categoryId);
    try {
      await tx
        .update(categories)
        .set({ isArchived: false, updatedAt: new Date() })
        .where(and(eq(categories.id, categoryId), ownedBy(categories, userId)));
    } catch (err) {
      translateWriteError(err);
    }
  });
}

/**
 * Hard-deletes a category. Two things make this impossible for the cases
 * docs/03 §7.3 forbids, rather than merely discouraged:
 *   - built-in (`system_key IS NOT NULL`): rejected here before touching
 *     the database at all.
 *   - used by any transaction: `transactions.category_id` is
 *     `ON DELETE RESTRICT` (docs/04-database-schema.md §7), so even if this
 *     check had a bug, the database itself would refuse the delete. The
 *     check here exists to turn that into a friendly message instead of a
 *     raw FK violation.
 *   - has sub-categories: same reasoning, `categories.parent_id` is also
 *     `ON DELETE RESTRICT`.
 */
export async function deleteCategory(userId: string, categoryId: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const category = await findOwnCategory(tx, userId, categoryId);
    if (category.systemKey !== null) {
      throw new ForbiddenError('Kategori bawaan tidak dapat dihapus, hanya bisa diarsipkan');
    }

    const [usedBy] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.categoryId, categoryId))
      .limit(1);
    if (usedBy) {
      throw new ValidationError({
        categoryId: ['Kategori ini sudah dipakai transaksi — arsipkan sebagai gantinya'],
      });
    }

    const [child] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.parentId, categoryId), ownedBy(categories, userId)))
      .limit(1);
    if (child) {
      throw new ValidationError({
        categoryId: [
          'Kategori ini punya sub-kategori — hapus atau pindahkan sub-kategorinya dahulu',
        ],
      });
    }

    await tx
      .delete(categories)
      .where(and(eq(categories.id, categoryId), ownedBy(categories, userId)));
  });
}

/**
 * Persists a new display order. `orderedIds` is the full ordered list for
 * whatever scope the caller is reordering within (e.g. one type's
 * top-level list in the settings UI) — every id must belong to the caller,
 * checked up front so a partial/foreign id can't silently reorder around a
 * gap or, worse, be silently ignored while looking like it succeeded.
 */
export async function reorderCategories(
  userId: string,
  orderedIds: readonly string[],
): Promise<void> {
  if (orderedIds.length === 0) return;

  await dbWrite.transaction(async (tx) => {
    // Verify EVERY id belongs to the caller before writing any of them —
    // one query, checked up front, so a foreign id fails the whole batch
    // instead of reordering around a silently-skipped gap.
    const ownedRows = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(ownedBy(categories, userId));
    const ownedIds = new Set(ownedRows.map((r) => r.id));
    if (!orderedIds.every((id) => ownedIds.has(id))) {
      throw new NotFoundError('Kategori tidak ditemukan');
    }

    await Promise.all(
      orderedIds.map((id, index) =>
        tx
          .update(categories)
          .set({ sortOrder: index, updatedAt: new Date() })
          .where(and(eq(categories.id, id), ownedBy(categories, userId))),
      ),
    );
  });
}
