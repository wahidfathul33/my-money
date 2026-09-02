# Task 21 — Reports & Analytics

**Fase:** F5 · **Bergantung pada:** 09, 19 · **Dokumen:** [09-screen §9](../../docs/09-screen-specs.md#9-reports--reports), [01-product §2.9](../../docs/01-product-analysis.md#29-insight)

## Objektif

Laporan pribadi dan household, dengan chart yang **benar-benar membantu pemahaman** — bukan chart demi chart.

## Ruang Lingkup

**Termasuk:** income vs expense, pengeluaran per kategori, kategori terbesar, arus kas, pertumbuhan tabungan, laporan household (per kategori & per anggota), ekspor CSV.

**Tidak termasuk:** laporan kustom · penjadwalan laporan.

## Aturan Chart di Mobile

Ini yang membedakan laporan yang dipakai dari yang diabaikan:

- **Tidak ada horizontal scroll.** Kalau data tidak muat, kurangi kategorinya (gabungkan ekor menjadi "Lainnya"), jangan gulir.
- Maksimal 6 seri; sisanya digabung.
- Label sumbu tidak dirotasi. Kalau tidak muat, persingkat (`Sep` bukan `September`).
- **Selalu ada tabel data di bawah chart.** Chart untuk pola, angka untuk kepastian.
- Bar horizontal, bukan pie. Pada 360px, pie dengan 5 irisan dan legenda tidak terbaca.

## Performa

Recharts di-`dynamic()` import dan hanya dimuat di rute laporan. Anggaran rute ini 280 KB gzip — lebih longgar dari dashboard, tetapi tetap ditegakkan.

## Ekspor CSV

Data finansial adalah hasil kerja pengguna mencatat bertahun-tahun. Tidak bisa mengeluarkannya adalah masalah kepercayaan.

Ekspor mencakup **hanya data milik user sendiri** — bukan data anggota household lain, meskipun terlihat olehnya.

## Kriteria Penerimaan

- [ ] Income vs expense: bar berkelompok, 6 bulan terakhir.
- [ ] Pengeluaran per kategori: bar horizontal terurut menurun, dengan persentase.
- [ ] Kategori terbesar: 3 teratas dengan perbandingan terhadap bulan lalu.
- [ ] Arus kas: line chart saldo kumulatif.
- [ ] Pertumbuhan tabungan: Σ kontribusi non-void, konsisten dengan net worth.
- [ ] Laporan household: kategori bawaan dikelompokkan lewat `system_key` (eksak); kategori kustom tampil sebagai baris sendiri dengan nama pemilik.
- [ ] Transfer dan kontribusi savings dikecualikan dari agregasi income/expense.
- [ ] Transaksi ter-void dikecualikan.
- [ ] **Tidak ada horizontal scroll di 360px** — diverifikasi test.
- [ ] Kategori di luar 6 teratas digabung menjadi "Lainnya".
- [ ] Setiap chart disertai tabel data.
- [ ] Batas periode memakai zona waktu yang benar (user / household).
- [ ] Recharts hanya dimuat di rute laporan — diverifikasi analisis bundle.
- [ ] JS rute laporan < 280 KB gzip.
- [ ] Ekspor CSV berisi transaksi, dompet, aset, hutang milik user; **bukan** data anggota lain.
- [ ] Rate limit ekspor: 3/jam per user.
- [ ] Empty state: data < 7 hari → "Belum cukup data".
- [ ] Satu kategori > 80% → catatan "Didominasi {kategori}", chart tetap benar.
- [ ] **Test isolasi:** lintas-user dan lintas-household.

## Verifikasi

```bash
npm run test        # agregasi + pengecualian + isolasi
npm run test:e2e    # tanpa horizontal overflow di seluruh chart, 360px
npm run build       # verifikasi Recharts tidak masuk bundle rute lain
```

## Berkas yang Disentuh

Baru: `src/features/reports/{queries,components}` · `src/components/charts/*` · `src/app/(app)/reports/page.tsx` · `src/app/api/reports/summary/route.ts` · `src/app/api/households/[id]/summary/route.ts` · `src/features/settings/export.ts` · test.

## Batasan

**Selalu:** tabel data menyertai chart · gabungkan ekor kategori · zona waktu yang benar per cakupan · ekspor hanya data sendiri.
**Tanya dulu:** menambah jenis chart · mengganti library chart.
**Jangan:** horizontal scroll · pie chart · > 6 seri · memuat Recharts di rute non-laporan · mengekspor data anggota lain.

## Catatan

Pertumbuhan tabungan memakai sumber yang sama persis dengan net worth. Kalau laporan dan net worth menghitung tabungan dengan cara berbeda, kedua angka akan berbeda dan tidak ada penjelasan yang memuaskan untuk itu.
