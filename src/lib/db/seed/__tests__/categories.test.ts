/**
 * Unit tests for the canonical catalog itself — tasks/06-categories/todo.md
 * "Unit test: katalog tidak punya kunci duplikat". No DB involved; pure data
 * shape checks over the literal array.
 */
import { describe, expect, it } from 'vitest';
import { CATEGORY_CATALOG } from '../categories';

describe('CATEGORY_CATALOG', () => {
  it('has exactly 10 expense + 6 income entries, per docs/03 §7.1', () => {
    expect(CATEGORY_CATALOG).toHaveLength(16);
    expect(CATEGORY_CATALOG.filter((c) => c.type === 'expense')).toHaveLength(10);
    expect(CATEGORY_CATALOG.filter((c) => c.type === 'income')).toHaveLength(6);
  });

  it('has no duplicate systemKey values', () => {
    const keys = CATEGORY_CATALOG.map((c) => c.systemKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has no blank names, icons, or colors', () => {
    for (const entry of CATEGORY_CATALOG) {
      expect(entry.name.trim().length).toBeGreaterThan(0);
      expect(entry.icon.trim().length).toBeGreaterThan(0);
      expect(entry.color.trim().length).toBeGreaterThan(0);
    }
  });

  it('matches the exact keys and names from docs/03 §7.1', () => {
    const bySystemKey = Object.fromEntries(CATEGORY_CATALOG.map((c) => [c.systemKey, c]));

    expect(bySystemKey['food_drinks']).toMatchObject({ name: 'Makan & Minum', type: 'expense' });
    expect(bySystemKey['transport']).toMatchObject({ name: 'Transportasi', type: 'expense' });
    expect(bySystemKey['shopping']).toMatchObject({ name: 'Belanja', type: 'expense' });
    expect(bySystemKey['bills']).toMatchObject({ name: 'Tagihan', type: 'expense' });
    expect(bySystemKey['entertainment']).toMatchObject({ name: 'Hiburan', type: 'expense' });
    expect(bySystemKey['health']).toMatchObject({ name: 'Kesehatan', type: 'expense' });
    expect(bySystemKey['education']).toMatchObject({ name: 'Pendidikan', type: 'expense' });
    expect(bySystemKey['insurance']).toMatchObject({ name: 'Asuransi', type: 'expense' });
    expect(bySystemKey['donation']).toMatchObject({ name: 'Donasi', type: 'expense' });
    expect(bySystemKey['other_out']).toMatchObject({ name: 'Lainnya', type: 'expense' });

    expect(bySystemKey['salary']).toMatchObject({ name: 'Gaji', type: 'income' });
    expect(bySystemKey['freelance']).toMatchObject({ name: 'Freelance', type: 'income' });
    expect(bySystemKey['business']).toMatchObject({ name: 'Bisnis', type: 'income' });
    expect(bySystemKey['investment']).toMatchObject({ name: 'Investasi', type: 'income' });
    expect(bySystemKey['gift']).toMatchObject({ name: 'Hadiah', type: 'income' });
    expect(bySystemKey['other_in']).toMatchObject({ name: 'Lainnya', type: 'income' });
  });
});
