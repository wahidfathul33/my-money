# Task 23 — Hardening & Launch

**Fase:** F6 · **Bergantung pada:** semua · **Dokumen:** [14-testing](../../docs/14-testing-strategy.md), [13-deployment §9–10](../../docs/13-deployment-vercel.md#9-monitoring), [00-overview §7](../../docs/00-overview.md#7-definisi-selesai-definition-of-done-untuk-v10)

## Objektif

Memverifikasi seluruh Definition of Done, menutup celah yang tersisa, dan menyiapkan operasional produksi.

Task ini **tidak menambah fitur**. Kalau muncul kebutuhan fitur baru di sini, catat untuk v1.1 — menambahkannya sekarang berarti menambah hal yang belum melewati verifikasi apa pun.

## Ruang Lingkup

**Termasuk:** audit keamanan, audit privasi household, audit a11y, audit performa, observability, cron rekonsiliasi, runbook, uji pemulihan backup, verifikasi DoD, keputusan go/no-go.

## Audit Keamanan

Checklist lengkap di [12-security §14](../../docs/12-security-and-auth.md#14-checklist-review-keamanan). Yang diperiksa manual, bukan hanya lewat test:

- [ ] **Telusuri setiap query** — pastikan menyaring pemilik atau melewati `lib/visibility/**`.
- [ ] **Invarian I11 hijau** — tidak ada ledger entry yang pemiliknya berbeda dari pemilik wallet-nya, di seluruh data uji.
- [ ] Setiap operasi ber-`household_id` memanggil `requireHouseholdMember` **di dalam** transaction.
- [ ] Tidak ada nilai finansial, nama household, atau nama anggota di log mana pun.
- [ ] Tidak ada rahasia di kode atau variabel `NEXT_PUBLIC_*`.
- [ ] Seluruh route handler punya rate limit.
- [ ] Seluruh route cron memeriksa `CRON_SECRET`.
- [ ] Header keamanan terpasang dan terverifikasi.

## Audit Privasi Household

Diverifikasi manual dengan **tiga akun** dalam satu household:

- [ ] Akun yang tidak membagikan apa pun → tidak ada datanya yang terlihat anggota lain.
- [ ] `owner` tidak dapat melihat dompet pribadi anggota.
- [ ] `member` tidak dapat melakukan aksi khusus `owner`.
- [ ] Anggota dikeluarkan → akses hilang seketika, `share_wealth`-nya dimatikan.
- [ ] Tidak ada action yang menerima dompet milik user lain sebagai target tulis.
- [ ] Kekayaan keluarga tampil per anggota lebih dulu; total selalu disertai cakupan.

## Verifikasi Definition of Done

Seluruh butir di [00-overview §7](../../docs/00-overview.md#7-definisi-selesai-definition-of-done-untuk-v10), diperiksa satu per satu — fungsional, privasi, kualitas & performa, teknis.

## Operasional

- [ ] Sentry terpasang dengan scrubber data finansial.
- [ ] Vercel Analytics + Speed Insights aktif, mode privasi.
- [ ] `/api/health` untuk uptime check eksternal.
- [ ] Cron `/api/cron/reconcile` aktif dan melaporkan.
- [ ] Alert dikonfigurasi untuk **empat** kondisi saja: selisih rekonsiliasi · error > 1% dalam 5 menit · cron gagal dua kali berturut-turut · migrasi gagal di produksi.
- [ ] Runbook dari [13-deployment §10](../../docs/13-deployment-vercel.md#10-runbook) ditulis dan dapat diikuti.
- [ ] **Uji pemulihan backup dijalankan sekali.** Backup yang belum pernah dipulihkan bukan backup.

Alert dibatasi empat karena alert yang terlalu sering diabaikan, dan yang penting ikut terabaikan.

## Kriteria Penerimaan

- [ ] Seluruh butir DoD di [00 §7](../../docs/00-overview.md#7-definisi-selesai-definition-of-done-untuk-v10) terpenuhi dan tercentang.
- [ ] Audit keamanan selesai, temuan ditutup.
- [ ] Audit privasi household selesai dengan tiga akun nyata.
- [ ] Coverage: `lib/finance` ≥ 95% cabang, `lib/visibility` 100% cabang, keseluruhan ≥ 70%.
- [ ] 26 skenario E2E dari [14-testing §7](../../docs/14-testing-strategy.md#7-e2e--alur-kritis) hijau.
- [ ] Nol pelanggaran axe di seluruh rute.
- [ ] Lighthouse CI hijau di seluruh rute.
- [ ] Tanpa horizontal overflow pada 7 lebar viewport.
- [ ] Setiap kontrol ≥ 44×44 px.
- [ ] Rekonsiliasi produksi melaporkan 0 selisih.
- [ ] Pemulihan backup teruji.
- [ ] Runbook lengkap.
- [ ] Audit legal: tidak ada aset, nama, atau trademark pihak lain di produk maupun materi.
- [ ] Keputusan go/no-go terdokumentasi.

## Verifikasi

```bash
npm run verify
npm run test:coverage
npm run test:e2e
# Lighthouse CI di seluruh rute
# Audit manual dengan tiga akun
# Uji pemulihan backup di Neon branch
```

## Berkas yang Disentuh

Baru: `src/app/api/health/route.ts` · `src/app/api/cron/reconcile/route.ts` · `src/lib/observability/*` · `docs/runbook.md` · `LAUNCH-CHECKLIST.md`.
Diubah: konfigurasi Sentry · `vercel.json` · dokumen yang menyimpang dari implementasi.

## Batasan

**Selalu:** perbaiki penyebab sebelum data · dokumentasikan temuan · perbarui docs yang menyimpang dari kode.
**Tanya dulu:** menunda butir DoD ke v1.1.
**Jangan:** menambah fitur baru · menonaktifkan test untuk lolos gerbang · meluncurkan dengan temuan keamanan terbuka · meluncurkan tanpa pemulihan backup teruji.

## Catatan

**Bila ada dokumen yang tidak lagi cocok dengan kode, perbaiki dokumennya sekarang.** Spec yang menyimpang lebih buruk daripada tidak ada spec, karena orang berikutnya akan memercayainya.

Keputusan go/no-go ditulis eksplisit: apa yang siap, apa yang diketahui belum sempurna, dan apa yang akan dipantau setelah peluncuran.
