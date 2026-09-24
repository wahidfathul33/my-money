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
 * Override mode gelap, dibaca dari deklarasi `--dark-*` di globals.css —
 * sumber tunggal nilainya. BUKAN dari blok di dalam `@media
 * (prefers-color-scheme: dark)`: sejak ada pengaturan tema, blok itu (dan
 * kembarannya `:root[data-theme='dark']`) hanya berisi pemasangan
 * `--color-x: var(--dark-x)`, bukan nilai warna.
 *
 * Regex-nya menuntut titik dua langsung setelah nama, jadi pemakaian
 * `var(--dark-bg)` di daftar pemasangan tidak ikut tertangkap — hanya
 * definisinya.
 */
function extractDarkTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const re = /--dark-([\w-]+):\s*([^;]+);/g;
  for (const match of css.matchAll(re)) {
    const [, name, value] = match;
    if (name && value) tokens[name] = value.trim();
  }
  if (Object.keys(tokens).length === 0) {
    throw new Error('Tidak ada token `--dark-*` di globals.css — mode gelap tidak bisa diuji');
  }
  return tokens;
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
  const darkOverrides = extractDarkTokens(css);
  return { light, dark: { ...light, ...darkOverrides } };
}
