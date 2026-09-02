/**
 * Unit tests for the curated icon set — tasks/06-categories/spec.md
 * "Pemilih ikon menampilkan ~60 ikon terkurasi dengan pencarian."
 */
import { describe, expect, it } from 'vitest';
import { CATEGORY_CATALOG } from '@/lib/db/seed/categories';
import { ALL_ICONS, ICON_GROUPS, ICONS, isIconName, searchIcons } from '../icons';

describe('ICON_DEFS / ALL_ICONS', () => {
  it('has roughly 60 curated, picker-visible icons', () => {
    expect(ALL_ICONS.length).toBeGreaterThanOrEqual(55);
    expect(ALL_ICONS.length).toBeLessThanOrEqual(65);
  });

  it('has no duplicate names', () => {
    const names = ALL_ICONS.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every entry resolves through ICONS to an actual component', () => {
    for (const def of ALL_ICONS) {
      expect(ICONS[def.name as keyof typeof ICONS]).toBe(def.component);
    }
  });

  it('ICON_GROUPS partitions ALL_ICONS with no overlap and no gaps', () => {
    const fromGroups = ICON_GROUPS.flatMap((g) => g.icons.map((i) => i.name));
    expect(new Set(fromGroups).size).toBe(fromGroups.length);
    expect(fromGroups.length).toBe(ALL_ICONS.length);
  });
});

describe('every CATEGORY_CATALOG icon resolves', () => {
  it.each(CATEGORY_CATALOG.map((c) => [c.systemKey, c.icon] as const))(
    '%s -> icon "%s" is a valid IconName',
    (_systemKey, icon) => {
      expect(isIconName(icon)).toBe(true);
    },
  );
});

describe('DB icon defaults resolve', () => {
  it.each(['tag', 'target', 'dompet'])('"%s" is a valid IconName', (icon) => {
    expect(isIconName(icon)).toBe(true);
  });
});

describe('searchIcons', () => {
  it('returns everything for an empty query', () => {
    expect(searchIcons('')).toHaveLength(ALL_ICONS.length);
    expect(searchIcons('   ')).toHaveLength(ALL_ICONS.length);
  });

  it('matches by name substring', () => {
    const results = searchIcons('shop');
    expect(results.some((r) => r.name === 'shopping-bag')).toBe(true);
    expect(results.some((r) => r.name === 'shopping-cart')).toBe(true);
  });

  it('matches by Indonesian label, case-insensitively', () => {
    const results = searchIcons('kesehatan');
    expect(results.some((r) => r.name === 'heart-pulse')).toBe(true);
  });

  it('matches by keyword', () => {
    const results = searchIcons('bioskop');
    expect(results.some((r) => r.name === 'popcorn')).toBe(true);
  });

  it('is unmatched for nonsense queries', () => {
    expect(searchIcons('zzzznotarealicon')).toHaveLength(0);
  });
});

describe('isIconName', () => {
  it('rejects values not in the curated set', () => {
    expect(isIconName('not-a-real-icon')).toBe(false);
    expect(isIconName('')).toBe(false);
  });
});
