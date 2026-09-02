/**
 * Representasi & format uang — lihat docs/05-financial-integrity.md §"Money"
 * dan docs/08-copywriting.md §4 (format angka).
 *
 * STUB PARSIAL — task 01 (design-system-foundation) hanya butuh `Money`,
 * `MINOR_UNITS`, `fromRupiah`, dan `formatIDR` untuk `MoneyText`. Fungsi
 * ledger lain (`multiplyRatio`, alokasi, dsb.) dibangun di task 03
 * (database-foundation) yang berjalan paralel di worktree terpisah.
 *
 * Task 03 memiliki kepemilikan kanonis atas file ini. Saat merge, versi
 * task 03 harus superset dari kontrak di bawah — `Money`, `MINOR_UNITS`,
 * `fromRupiah`, `formatIDR` HARUS tetap ada dengan signature yang sama
 * (banyak komponen UI dari task ini mengimpornya), tinggal ditambah
 * fungsi lain di atasnya.
 */

/** Nominal uang dalam satuan minor (sen). Selalu bigint, tidak pernah number. */
export type Money = bigint;

/** Faktor skala: 1 rupiah = 100 satuan minor. */
export const MINOR_UNITS = 100n;

/** Mengubah nominal rupiah (angka/desimal manusia) menjadi satuan minor. */
export function fromRupiah(rupiah: number | string): Money {
  const [whole = '0', frac = ''] = String(rupiah).split('.');
  const cents = (frac + '00').slice(0, 2);
  return BigInt(whole) * MINOR_UNITS + BigInt(cents);
}

/**
 * Format IDR sesuai docs/08-copywriting §4: `Rp` menempel tanpa spasi,
 * pemisah ribuan titik, tanda minus (bukan hyphen) di depan `Rp`, nol
 * tetap `Rp0`.
 */
export function formatIDR(amount: Money): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const rupiah = abs / MINOR_UNITS;
  const formatted = 'Rp' + rupiah.toLocaleString('id-ID');
  return negative ? `−${formatted}` : formatted;
}
