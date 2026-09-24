/**
 * Preferensi tema — "Sistem" (default), "Terang", atau "Gelap".
 *
 * Disimpan di cookie, BUKAN di `users` seperti preferensi lain: tema harus
 * sudah benar pada render pertama di SETIAP rute, termasuk `/signin` yang
 * belum punya sesi. Cookie bisa dibaca root layout tanpa query DB dan tanpa
 * menunggu JS, jadi tidak ada kedipan terang-lalu-gelap. Konsekuensinya
 * tema bersifat per perangkat — HP dan laptop bisa berbeda.
 *
 * Modul ini sengaja bebas `next/headers` dan bebas DOM supaya bisa diimpor
 * dari Server Component maupun Client Component.
 */
export const THEME_COOKIE = 'theme';

/** Satu tahun — preferensi tampilan, tidak ada alasan kedaluwarsa lebih cepat. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'Ikuti sistem' },
  { value: 'light', label: 'Terang' },
  { value: 'dark', label: 'Gelap' },
];

/** Cookie apa pun bisa diisi sembarang nilai oleh klien — apa pun yang tidak dikenali jatuh ke default "system". */
export function parseTheme(value: string | undefined | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/**
 * Nilai atribut `data-theme` di `<html>`. "system" sengaja TIDAK menulis
 * atribut sama sekali: tanpa atribut, `@media (prefers-color-scheme: dark)`
 * di globals.css yang berlaku — persis perilaku aplikasi sebelum pengaturan
 * ini ada.
 */
export function themeAttribute(theme: ThemePreference): 'light' | 'dark' | undefined {
  return theme === 'system' ? undefined : theme;
}
