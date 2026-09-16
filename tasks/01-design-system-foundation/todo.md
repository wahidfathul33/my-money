# Todo — 01 Design System Foundation

## Token

- [x] `globals.css` — blok `@theme` dengan token netral, merek, semantik finansial, status
- [x] Varian mode gelap lewat `@media (prefers-color-scheme: dark)`
- [x] Token tipografi (6 tingkat, tidak lebih)
- [x] Kelas `.font-money` dengan `tabular-nums`
- [x] Token spasi, radius, elevasi, gerak
- [x] Verifikasi: mode gelap terlihat benar di `/kitchen-sink`

## Utilitas

- [x] `src/lib/utils.ts` — `cn()` (clsx + tailwind-merge)
- [x] `src/lib/finance/money.ts` — tipe `Money`, `MINOR_UNITS`, `fromRupiah`, `formatIDR`
- [x] Unit test `formatIDR`: nol, positif, negatif, ≥ 1 miliar, pemisah ribuan

## Primitif

- [x] `Button` — primary/secondary/ghost/danger × sm/md/lg, state loading & disabled
- [x] `Input` — text/number/money, font-size ≥ 16px, state error
- [x] `Select` — Radix, jadi sheet di mobile
- [x] `Sheet` — Radix Dialog, varian bottom, `max-height: 85dvh`, grabber
- [x] `Dialog` — padanan desktop, komponen bersama dengan Sheet
- [x] `Card` — flat & raised
- [x] `Tabs` — underline & segmented
- [x] `Chip` — selectable & filter
- [x] `Progress` — linear & ring
- [x] `Skeleton` — text, card, list
- [x] `Toast` — info/success/error, mendukung aksi undo, di atas bottom nav
- [x] `EmptyState` — ikon, judul, deskripsi, CTA
- [x] `Avatar`, `Switch`, `Checkbox`, `RadioGroup`

## MoneyText

- [x] Implementasi sesuai [docs/07 §14.6](../../docs/07-design-system.md#146-contoh-moneytext)
- [x] Peta varian sebagai konstanta modul
- [x] `aria-label` naratif ("keluar Rp45.000")
- [x] Unit test: positif, negatif, nol, `tone="neutral"`, `showSign`, tiap ukuran

## Kitchen Sink

- [x] `/kitchen-sink` menampilkan setiap primitif × setiap varian × setiap state
- [x] Bagian khusus `MoneyText` dengan nominal ekstrem
- [x] Bagian empty state
- [x] Bagian skeleton

## Test Otomatis

- [x] Test kontras: hitung rasio dari token, gagal bila < 4,5:1 / 3:1, kedua mode
- [x] Test ukuran target: setiap kontrol ≥ 44×44 px di viewport mobile
- [x] E2E axe pada `/kitchen-sink` — nol pelanggaran

## Aksesibilitas

- [x] Ring fokus di semua kontrol, offset 2px
- [x] Tidak ada `outline: none` tanpa pengganti
- [x] `prefers-reduced-motion` mematikan transform
- [x] Fokus terjebak di Sheet/Dialog, kembali ke pemicu saat ditutup
- [x] `<html lang="id">`

## Verifikasi Akhir

- [x] `npm run verify` hijau
- [x] Periksa manual `/kitchen-sink` di 360px, mode terang & gelap
- [x] Tanpa horizontal overflow
