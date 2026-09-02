import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Vite/Vitest dapat mentransformasi file ini sehingga `import.meta.url`
// tidak selalu berskema `file:` yang valid untuk `fileURLToPath` — pakai
// cwd (root proyek, tempat `vitest`/`next` selalu dijalankan) sebagai
// gantinya.
const GLOBALS_CSS_PATH = join(process.cwd(), 'src/app/globals.css');

/**
 * Ekstrak nilai `--color-*` langsung dari `globals.css` — bukan salinan
 * terpisah — supaya test kontras selalu menguji token yang benar-benar
 * dipakai aplikasi, bukan nilai yang bisa diam-diam menyimpang.
 */
function extractColorTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const re = /--color-([\w-]+):\s*([^;]+);/g;
  for (const match of css.matchAll(re)) {
    const [, name, value] = match;
    if (name && value) tokens[name] = value.trim();
  }
  return tokens;
}

/** Isi blok `{ ... }` pertama setelah `marker`, dengan penghitungan kurung seimbang. */
function extractBracedBlock(css: string, marker: string, label: string): string {
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`"${marker}" tidak ditemukan di globals.css (${label})`);
  const braceStart = css.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(braceStart + 1, i);
    }
  }
  throw new Error(`Kurung tidak seimbang setelah "${marker}" di globals.css (${label})`);
}

/** Isi blok pertama `@theme { ... }` di level teratas file (mode terang). */
function extractLightThemeBlock(css: string): string {
  return extractBracedBlock(css, '@theme', 'mode terang');
}

/**
 * Isi blok `:root { ... }` di dalam `@media (prefers-color-scheme: dark)`
 * (mode gelap). BUKAN `@theme` bersarang — lihat komentar di globals.css:
 * `@theme` tidak boleh dinest di dalam `@media`, kompiler Tailwind
 * menyatukannya jadi satu deklarasi `:root` tanpa syarat.
 */
function extractDarkRootBlock(css: string): string {
  const mediaStart = css.indexOf('@media (prefers-color-scheme: dark)');
  if (mediaStart === -1) throw new Error('Blok dark mode tidak ditemukan di globals.css');
  return extractBracedBlock(css.slice(mediaStart), ':root', 'mode gelap');
}

export interface DesignTokens {
  light: Record<string, string>;
  dark: Record<string, string>;
}

/**
 * Token warna terang & gelap, diparse langsung dari `src/app/globals.css`.
 * Mode gelap adalah override parsial atas mode terang (token yang tidak
 * disebut ulang tetap memakai nilai terang — sama seperti perilaku CSS
 * cascade sesungguhnya).
 */
export function readDesignTokens(): DesignTokens {
  const css = readFileSync(GLOBALS_CSS_PATH, 'utf-8');
  const light = extractColorTokens(extractLightThemeBlock(css));
  const darkOverrides = extractColorTokens(extractDarkRootBlock(css));
  return { light, dark: { ...light, ...darkOverrides } };
}
