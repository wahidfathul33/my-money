/**
 * Zod schemas for the categories Server Actions — docs/11-tech-architecture.md
 * §2 ("schema.ts ← skema Zod"). Parses `FormData` (the sheet form posts
 * native `<form action={formAction}>`, same shape as
 * src/app/onboarding/actions.ts).
 *
 * Deliberately absent: any `systemKey` or `type`-on-update field. This is
 * itself part of tasks/06-categories/spec.md's "system_key tidak dapat
 * diisi lewat action mana pun" — a field a schema doesn't parse can't reach
 * the service no matter what a client sends in the POST body.
 */
import { z } from 'zod';
import { isIconName } from '@/lib/icons';
import { isCategoryColor } from '@/lib/services/categories';

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Nama kategori wajib diisi')
  .max(40, 'Nama kategori maksimal 40 karakter');

export const categoryTypeSchema = z.enum(['expense', 'income'], {
  message: 'Jenis kategori tidak valid',
});

export const categoryIconSchema = z.string().refine(isIconName, { message: 'Ikon tidak valid' });

export const categoryColorSchema = z
  .string()
  .refine(isCategoryColor, { message: 'Warna tidak valid' });

/** FormData's native "no selection" is `''`, not absence — normalize both to `undefined`. */
const optionalUuid = z
  .string()
  .transform((v) => (v.trim() === '' ? undefined : v))
  .pipe(z.uuid('Induk kategori tidak valid').optional());

export const createCategoryFormSchema = z.object({
  name: categoryNameSchema,
  type: categoryTypeSchema,
  icon: categoryIconSchema,
  color: categoryColorSchema,
  parentId: optionalUuid,
});

export const updateCategoryFormSchema = z.object({
  categoryId: z.uuid(),
  name: categoryNameSchema,
  icon: categoryIconSchema,
  color: categoryColorSchema,
  parentId: optionalUuid,
});

export const categoryIdSchema = z.object({
  categoryId: z.uuid('Kategori tidak valid'),
});

export const reorderCategoriesSchema = z.object({
  orderedIds: z.array(z.uuid()).min(1, 'Daftar kategori kosong'),
});
