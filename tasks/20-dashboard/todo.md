# Todo — 20 Dashboard

## Query

- [ ] `getDashboardData(userId)` — **satu query gabungan**: saldo dompet, agregat bulan berjalan, snapshot terbaru + sebelumnya, 5 transaksi terakhir
- [ ] Query paralel (bukan waterfall): budget ≥ 80%, jatuh tempo ≤ 7 hari, goal aktif, transfer pending
- [ ] `getHouseholdSummary(householdId, period)` — pengeluaran, per anggota, per kategori, budget, goal, kekayaan
- [ ] Ukur: total waktu query < 300 ms p95

## Komponen

- [ ] `NetWorthHero` — angka, delta, sparkline 30 hari
- [ ] `StatTile` — label, nominal, delta opsional
- [ ] Kartu budget bermasalah
- [ ] Kartu "Perlu Perhatian" (jatuh tempo + telat)
- [ ] Kartu tabungan (maks 2)
- [ ] Kartu transfer menunggu
- [ ] Daftar transaksi terbaru (5)
- [ ] `HouseholdSummary` untuk ringkasan keluarga
- [ ] `MemberBar` — siapa membayar apa

## Dashboard Pribadi

- [ ] Greeting + avatar
- [ ] Hero net worth
- [ ] Dua tile berdampingan: Kas, Bulan Ini
- [ ] **Kas tidak menyertakan kartu kredit**
- [ ] Bagian kondisional sesuai aturan
- [ ] Transaksi terbaru tepat 5
- [ ] FAB terlihat tanpa scroll
- [ ] Skeleton seukuran konten akhir

## Ringkasan Keluarga

- [ ] Pemilih periode
- [ ] Pengeluaran keluarga + masuk/sisa
- [ ] Siapa membayar apa (bar per anggota)
- [ ] Per kategori (3 teratas + Lihat)
- [ ] Anggaran keluarga (hanya yang ≥ 80%)
- [ ] Tabungan bersama dengan progress + kontribusi per anggota
- [ ] Kekayaan keluarga + **cakupan**
- [ ] Daftar anggota
- [ ] `SetupSteps` untuk household baru — sekarang seluruh langkah aktif

## Aturan Tampil

- [ ] Anggaran: hanya bila ada ≥ 80%
- [ ] Perlu Perhatian: hanya bila ada ≤ 7 hari atau telat
- [ ] Tabungan: maks 2, diurut target date terdekat
- [ ] Transfer menunggu: hanya bila ada
- [ ] Delta net worth: hanya bila riwayat ≥ 2 snapshot
- [ ] Test setiap aturan

## Performa

- [ ] Server Component untuk seluruh bagian statis
- [ ] `'use client'` hanya pada sparkline & interaksi
- [ ] Verifikasi bundle rute `/` < 180 KB gzip
- [ ] Lighthouse CI pada `/`: LCP < 2,5 s, CLS < 0,1
- [ ] Tidak ada layout shift saat skeleton → konten

## Empty State

- [ ] Belum ada dompet → CTA buat dompet
- [ ] Belum ada transaksi → CTA catat transaksi
- [ ] Household baru → daftar langkah

## Test

- [ ] Integration: `getDashboardData` mengembalikan angka yang benar
- [ ] Integration: Kas mengecualikan kartu kredit
- [ ] Integration: delta memakai snapshot bulan sebelumnya
- [ ] Unit: delta disembunyikan bila riwayat < 2
- [ ] E2E: budget sehat → bagian Anggaran tersembunyi
- [ ] E2E: budget 85% → bagian Anggaran muncul
- [ ] E2E: tanpa jatuh tempo → Perlu Perhatian tersembunyi
- [ ] E2E: catat transaksi → angka dashboard terbarui
- [ ] E2E: household baru → daftar langkah → selesaikan → daftar hilang
- [ ] E2E: FAB terlihat tanpa scroll di 360px
- [ ] E2E: axe nol pelanggaran

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Lighthouse CI hijau pada `/`
- [ ] Periksa manual di 360px: jawaban "apakah kondisi saya baik" terbaca tanpa scroll
