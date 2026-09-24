import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_OPTIONS, parseTheme, themeAttribute } from '../theme';

describe('parseTheme', () => {
  it('menerima pilihan eksplisit', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
  });

  it('jatuh ke "system" untuk cookie kosong, hilang, atau sampah', () => {
    // Cookie sepenuhnya di bawah kendali klien — nilai apa pun bisa masuk,
    // dan apa pun yang tidak dikenali harus berakhir di default, bukan
    // diteruskan mentah-mentah ke atribut `data-theme`.
    for (const input of [undefined, null, '', 'system', 'DARK', 'dark; rm -rf', '__proto__']) {
      expect(parseTheme(input)).toBe('system');
    }
  });
});

describe('themeAttribute', () => {
  it('tidak merender atribut untuk "system" — biar @media yang berlaku', () => {
    expect(themeAttribute('system')).toBeUndefined();
  });

  it('merender nilai untuk pilihan eksplisit', () => {
    expect(themeAttribute('light')).toBe('light');
    expect(themeAttribute('dark')).toBe('dark');
  });
});

/**
 * Kontrak antara src/lib/theme.ts dan src/app/globals.css: setiap nilai
 * `data-theme` yang mungkin ditulis layout harus punya aturan CSS-nya.
 * Tanpa test ini, menambah opsi tema baru (mis. "high contrast") akan
 * terlihat berhasil di UI tapi tidak mengubah satu warna pun.
 */
describe('data-theme punya pasangan aturan di globals.css', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8');

  it.each(THEME_OPTIONS.map((option) => option.value))('%s', (theme) => {
    const attribute = themeAttribute(theme);
    if (!attribute) {
      // "system" justru harus TIDAK punya selector — perilakunya berasal
      // dari media query, dan `:root:not([data-theme='light'])` yang
      // menjaganya tetap menang atas preferensi OS.
      expect(css).toContain("@media (prefers-color-scheme: dark)");
      expect(css).toContain(":root:not([data-theme='light'])");
      return;
    }
    expect(css).toContain(`:root[data-theme='${attribute}']`);
  });
});
