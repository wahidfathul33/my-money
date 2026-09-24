'use client';

/**
 * Pemilih tema di `/settings/preferences` — "Ikuti sistem" (default),
 * "Terang", "Gelap".
 *
 * Satu-satunya pengaturan di halaman ini yang TIDAK lewat
 * `updatePreferencesAction`: temanya hidup di cookie, bukan di tabel
 * `users` (alasannya di src/lib/theme.ts). Praktisnya itu juga yang
 * membuat komponen ini tidak punya state error dan tidak perlu rollback —
 * menulis cookie + mengganti atribut `<html>` adalah operasi lokal yang
 * tidak bisa gagal di server, jadi tetap bekerja saat offline (aplikasi ini
 * PWA dengan service worker, lihat src/lib/pwa).
 *
 * Perubahannya langsung terlihat karena CSS yang membaca `data-theme`
 * (globals.css) — tidak ada `router.refresh()`, tidak ada re-render server.
 */
import { useState } from 'react';
import { RadioGroup } from '@/components/ui/radio-group';
import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  THEME_OPTIONS,
  parseTheme,
  themeAttribute,
  type ThemePreference,
} from '@/lib/theme';

interface ThemeSelectProps {
  /** Dibaca server-side dari cookie oleh page-nya — bukan dari `document.cookie` di efek, supaya nilai awalnya sudah benar saat render pertama dan tidak ada hydration mismatch. */
  theme: ThemePreference;
}

function persist(theme: ThemePreference) {
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax${secure}`;

  const attribute = themeAttribute(theme);
  if (attribute) {
    document.documentElement.dataset.theme = attribute;
  } else {
    // "Ikuti sistem" = tidak ada atribut sama sekali, bukan
    // `data-theme="system"` — lihat globals.css.
    delete document.documentElement.dataset.theme;
  }
}

export function ThemeSelect({ theme }: ThemeSelectProps) {
  const [value, setValue] = useState<ThemePreference>(theme);

  function handleChange(next: string) {
    const parsed = parseTheme(next);
    setValue(parsed);
    persist(parsed);
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-text text-sm font-medium">Tema</span>
      <span className="text-text-muted text-xs">
        Default mengikuti pengaturan perangkat. Pilihan ini berlaku untuk perangkat ini saja.
      </span>
      <RadioGroup
        label="Tema"
        options={THEME_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        value={value}
        onValueChange={handleChange}
        className="mt-1"
      />
    </div>
  );
}
