# Todo — 02 App Shell & Navigation

## Layout

- [ ] `app/layout.tsx` — `<html lang="id">`, font via `next/font`, metadata
- [ ] `app/(app)/layout.tsx` — shell aplikasi
- [ ] `AppShell` — memilih bottom nav / rail / sidebar berdasarkan breakpoint

## Bottom Nav (mobile)

- [ ] 5 slot: Home · Transaksi · **+** · Kekayaan · Lainnya
- [ ] FAB di tengah, menonjol, `--shadow-fab`
- [ ] State aktif dari `usePathname()`, berfungsi pada nested route
- [ ] `padding-bottom: env(safe-area-inset-bottom)`
- [ ] Setiap slot ≥ 44×44 px
- [ ] Menu "Lainnya" → sheet berisi Keluarga (nonaktif), Dompet, Budget, Laporan, Pengaturan

## Sidebar (desktop ≥ 1024px)

- [ ] Sidebar persisten 240px
- [ ] Urutan item mempertahankan hierarki mobile
- [ ] Tombol "+ Tambah" di bawah
- [ ] Konten `max-w-5xl`

## Rail (tablet 768–1023px)

- [ ] Rail ikon 72px
- [ ] Tooltip pada hover

## Spasi Konten

- [ ] `padding-bottom` konten = tinggi nav + safe area
- [ ] Verifikasi: daftar 50 item — item terakhir tidak tertutup nav

## Sheet FAB

- [ ] Tap FAB membuka sheet placeholder
- [ ] URL tidak berubah
- [ ] Back menutup sheet, bukan meninggalkan halaman
- [ ] Di desktop membuka Dialog, bukan Sheet

## Boundary

- [ ] `app/error.tsx`
- [ ] `app/(app)/error.tsx` — shell tetap utuh
- [ ] `app/not-found.tsx`
- [ ] `loading.tsx` dengan skeleton untuk rute yang ada
- [ ] Logging: nama rute saja, tanpa data finansial

## Halaman Placeholder

- [ ] `/`, `/transactions`, `/wealth`, `/settings` — placeholder minimal agar navigasi dapat diuji

## Performa

- [ ] `lighthouse-budget.json` — LCP 2500ms, CLS 0.1, script 180 KB
- [ ] Job `lighthouse` di GitHub Actions terhadap preview URL
- [ ] Verifikasi: sengaja tambahkan dependensi besar → build gagal → cabut kembali

## Test

- [ ] E2E responsif: 360/375/390/430/768/1024/1440, semua rute, tanpa horizontal overflow
- [ ] E2E: navigasi keyboard, urutan fokus logis
- [ ] E2E: axe pada seluruh rute placeholder
- [ ] E2E: FAB membuka sheet, back menutupnya
- [ ] E2E: safe area dihormati pada emulasi iPhone

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] `npm run test:e2e` hijau
- [ ] Lighthouse CI hijau di PR
- [ ] Periksa manual di 360px: seluruh aksi primer terjangkau satu tangan
