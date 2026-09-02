# Todo — 01 Design System Foundation

## Token

- [ ] `globals.css` — blok `@theme` dengan token netral, merek, semantik finansial, status
- [ ] Varian mode gelap lewat `@media (prefers-color-scheme: dark)`
- [ ] Token tipografi (6 tingkat, tidak lebih)
- [ ] Kelas `.font-money` dengan `tabular-nums`
- [ ] Token spasi, radius, elevasi, gerak
- [ ] Verifikasi: mode gelap terlihat benar di `/kitchen-sink`

## Utilitas

- [ ] `src/lib/utils.ts` — `cn()` (clsx + tailwind-merge)
- [ ] `src/lib/finance/money.ts` — tipe `Money`, `MINOR_UNITS`, `fromRupiah`, `formatIDR`
- [ ] Unit test `formatIDR`: nol, positif, negatif, ≥ 1 miliar, pemisah ribuan

## Primitif

- [ ] `Button` — primary/secondary/ghost/danger × sm/md/lg, state loading & disabled
- [ ] `Input` — text/number/money, font-size ≥ 16px, state error
- [ ] `Select` — Radix, jadi sheet di mobile
- [ ] `Sheet` — Radix Dialog, varian bottom, `max-height: 85dvh`, grabber
- [ ] `Dialog` — padanan desktop, komponen bersama dengan Sheet
- [ ] `Card` — flat & raised
- [ ] `Tabs` — underline & segmented
- [ ] `Chip` — selectable & filter
- [ ] `Progress` — linear & ring
- [ ] `Skeleton` — text, card, list
- [ ] `Toast` — info/success/error, mendukung aksi undo, di atas bottom nav
- [ ] `EmptyState` — ikon, judul, deskripsi, CTA
- [ ] `Avatar`, `Switch`, `Checkbox`, `RadioGroup`

## MoneyText

- [ ] Implementasi sesuai [docs/07 §14.6](../../docs/07-design-system.md#146-contoh-moneytext)
- [ ] Peta varian sebagai konstanta modul
- [ ] `aria-label` naratif ("keluar Rp45.000")
- [ ] Unit test: positif, negatif, nol, `tone="neutral"`, `showSign`, tiap ukuran

## Kitchen Sink

- [ ] `/kitchen-sink` menampilkan setiap primitif × setiap varian × setiap state
- [ ] Bagian khusus `MoneyText` dengan nominal ekstrem
- [ ] Bagian empty state
- [ ] Bagian skeleton

## Test Otomatis

- [ ] Test kontras: hitung rasio dari token, gagal bila < 4,5:1 / 3:1, kedua mode
- [ ] Test ukuran target: setiap kontrol ≥ 44×44 px di viewport mobile
- [ ] E2E axe pada `/kitchen-sink` — nol pelanggaran

## Aksesibilitas

- [ ] Ring fokus di semua kontrol, offset 2px
- [ ] Tidak ada `outline: none` tanpa pengganti
- [ ] `prefers-reduced-motion` mematikan transform
- [ ] Fokus terjebak di Sheet/Dialog, kembali ke pemicu saat ditutup
- [ ] `<html lang="id">`

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Periksa manual `/kitchen-sink` di 360px, mode terang & gelap
- [ ] Tanpa horizontal overflow
