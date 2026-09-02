# Task 01 — Design System Foundation

**Fase:** F0 · **Bergantung pada:** 00 · **Dokumen:** [07-design-system](../../docs/07-design-system.md)

## Objektif

Membangun token desain dan primitif UI yang akan dipakai setiap layar sesudahnya.

Nilai utamanya bukan komponennya, melainkan **keputusan yang dikunci di dalamnya**: bagaimana uang ditampilkan, bagaimana warna membawa makna finansial, berapa tinggi minimum target sentuh. Keputusan yang ditegakkan komponen tidak perlu diingat ulang di setiap layar.

## Ruang Lingkup

**Termasuk:** token CSS (`@theme`), tipografi, spasi, **material & kaca**, radius konsentris, **sistem gerak berbasis pegas**, primitif UI, `MoneyText`, halaman kitchen-sink, test kontras otomatis.

**Tidak termasuk:** komponen sadar-domain selain `MoneyText` (menyusul di task modulnya), layout aplikasi (task 02).

## Token

Seluruh nilai OKLCH ada di [07-design-system §4–7](../../docs/07-design-system.md#4-warna). Salin apa adanya; jangan menyesuaikan "sedikit" tanpa memperbarui dokumennya.

**Aturan yang ditegakkan sejak sini:**
- Komponen tidak pernah menyebut warna mentah (`blue-500`). Hanya token semantik.
- Setiap nominal uang memakai `font-variant-numeric: tabular-nums`.
- Input di mobile ≥ 16px — di bawah itu iOS Safari melakukan zoom otomatis saat fokus.
- Hijau/merah dicadangkan untuk arah nilai finansial, tidak pernah untuk dekorasi.

## Primitif

Sesuai [07-design-system §14.1](../../docs/07-design-system.md#141-primitif): `Button` · `Input` · `Select` · `Sheet` · `Dialog` · `Card` · `Tabs` · `Chip` · `Progress` · `Skeleton` · `Toast` · `EmptyState` · `Avatar` · `Switch` · `Checkbox` · `RadioGroup`.

Dibangun di atas Radix UI. Radix memberi perilaku aksesibel (fokus terjebak, navigasi keyboard, ARIA) yang mahal dan mudah salah bila ditulis sendiri.

`Sheet` dan `Dialog` adalah komponen yang sama dengan varian presentasi berbeda — di mobile tampil sebagai bottom sheet, di desktop sebagai dialog terpusat. Menyatukannya sekarang mencegah setiap form ditulis dua kali nanti.

## `MoneyText`

Implementasi lengkap ada di [07-design-system §14.6](../../docs/07-design-system.md#146-contoh-moneytext). Ini komponen paling sering dipakai di seluruh aplikasi dan menjadi acuan gaya untuk semua komponen lain.

Perhatikan `aria-label` naratif: pembaca layar membaca "keluar Rp45.000", bukan "minus Rp45.000" yang terdengar seperti operasi matematika.

## Kriteria Penerimaan

- [ ] Seluruh token dari [07 §4–7](../../docs/07-design-system.md#4-warna) ada di `globals.css`, mode terang dan gelap.
- [ ] Halaman `/kitchen-sink` (khusus dev) menampilkan setiap primitif dalam setiap varian dan state.
- [ ] Test otomatis menghitung rasio kontras dari token dan gagal bila ada pasangan < 4,5:1 (teks) atau < 3:1 (komponen), di kedua mode.
- [ ] Setiap kontrol interaktif berukuran ≥ 44×44 px pada viewport mobile — diverifikasi test.
- [ ] `MoneyText` merender tanda, warna, dan `tabular-nums` dengan benar; punya unit test untuk positif, negatif, nol, dan nada `neutral`.
- [ ] `axe` melaporkan nol pelanggaran di `/kitchen-sink`.
- [ ] `prefers-reduced-motion` mematikan transform, menyisakan fade.
- [ ] `prefers-reduced-transparency` mengganti seluruh permukaan kaca menjadi solid.
- [ ] `@supports not (backdrop-filter)` punya fallback solid — diverifikasi dengan menonaktifkan dukungan.
- [ ] Radius konsentris: tombol di dalam kartu memakai `--radius-inner`, bukan `--radius-card`.
- [ ] `--ease-spring` di-generate dengan tool dan disetel di perangkat nyata, bukan disalin mentah.
- [ ] Sheet & dialog beranimasi masuk/keluar **tanpa JS**: `@starting-style` + `transition-behavior: allow-discrete`.
- [ ] Menu & tooltip memakai Popover API — tanpa `z-index` yang dikelola manual.
- [ ] Umpan balik tekan memakai properti `scale` dan `:has(:active)`, bukan class dari JS.
- [ ] `backdrop-filter` disertai `-webkit-` dan `@supports` yang menguji keduanya.
- [ ] **Tidak ada fitur CSS/JS yang hanya didukung satu mesin** — diverifikasi terhadap daftar di [07-design-system §2](../../docs/07-design-system.md#2-basis-css).
- [ ] Kontras teks di atas kaca diuji terhadap latar terburuk, bukan latar kosong.
- [ ] Ring fokus terlihat pada setiap kontrol; tidak ada `outline: none` tanpa pengganti.

## Verifikasi

```bash
npm run test          # unit MoneyText + test kontras + test ukuran target
npm run test:e2e      # axe pada /kitchen-sink
npm run dev           # periksa manual /kitchen-sink di 360px, mode terang & gelap
```

## Berkas yang Disentuh

Baru: `src/app/globals.css` · `src/components/ui/*` · `src/components/finance/money-text.tsx` · `src/lib/finance/money.ts` · `src/lib/utils.ts` · `src/app/kitchen-sink/page.tsx` · test terkait.

## Batasan

**Selalu:** token semantik, bukan warna mentah · varian sebagai konstanta modul, bukan ternary di JSX · aksesibilitas di dalam komponen, bukan ditambal belakangan.
**Tanya dulu:** menambah token warna baru · menyimpang dari nilai OKLCH di docs · memakai fitur di luar basis §2.
**Jangan:** `outline: none` tanpa ring pengganti · font-size < 16px pada input · warna sebagai satu-satunya penanda makna · menganimasikan angka finansial yang berubah · menambah library animasi · memakai `navigator.vibrate()`.

## Catatan

`src/lib/finance/money.ts` dibuat di task ini karena `MoneyText` membutuhkan `formatIDR`. Fungsi lain di modul itu (`multiplyRatio`, dsb.) menyusul di task 03 saat ledger dibangun.

Halaman `/kitchen-sink` tetap ada sepanjang proyek, tidak dibuang setelah task ini. Ia menjadi tempat memverifikasi komponen baru secara visual tanpa perlu data nyata.
