# Task 20 — Dashboard

**Fase:** F5 · **Bergantung pada:** 19 · **Dokumen:** [09-screen §1 & §12](../../docs/09-screen-specs.md#1-home--dashboard), [01-product §4](../../docs/01-product-analysis.md#4-prioritas-informasi)

## Objektif

Dashboard pribadi dan ringkasan keluarga yang menjawab satu pertanyaan dengan cepat: *"apakah kondisi saya baik-baik saja?"*

Itu pertanyaan biner. Setiap kartu tambahan menaikkan waktu untuk sampai ke jawaban, bukan menurunkannya.

## Ruang Lingkup

**Termasuk:** dashboard pribadi, ringkasan keluarga, daftar langkah household baru, aturan tampil kondisional, optimasi performa.

**Tidak termasuk:** laporan mendalam (task 21).

## Prioritas Informasi

Sesuai [01-product §4](../../docs/01-product-analysis.md#4-prioritas-informasi):

1. Net worth (hero)
2. Kas tersedia
3. Arus kas bulan berjalan
4. Quick add — selalu terlihat, tidak pernah butuh scroll
5. Progress savings
6. Status budget
7. Jatuh tempo hutang/piutang
8. Transaksi terbaru (5 item)

**Aset dan liabilitas rinci tidak tampil di dashboard.** Sudah terangkum di net worth; rinciannya satu tap lebih dalam.

## Aturan Tampil Kondisional

Ini yang menjaga dashboard tetap ringkas:

| Bagian | Tampil bila |
|--------|-------------|
| Anggaran | Ada budget ≥ 80% terpakai |
| Perlu Perhatian | Ada jatuh tempo ≤ 7 hari atau yang telat |
| Tabungan | Ada goal aktif (maks 2, terdekat target date) |
| Transfer menunggu | Ada transfer pending masuk |
| Delta net worth | Riwayat ≥ 2 snapshot |

Budget yang sehat tidak butuh perhatian. Menampilkannya hanya menambah yang harus dibaca sebelum sampai ke jawaban.

## Performa

Rute ini punya anggaran paling ketat: LCP < 2,5 s, JS < 180 KB gzip.

Data utama diambil dalam **satu query gabungan** — saldo dompet, agregat bulan berjalan, snapshot terbaru, 5 transaksi terakhir. Sisanya paralel. Bukan waterfall.

## Kriteria Penerimaan

- [ ] Dashboard menampilkan hero net worth dengan delta dan sparkline 30 hari.
- [ ] Delta membandingkan snapshot hari ini dengan snapshot terakhir bulan sebelumnya.
- [ ] Riwayat < 2 snapshot → delta disembunyikan, bukan 0%.
- [ ] Dua tile berdampingan: Kas dan Bulan Ini (masuk/keluar).
- [ ] Kas **tidak** menyertakan kartu kredit.
- [ ] Seluruh bagian kondisional mengikuti aturan di atas.
- [ ] Transaksi terbaru tepat 5 item.
- [ ] FAB selalu terlihat tanpa scroll.
- [ ] Ringkasan keluarga menampilkan pengeluaran periode, siapa membayar apa, per kategori, budget, tabungan bersama, kekayaan + cakupan, anggota.
- [ ] Household baru menampilkan daftar langkah dengan progres; hilang setelah ketiganya tuntas.
- [ ] Langkah "Pilih transaksi" menawarkan penandaan massal transaksi lama.
- [ ] LCP < 2,5 s pada Moto G Power / 4G — diverifikasi Lighthouse CI.
- [ ] JS rute dashboard < 180 KB gzip.
- [ ] Data utama diambil satu query gabungan, bukan waterfall.
- [ ] Skeleton berukuran sama dengan konten akhir; CLS < 0,1.
- [ ] Empty state: belum ada dompet, belum ada transaksi.

## Verifikasi

```bash
npm run test:e2e     # aturan tampil kondisional + empty state
npm run build        # periksa ukuran bundle rute /
# PR → Lighthouse CI pada rute /
```

## Berkas yang Disentuh

Baru: `src/features/dashboard/{queries,components}` · `src/components/finance/stat-tile.tsx` · `src/features/household/components/household-summary.tsx` · test.
Diubah: `src/app/(app)/page.tsx` · `src/app/(app)/household/[householdId]/page.tsx`.

## Batasan

**Selalu:** satu query gabungan untuk data utama · sembunyikan bagian yang tidak perlu · skeleton seukuran konten akhir.
**Tanya dulu:** menambah kartu ke dashboard.
**Jangan:** menampilkan rincian aset/liabilitas di dashboard · waterfall query · menganimasikan angka yang berubah · membuat FAB butuh scroll.

## Catatan

**Godaan terbesar di task ini adalah menambah kartu.** Setiap penambahan harus melewati pertanyaan: apakah ini membantu menjawab "apakah kondisi saya baik-baik saja" lebih cepat, atau justru memperlambat?

Angka finansial **tidak dianimasikan menghitung naik**. Itu membuat orang menunggu untuk membaca angka yang sudah tersedia.
