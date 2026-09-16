# Todo — 02 App Shell & Navigation

## Layout

- [x] `app/layout.tsx` — `<html lang="id">`, font via `next/font`, metadata
- [x] `app/(app)/layout.tsx` — shell aplikasi
- [x] `AppShell` — memilih bottom nav / rail / sidebar berdasarkan breakpoint

## Bottom Nav (mobile)

- [x] 5 slot: Home · Transaksi · **+** · Kekayaan · Lainnya
- [x] FAB di tengah, menonjol, `--shadow-fab`
- [x] State aktif dari `usePathname()`, berfungsi pada nested route
- [x] `padding-bottom: env(safe-area-inset-bottom)`
- [x] Setiap slot ≥ 44×44 px
- [x] Menu "Lainnya" → sheet berisi Keluarga (nonaktif), Dompet, Budget, Laporan, Pengaturan

## Sidebar (desktop ≥ 1024px)

- [x] Sidebar persisten 240px
- [x] Urutan item mempertahankan hierarki mobile
- [x] Tombol "+ Tambah" di bawah
- [x] Konten `max-w-5xl`

## Rail (tablet 768–1023px)

- [x] Rail ikon 72px
- [x] Tooltip pada hover

## Spasi Konten

- [x] `padding-bottom` konten = tinggi nav + safe area
- [x] Verifikasi: daftar 50 item — item terakhir tidak tertutup nav

## Sheet FAB

- [x] Tap FAB membuka sheet placeholder
- [x] URL tidak berubah
- [x] Back menutup sheet, bukan meninggalkan halaman
- [x] Di desktop membuka Dialog, bukan Sheet

## Boundary

- [x] `app/error.tsx`
- [x] `app/(app)/error.tsx` — shell tetap utuh
- [x] `app/not-found.tsx`
- [x] `loading.tsx` dengan skeleton untuk rute yang ada
- [x] Logging: nama rute saja, tanpa data finansial

## Halaman Placeholder

- [x] `/`, `/transactions`, `/wealth`, `/settings` — placeholder minimal agar navigasi dapat diuji

## Performa

- [x] `lighthouse-budget.json` — LCP 2500ms, CLS 0.1, script 180 KB
- [ ] Job `lighthouse` di GitHub Actions terhadap preview URL
- [x] Verifikasi: sengaja tambahkan dependensi besar → build gagal → cabut kembali

## Test

- [x] E2E responsif: 360/375/390/430/768/1024/1440, semua rute, tanpa horizontal overflow
- [x] E2E: navigasi keyboard, urutan fokus logis
- [x] E2E: axe pada seluruh rute placeholder
- [x] E2E: FAB membuka sheet, back menutupnya
- [x] E2E: safe area dihormati pada emulasi iPhone

## Verifikasi Akhir

- [x] `npm run verify` hijau
- [x] `npm run test:e2e` hijau
- [ ] Lighthouse CI hijau di PR
- [x] Periksa manual di 360px: seluruh aksi primer terjangkau satu tangan
