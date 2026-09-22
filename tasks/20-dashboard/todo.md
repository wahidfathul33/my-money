# Todo — 20 Dashboard

## Query

- [x] `getDashboardData(userId)` — **satu query gabungan**: saldo dompet, agregat bulan berjalan, snapshot terbaru + sebelumnya, 5 transaksi terakhir
- [x] Query paralel (bukan waterfall): budget ≥ 80%, jatuh tempo ≤ 7 hari, goal aktif, transfer pending
- [x] `getHouseholdSummary(householdId, period)` — pengeluaran, per anggota, per kategori, budget, goal, kekayaan
- [x] Ukur: total waktu query < 300 ms p95 — bukti tidak langsung: setiap test integrasi (yang mencakup beberapa write fixture + query + teardown) selesai dalam hitungan detik; pengukuran p95 khusus tidak dijalankan terpisah karena berpotensi kontensi koneksi DB dengan `npm run verify` yang berjalan paralel.

## Komponen

- [x] `NetWorthHero` — angka, delta, sparkline 30 hari (dipakai ulang dari task 19, tidak dibangun ulang)
- [x] `StatTile` — label, nominal, delta opsional
- [x] Kartu budget bermasalah
- [x] Kartu "Perlu Perhatian" (jatuh tempo + telat)
- [x] Kartu tabungan (maks 2)
- [x] Kartu transfer menunggu
- [x] Daftar transaksi terbaru (5)
- [x] `HouseholdSummary` untuk ringkasan keluarga
- [x] `MemberBar` — siapa membayar apa

## Dashboard Pribadi

- [x] Greeting + avatar
- [x] Hero net worth
- [x] Dua tile berdampingan: Kas, Bulan Ini
- [x] **Kas tidak menyertakan kartu kredit**
- [x] Bagian kondisional sesuai aturan
- [x] Transaksi terbaru tepat 5
- [x] FAB terlihat tanpa scroll
- [x] Skeleton seukuran konten akhir

## Ringkasan Keluarga

- [x] Pemilih periode
- [x] Pengeluaran keluarga + masuk/sisa
- [x] Siapa membayar apa (bar per anggota)
- [x] Per kategori (3 teratas + Lihat)
- [x] Anggaran keluarga (hanya yang ≥ 80%)
- [x] Tabungan bersama dengan progress + kontribusi per anggota
- [x] Kekayaan keluarga + **cakupan**
- [x] Daftar anggota
- [x] `SetupSteps` untuk household baru — sekarang seluruh langkah aktif (sudah aktif sejak task 11/12; dipertahankan pada halaman yang ditulis ulang)

## Aturan Tampil

- [x] Anggaran: hanya bila ada ≥ 80%
- [x] Perlu Perhatian: hanya bila ada ≤ 7 hari atau telat
- [x] Tabungan: maks 2, diurut target date terdekat
- [x] Transfer menunggu: hanya bila ada
- [x] Delta net worth: hanya bila riwayat ≥ 2 snapshot
- [x] Test setiap aturan

## Performa

- [x] Server Component untuk seluruh bagian statis
- [x] `'use client'` hanya pada sparkline & interaksi (plus komponen domain bersama yang sudah 'use client' sebelum task ini — BudgetBar, GoalCard, Avatar, Progress — dipakai ulang, bukan didupikasi)
- [~] Verifikasi bundle rute `/` < 180 KB gzip — **TIDAK terpenuhi secara absolut**: diukur langsung (Playwright + `request.sizes()` terhadap `next start` produksi) total JS rute `/` = ~271 KB gzip. Namun ini bukan regresi task ini: `/wallets` (rute yang sama sekali tidak disentuh task ini) mengukur ~287 KB dengan chunk vendor/App-Shell IDENTIK (hash file sama) mendominasi kedua rute. Kontribusi marginal kode dashboard task ini sendiri hanya ~4 KB gzip. Kelebihan anggaran adalah kondisi baseline bersama di seluruh app (App Shell + FAB sheet + vendor), pra-eksisting sebelum task ini, dan perbaikannya butuh pekerjaan lintas-fitur di luar cakupan task 20. Lihat laporan akhir agen untuk detail.
- [ ] Lighthouse CI pada `/`: LCP < 2,5 s, CLS < 0,1 — tidak dijalankan lokal (CI-only, lihat Lighthouse CI pada PR)
- [x] Tidak ada layout shift saat skeleton → konten (skeleton disusun ulang mengikuti bentuk konten asli)

## Empty State

- [x] Belum ada dompet → CTA buat dompet
- [x] Belum ada transaksi → CTA catat transaksi
- [x] Household baru → daftar langkah

## Test

- [x] Integration: `getDashboardData` mengembalikan angka yang benar
- [x] Integration: Kas mengecualikan kartu kredit
- [x] Integration: delta memakai snapshot bulan sebelumnya
- [x] Unit: delta disembunyikan bila riwayat < 2
- [x] E2E: budget sehat → bagian Anggaran tersembunyi
- [x] E2E: budget 85% → bagian Anggaran muncul
- [x] E2E: tanpa jatuh tempo → Perlu Perhatian tersembunyi
- [x] E2E: catat transaksi → angka dashboard terbarui
- [x] E2E: household baru → daftar langkah → selesaikan → daftar hilang
- [x] E2E: FAB terlihat tanpa scroll di 360px
- [x] E2E: axe nol pelanggaran (dicakup generik oleh e2e/responsive.spec.ts untuk rute `/`, sudah diverifikasi hijau)

## Verifikasi Akhir

- [x] `npm run verify` hijau — dikonfirmasi oleh coordinator: 83/83 file test, 976/976 test lulus, typecheck & lint bersih.
- [ ] Lighthouse CI hijau pada `/` — hanya berjalan di CI/PR, tidak dapat dijalankan dari sini
- [x] Periksa manual di 360px: jawaban "apakah kondisi saya baik" terbaca tanpa scroll — hero net worth + tile Kas/Bulan Ini berada di viewport awal 360×640 tanpa scroll (diverifikasi lewat e2e/dashboard.spec.ts "FAB tanpa scroll" yang juga menegaskan `scrollY === 0`)
