'use server';

/**
 * Category Server Actions — thin adapters only (docs/11-tech-architecture.md
 * §2/§3: "Server Action di sini tipis — ia memvalidasi, memanggil service,
 * merevalidasi cache" / "Server Action tidak boleh mengandung logika
 * bisnis"). Every action starts with `requireUser()` — docs/12-security-and-auth.md
 * §3, never relying on `proxy.ts` alone since it doesn't guard Server Actions.
 *
 * `createCategoryAction` / `updateCategoryAction` are bound to
 * `useActionState` + a native `<form action={formAction}>`, matching
 * src/app/onboarding/actions.ts. Archive/restore/delete/reorder are simple
 * single-argument mutations triggered by button clicks (not a form
 * submission), so they're called directly instead.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/require-user';
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  reorderCategories,
  restoreCategory,
  updateCategory,
} from '@/lib/services/categories';
import { AppError, ValidationError } from '@/lib/api/errors';
import { getCategoryUsageCount } from './queries';
import {
  categoryIdSchema,
  createCategoryFormSchema,
  reorderCategoriesSchema,
  updateCategoryFormSchema,
} from './schema';

const SETTINGS_CATEGORIES_PATH = '/settings/categories';

/**
 * A discriminated union rather than `{ error: string | null }` so the sheet
 * form can tell "just succeeded" apart from "hasn't submitted yet" —
 * `useActionState`'s initial state and a successful result would otherwise
 * both be `{ error: null }`, indistinguishable by value, and the sheet
 * needs that distinction to know when to close itself.
 */
export type CategoryFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; error: string; fields?: Record<string, string[] | undefined> };

export const CATEGORY_FORM_IDLE_STATE: CategoryFormState = { status: 'idle' };

/** Domain errors become a message the form can render; anything else is a bug and propagates. */
function toFormState(err: unknown): CategoryFormState {
  if (err instanceof ValidationError)
    return { status: 'error', error: err.message, fields: err.fields };
  if (err instanceof AppError) return { status: 'error', error: err.message };
  throw err;
}

/** Same translation as `toFormState`, shaped for the single-argument button actions below. */
function toSimpleResult(err: unknown): SimpleActionResult {
  if (err instanceof AppError) return { error: err.message };
  throw err;
}

export async function createCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const user = await requireUser();

  const parsed = createCategoryFormSchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type'),
    icon: formData.get('icon'),
    color: formData.get('color'),
    parentId: formData.get('parentId') ?? '',
  });
  if (!parsed.success) {
    return {
      status: 'error',
      error: 'Input tidak valid',
      fields: z.flattenError(parsed.error).fieldErrors,
    };
  }

  try {
    await createCategory({
      userId: user.id,
      name: parsed.data.name,
      type: parsed.data.type,
      icon: parsed.data.icon,
      color: parsed.data.color,
      parentId: parsed.data.parentId ?? null,
    });
  } catch (err) {
    return toFormState(err);
  }

  revalidatePath(SETTINGS_CATEGORIES_PATH);
  return { status: 'success' };
}

export async function updateCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const user = await requireUser();

  const parsed = updateCategoryFormSchema.safeParse({
    categoryId: formData.get('categoryId'),
    name: formData.get('name'),
    icon: formData.get('icon'),
    color: formData.get('color'),
    parentId: formData.get('parentId') ?? '',
  });
  if (!parsed.success) {
    return {
      status: 'error',
      error: 'Input tidak valid',
      fields: z.flattenError(parsed.error).fieldErrors,
    };
  }

  try {
    // No `type` field parsed above and none passed here — type can never
    // change after creation (docs/03 §7.3). `parentId` is `null` (detach)
    // when the field was cleared, `undefined` (leave unchanged) is not
    // representable from this form since it always resubmits the current
    // value.
    await updateCategory({
      userId: user.id,
      categoryId: parsed.data.categoryId,
      name: parsed.data.name,
      icon: parsed.data.icon,
      color: parsed.data.color,
      parentId: parsed.data.parentId ?? null,
    });
  } catch (err) {
    return toFormState(err);
  }

  revalidatePath(SETTINGS_CATEGORIES_PATH);
  return { status: 'success' };
}

export interface SimpleActionResult {
  error: string | null;
}

export async function archiveCategoryAction(categoryId: string): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsed = categoryIdSchema.safeParse({ categoryId });
  if (!parsed.success) return { error: 'Kategori tidak valid' };

  try {
    await archiveCategory(user.id, parsed.data.categoryId);
  } catch (err) {
    return toSimpleResult(err);
  }
  revalidatePath(SETTINGS_CATEGORIES_PATH);
  return { error: null };
}

export async function restoreCategoryAction(categoryId: string): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsed = categoryIdSchema.safeParse({ categoryId });
  if (!parsed.success) return { error: 'Kategori tidak valid' };

  try {
    await restoreCategory(user.id, parsed.data.categoryId);
  } catch (err) {
    return toSimpleResult(err);
  }
  revalidatePath(SETTINGS_CATEGORIES_PATH);
  return { error: null };
}

export async function deleteCategoryAction(categoryId: string): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsed = categoryIdSchema.safeParse({ categoryId });
  if (!parsed.success) return { error: 'Kategori tidak valid' };

  try {
    await deleteCategory(user.id, parsed.data.categoryId);
  } catch (err) {
    return toSimpleResult(err);
  }
  revalidatePath(SETTINGS_CATEGORIES_PATH);
  return { error: null };
}

export async function reorderCategoriesAction(orderedIds: string[]): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsed = reorderCategoriesSchema.safeParse({ orderedIds });
  if (!parsed.success) return { error: 'Urutan kategori tidak valid' };

  try {
    await reorderCategories(user.id, parsed.data.orderedIds);
  } catch (err) {
    return toSimpleResult(err);
  }
  revalidatePath(SETTINGS_CATEGORIES_PATH);
  return { error: null };
}

/**
 * Backs the delete confirmation dialog's "dipakai N transaksi" message
 * (tasks/06-categories/todo.md "Dialog hapus: bila terpakai, tampilkan
 * jumlah transaksi + tawarkan arsip") — a read, so it goes straight to the
 * query layer rather than a service function; scoped to the caller's own
 * `userId`, so it can never count another user's usage of a category id.
 */
export async function getCategoryUsageCountAction(categoryId: string): Promise<number> {
  const user = await requireUser();
  const parsed = categoryIdSchema.safeParse({ categoryId });
  if (!parsed.success) return 0;
  return getCategoryUsageCount(user.id, parsed.data.categoryId);
}
