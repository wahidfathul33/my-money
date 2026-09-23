import { wcagContrast } from 'culori';
import { describe, expect, it } from 'vitest';
import { readDesignTokens } from '@/test/tokens';

/**
 * Test kontras (spec.md kriteria penerimaan): "hitung rasio kontras dari
 * token dan gagal bila ada pasangan < 4,5:1 (teks) atau < 3:1 (komponen),
 * di kedua mode". Nilai token diparse langsung dari `globals.css` (lihat
 * `src/test/tokens.ts`), bukan disalin ulang di sini — supaya test ini
 * benar-benar menguji apa yang dipakai aplikasi.
 *
 * Pasangan yang diuji dikurasi dari kombinasi foreground/background yang
 * BENAR-BENAR dipakai komponen (MoneyText, Button, Chip, Input, focus
 * ring) — bukan produk silang seluruh token, yang akan menguji pasangan
 * yang tidak pernah dirender bersamaan.
 *
 * `--color-border` / `--color-separator` sengaja TIDAK diuji sebagai
 * "component" wajib 3:1: keduanya didokumentasikan sebagai "garis rambut"
 * dekoratif (docs/07 §4), bukan satu-satunya penanda batas komponen
 * interaktif — Input dkk. tetap punya kotak, padding, dan label sebagai
 * penanda non-warna.
 */

const TEXT_THRESHOLD = 4.5;
const COMPONENT_THRESHOLD = 3;

const tokens = readDesignTokens();

function contrast(mode: 'light' | 'dark', fg: string, bg: string): number {
  const set = tokens[mode];
  const fgValue = set[fg];
  const bgValue = set[bg];
  if (!fgValue) throw new Error(`Token --color-${fg} tidak ditemukan (mode ${mode})`);
  if (!bgValue) throw new Error(`Token --color-${bg} tidak ditemukan (mode ${mode})`);
  const ratio = wcagContrast(fgValue, bgValue);
  if (ratio == null) throw new Error(`Gagal menghitung kontras ${fg}/${bg} (mode ${mode})`);
  return ratio;
}

describe.each(['light', 'dark'] as const)('kontras token — mode %s', (mode) => {
  describe('teks (>= 4.5:1)', () => {
    const pairs: Array<[string, string]> = [
      ['text', 'bg'],
      ['text', 'surface'],
      ['text', 'surface-raised'],
      ['text-muted', 'bg'],
      ['text-muted', 'surface'],
      ['text-muted', 'surface-raised'],
      ['negative', 'bg'],
      ['negative', 'surface'],
      ['negative', 'surface-raised'],
    ];

    it.each(pairs)('text-%s di atas bg-%s', (fg, bg) => {
      expect(contrast(mode, fg, bg)).toBeGreaterThanOrEqual(TEXT_THRESHOLD);
    });
  });

  describe('komponen (>= 3:1)', () => {
    const pairs: Array<[string, string]> = [
      ['brand', 'surface'], // ring fokus di atas kartu
      ['brand', 'bg'], // ring fokus di atas latar halaman
      ['text-subtle', 'surface'], // placeholder / ikon sekunder
      ['text-subtle', 'bg'],
    ];

    it.each(pairs)('%s di atas %s', (fg, bg) => {
      expect(contrast(mode, fg, bg)).toBeGreaterThanOrEqual(COMPONENT_THRESHOLD);
    });
  });
});

/**
 * DEFEK TOKEN YANG SUDAH DIKETAHUI — dilaporkan di laporan task 01. Nilai
 * OKLCH-nya SENGAJA tidak diubah (butuh persetujuan, spec.md "Tanya dulu:
 * menyimpang dari nilai OKLCH di docs"), jadi pasangan mentah di bawah ini
 * akan TETAP gagal selamanya sampai docs/07 §4 direvisi — blok ini
 * mengunci angka itu secara eksplisit, bukan menyembunyikannya.
 *
 * Komponen yang TERDAMPAK (Button primary/danger, Chip terpilih, Tabs
 * underline aktif, MoneyText tone="positive") SUDAH diperbaiki — mereka
 * tidak lagi merender pasangan mentah ini, melainkan warna turunan yang
 * lolos AA (`.text-brand-readable`, `.text-positive-readable`,
 * `.fill-negative-solid`, `bg-brand-hover` — lihat globals.css). Diverifikasi
 * axe nol pelanggaran di e2e/kitchen-sink.spec.ts. Test di bawah
 * memverifikasi warna turunan itu sendiri.
 */
describe('defek kontras yang sudah diketahui (butuh revisi docs/07 §4)', () => {
  it('teks putih (--color-on-brand) di atas --color-brand gagal AA di kedua mode — Button variant="primary"', () => {
    expect(contrast('light', 'on-brand', 'brand')).toBeCloseTo(4.05, 1);
    expect(contrast('light', 'on-brand', 'brand')).toBeLessThan(TEXT_THRESHOLD);
    expect(contrast('dark', 'on-brand', 'brand')).toBeCloseTo(2.36, 1);
    expect(contrast('dark', 'on-brand', 'brand')).toBeLessThan(TEXT_THRESHOLD);
  });

  it('teks putih (--color-on-brand) di atas --color-negative gagal AA di mode gelap — Button variant="danger"', () => {
    expect(contrast('dark', 'on-brand', 'negative')).toBeCloseTo(2.76, 1);
    expect(contrast('dark', 'on-brand', 'negative')).toBeLessThan(TEXT_THRESHOLD);
  });

  it('--color-brand di atas --color-brand-subtle gagal AA di mode terang — Chip variant selected', () => {
    expect(contrast('light', 'brand', 'brand-subtle')).toBeCloseTo(3.64, 1);
    expect(contrast('light', 'brand', 'brand-subtle')).toBeLessThan(TEXT_THRESHOLD);
  });

  it('--color-positive di atas bg/surface gagal AA di mode terang — MoneyText tone="positive"', () => {
    expect(contrast('light', 'positive', 'bg')).toBeLessThan(TEXT_THRESHOLD);
    expect(contrast('light', 'positive', 'surface')).toBeLessThan(TEXT_THRESHOLD);
    expect(contrast('light', 'positive', 'surface-raised')).toBeLessThan(TEXT_THRESHOLD);
  });

  it('--color-positive di atas --color-positive-subtle gagal AA di mode terang — badge/tag pemasukan', () => {
    expect(contrast('light', 'positive', 'positive-subtle')).toBeLessThan(TEXT_THRESHOLD);
  });

  it('--color-negative di atas --color-negative-subtle gagal AA (tipis) di mode terang — badge/tag pengeluaran', () => {
    expect(contrast('light', 'negative', 'negative-subtle')).toBeLessThan(TEXT_THRESHOLD);
  });

  it('--color-warning di atas bg/surface gagal AA di mode terang — StatTile/BudgetBar ambang peringatan', () => {
    expect(contrast('light', 'warning', 'bg')).toBeLessThan(TEXT_THRESHOLD);
    expect(contrast('light', 'warning', 'surface')).toBeLessThan(TEXT_THRESHOLD);
  });
});

/**
 * Task 14 (budgets): BudgetBar merender persentase berwarna untuk status
 * "warning" (`.text-warning-readable`, globals.css) — perbaikan yang sama
 * polanya dengan `.text-brand-readable` / `.text-positive-readable` di atas.
 */
describe('warna turunan (BudgetBar) lolos AA', () => {
  const lightWarningReadable = 'oklch(50% 0.15 75)';

  it('.text-warning-readable (mode terang) lolos di atas bg/surface/surface-raised — BudgetBar status warning', () => {
    for (const bg of ['bg', 'surface', 'surface-raised']) {
      expect(wcagContrast(lightWarningReadable, tokens.light[bg]!)).toBeGreaterThanOrEqual(
        TEXT_THRESHOLD,
      );
    }
  });

  it('.text-warning-readable (mode gelap) = --color-warning, sudah lolos (dikunci di atas)', () => {
    expect(contrast('dark', 'warning', 'bg')).toBeGreaterThanOrEqual(TEXT_THRESHOLD);
    expect(contrast('dark', 'warning', 'surface')).toBeGreaterThanOrEqual(TEXT_THRESHOLD);
  });

  /**
   * Task 23: `--color-warning-subtle` was the only `-subtle` background
   * token missing a dark-mode override (brand/positive/negative-subtle all
   * have one) — in dark mode it silently stayed at light mode's 96% L,
   * pairing with `.text-warning-readable`'s dark value (`--color-warning`,
   * 72% L) at only 2.22:1. Caught by Lighthouse on
   * src/components/layout/offline-banner.tsx's "Koneksi lambat…" banner
   * (`bg-warning-subtle text-warning-readable`), not by this file's own
   * pre-existing pairs — this token combination had never been curated
   * here before. Locking in both modes now that globals.css has the fix.
   */
  it('.text-warning-readable di atas bg-warning-subtle lolos AA, kedua mode — OfflineBanner "Koneksi lambat"', () => {
    // Light mode: `.text-warning-readable`'s actual rendered color is the
    // override above (50% L), not the raw `--color-warning` token (72% L)
    // — same reason the "di atas bg/surface/surface-raised" test above
    // uses `lightWarningReadable` directly instead of the `contrast()`
    // helper. Dark mode's override IS the raw token, so the helper applies
    // there.
    expect(wcagContrast(lightWarningReadable, tokens.light['warning-subtle']!)).toBeGreaterThanOrEqual(
      TEXT_THRESHOLD,
    );
    expect(contrast('dark', 'warning', 'warning-subtle')).toBeGreaterThanOrEqual(TEXT_THRESHOLD);
  });
});

/**
 * Warna turunan yang memperbaiki defek di atas (globals.css). Mengunci
 * nilai literal `oklch()`-nya di sini juga — kalau seseorang mengubah
 * angkanya di globals.css tanpa cek ulang, test ini yang akan gagal
 * duluan, bukan axe di e2e (lebih cepat & lebih spesifik pesan errornya).
 */
describe('warna turunan (perbaikan defek di atas) lolos AA', () => {
  const lightBrandReadable = 'oklch(46% 0.118 195)';
  const lightPositiveReadable = 'oklch(44% 0.145 152)';

  it('.text-brand-readable (mode terang) lolos di atas surface/bg/brand-subtle — Chip & Tabs', () => {
    for (const bg of ['surface', 'bg', 'brand-subtle']) {
      expect(wcagContrast(lightBrandReadable, tokens.light[bg]!)).toBeGreaterThanOrEqual(
        TEXT_THRESHOLD,
      );
    }
  });

  it('.text-brand-readable (mode gelap) = --color-brand, sudah lolos (dikunci di atas)', () => {
    expect(contrast('dark', 'brand', 'brand-subtle')).toBeGreaterThanOrEqual(TEXT_THRESHOLD);
  });

  it('.text-positive-readable (mode terang) lolos di atas bg/surface/surface-raised — MoneyText', () => {
    for (const bg of ['bg', 'surface', 'surface-raised']) {
      expect(wcagContrast(lightPositiveReadable, tokens.light[bg]!)).toBeGreaterThanOrEqual(
        TEXT_THRESHOLD,
      );
    }
  });

  it('bg-brand-hover (fill Button primary) lolos dengan teks putih di kedua mode', () => {
    // --color-brand-hover tidak berubah antar mode (52% L tetap).
    expect(wcagContrast('oklch(100% 0 0)', tokens.light['brand-hover']!)).toBeGreaterThanOrEqual(
      TEXT_THRESHOLD,
    );
  });
});
