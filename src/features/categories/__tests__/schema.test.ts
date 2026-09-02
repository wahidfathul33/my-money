/**
 * Unit tests for the category Zod schemas — tasks/06-categories/spec.md
 * "system_key tidak dapat diisi lewat action mana pun — diverifikasi test."
 *
 * Structural proof, not just behavioral: `updateCategoryFormSchema` has no
 * `type` key in its shape at all (type can never change after creation —
 * docs/03 §7.3), and parsing an object with a `systemKey` field smuggled in
 * never lets it survive into the parsed output — Zod's default
 * unknown-key-stripping means there's no field for a malicious payload to
 * land in even before src/lib/services/categories.ts's own hardcoded
 * `systemKey: null` would apply.
 */
import { describe, expect, it } from 'vitest';
import {
  createCategoryFormSchema,
  updateCategoryFormSchema,
  categoryIdSchema,
  reorderCategoriesSchema,
} from '../schema';

describe('createCategoryFormSchema', () => {
  it('has no systemKey field in its shape', () => {
    expect('systemKey' in createCategoryFormSchema.shape).toBe(false);
  });

  it('parses valid input and drops an unknown systemKey field', () => {
    const parsed = createCategoryFormSchema.parse({
      name: 'Kopi',
      type: 'expense',
      icon: 'coffee',
      color: 'amber',
      parentId: '',
      systemKey: 'food_drinks', // not in the schema — must not survive parsing
    });
    expect(parsed).not.toHaveProperty('systemKey');
    expect(parsed.name).toBe('Kopi');
  });

  it('rejects an icon outside the curated set', () => {
    const result = createCategoryFormSchema.safeParse({
      name: 'Test',
      type: 'expense',
      icon: 'not-a-real-icon',
      color: 'amber',
      parentId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a color outside the curated palette', () => {
    const result = createCategoryFormSchema.safeParse({
      name: 'Test',
      type: 'expense',
      icon: 'tag',
      color: 'magenta',
      parentId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a blank name and a name over 40 characters', () => {
    expect(
      createCategoryFormSchema.safeParse({
        name: '   ',
        type: 'expense',
        icon: 'tag',
        color: 'slate',
        parentId: '',
      }).success,
    ).toBe(false);
    expect(
      createCategoryFormSchema.safeParse({
        name: 'x'.repeat(41),
        type: 'expense',
        icon: 'tag',
        color: 'slate',
        parentId: '',
      }).success,
    ).toBe(false);
  });

  it('normalizes an empty parentId string to undefined (no parent)', () => {
    const parsed = createCategoryFormSchema.parse({
      name: 'Kopi',
      type: 'expense',
      icon: 'coffee',
      color: 'amber',
      parentId: '',
    });
    expect(parsed.parentId).toBeUndefined();
  });
});

describe('updateCategoryFormSchema', () => {
  it('has no type field and no systemKey field in its shape — neither can ever be changed by this action', () => {
    expect('type' in updateCategoryFormSchema.shape).toBe(false);
    expect('systemKey' in updateCategoryFormSchema.shape).toBe(false);
  });

  it('drops smuggled type and systemKey fields on parse', () => {
    const parsed = updateCategoryFormSchema.parse({
      categoryId: '01973b6e-0000-7000-8000-000000000000',
      name: 'Renamed',
      icon: 'tag',
      color: 'slate',
      parentId: '',
      type: 'income',
      systemKey: 'food_drinks',
    });
    expect(parsed).not.toHaveProperty('type');
    expect(parsed).not.toHaveProperty('systemKey');
  });
});

describe('categoryIdSchema / reorderCategoriesSchema', () => {
  it('rejects a non-uuid categoryId', () => {
    expect(categoryIdSchema.safeParse({ categoryId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects an empty orderedIds array', () => {
    expect(reorderCategoriesSchema.safeParse({ orderedIds: [] }).success).toBe(false);
  });
});
