# Todo — 23 Hardening & Launch

## Audit Keamanan (manual)

- [ ] Telusuri **setiap** query — menyaring pemilik atau melewati `lib/visibility/**`
- [ ] **Invarian I11 hijau** — tidak ada ledger entry yang pemiliknya berbeda dari pemilik wallet-nya
- [ ] Grep tanda tangan fungsi di `src/lib/services/**` — tidak ada yang menerima dompet id milik user selain pemanggil
- [ ] Setiap operasi ber-`household_id` memanggil `requireHouseholdMember` di dalam transaction
- [ ] Grep log: tidak ada nominal, nama household, atau nama anggota
- [ ] Grep kode: tidak ada rahasia, tidak ada `NEXT_PUBLIC_` yang sensitif
- [ ] Setiap route handler punya rate limit
- [ ] Setiap route cron memeriksa `CRON_SECRET`
- [ ] Verifikasi header keamanan (`curl -I`)
- [ ] `npm audit` bersih
- [ ] Secret scanning bersih

## Audit Privasi Household (tiga akun nyata)

- [ ] Akun C tidak membagikan apa pun → tidak terlihat oleh A maupun B
- [ ] `owner` A tidak dapat melihat dompet pribadi B
- [ ] `member` ditolak pada setiap aksi khusus `owner`
- [ ] Keluarkan B → akses hilang seketika, `share_wealth`-nya dimatikan
- [ ] Transfer A→B tidak menyentuh saldo B sama sekali sampai B mencatatnya sendiri
- [ ] Kekayaan keluarga menampilkan per anggota lebih dulu, dengan cakupan pada total
- [ ] Email undangan tidak memuat data finansial

## Audit Aksesibilitas

- [ ] axe pada seluruh rute — nol pelanggaran
- [ ] Navigasi keyboard seluruh alur kritis
- [ ] Pembaca layar: nominal dibacakan naratif
- [ ] Kontras terverifikasi dari token, kedua mode
- [ ] Setiap kontrol ≥ 44×44 px
- [ ] `prefers-reduced-motion` dihormati
- [ ] Uji satu tangan di perangkat sungguhan

## Audit Performa

- [ ] Lighthouse CI hijau di seluruh rute
- [ ] LCP < 2,5 s pada Moto G Power / 4G
- [ ] INP < 200 ms
- [ ] CLS < 0,1
- [ ] Bundle dashboard < 180 KB, laporan < 280 KB
- [ ] Tanpa horizontal overflow pada 7 lebar
- [ ] Query dashboard < 300 ms p95

## Audit Integritas Finansial

- [ ] Seluruh invarian I1–I18 punya test dan hijau
- [ ] Rekonsiliasi pada data produksi → 0 selisih
- [ ] Property test seluruh jalur anti-double-count hijau
- [ ] Coverage `lib/finance` ≥ 95% cabang
- [ ] Coverage `lib/visibility` = 100% cabang
- [ ] Coverage keseluruhan ≥ 70%

## Observability

- [ ] Sentry + scrubber data finansial
- [ ] Vercel Analytics + Speed Insights, mode privasi
- [ ] `/api/health`
- [ ] Uptime check eksternal
- [ ] `/api/cron/reconcile` aktif
- [ ] **Empat** alert saja: selisih rekonsiliasi · error > 1%/5 mnt · cron gagal 2× · migrasi gagal
- [ ] Verifikasi: picu satu alert secara sengaja, pastikan sampai

## Operasional

- [ ] `docs/runbook.md` — rollback, selisih rekonsiliasi, kegagalan cron, kebocoran rahasia
- [ ] **Uji pemulihan backup ke Neon branch — jalankan sungguhan**
- [ ] Verifikasi retensi PITR ≥ 7 hari di produksi
- [ ] Verifikasi `expire-invitations` tidak menulis ledger entry apa pun

## Audit Legal

- [ ] Tidak ada aset, ikon, atau ilustrasi pihak lain
- [ ] Tidak ada nama atau trademark Money Lover di produk maupun materi
- [ ] Lisensi dependensi kompatibel
- [ ] Kebijakan privasi & ketentuan layanan tersedia

## Konsistensi Dokumen

- [ ] Setiap dokumen dibaca ulang terhadap kode
- [ ] Perbaiki dokumen yang menyimpang
- [ ] Versi stack di [docs/11](../../docs/11-tech-architecture.md#1-tech-stack) cocok dengan `package.json`
- [ ] Seluruh tautan antar-dokumen berfungsi
- [ ] ADR mencakup setiap keputusan arsitektural yang diambil selama implementasi

## Verifikasi DoD

- [ ] Seluruh butir Fungsional di [docs/00 §7](../../docs/00-overview.md#7-definisi-selesai-definition-of-done-untuk-v10)
- [ ] Seluruh butir Privasi
- [ ] Seluruh butir Kualitas & performa
- [ ] Seluruh butir Teknis

## Peluncuran

- [ ] `LAUNCH-CHECKLIST.md` dengan hasil setiap audit
- [ ] Daftar keterbatasan yang diketahui
- [ ] Daftar hal yang dipantau pasca-peluncuran
- [ ] **Keputusan go/no-go terdokumentasi**
- [ ] Domain produksi + SSL
- [ ] Env produksi lengkap dan terverifikasi
- [ ] Migrasi produksi berjalan bersih
- [ ] Uji asap pasca-deploy: login, catat transaksi, buat household, undang, transfer

## Verifikasi Akhir

- [ ] Seluruh gerbang CI hijau
- [ ] Seluruh audit selesai tanpa temuan terbuka
- [ ] Pemulihan backup teruji
- [ ] Go/no-go: **GO**
