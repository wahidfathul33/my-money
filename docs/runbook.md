# Runbook — Operasional Produksi

> Ekspansi dari [13-deployment-vercel.md §10](13-deployment-vercel.md#10-runbook), ditulis task 23 dengan langkah dan perintah konkret. Dokumen ini untuk siapa pun yang menjawab alert jam 3 pagi — setiap langkah harus dapat diikuti tanpa membaca kode dulu.

## 0. Empat alert dan siapa yang menjawabnya

Hanya empat kondisi memicu alert (docs/13 §9 — sengaja dibatasi, alert yang terlalu sering diabaikan, dan yang penting ikut terabaikan):

| # | Kondisi | Sumber | Bagian runbook |
|---|---------|--------|----------------|
| 1 | Rekonsiliasi menemukan selisih | `/api/cron/reconcile` via `reportReconciliationFinding` (src/lib/observability/sentry.ts) | [§2](#2-selisih-rekonsiliasi) |
| 2 | Tingkat error > 1% dalam 5 menit | Sentry (docs/13 §9) | [§3](#3-tingkat-error-tinggi) |
| 3 | Cron gagal dua kali berturut-turut | Log eksekusi Vercel | [§4](#4-kegagalan-cron) |
| 4 | Migrasi database gagal di produksi | Build step Vercel (`npm run build` menjalankan `db:migrate` dulu — docs/13 §4) | [§5](#5-migrasi-gagal) |

## 1. Rollback

Promosikan deployment sebelumnya di dashboard Vercel — seketika, tanpa rebuild.

**Ini me-rollback KODE, bukan migrasi database.** Kode lama akan berjalan di atas skema baru sampai migrasi berikutnya. Karena itu setiap migrasi di repo ini harus kompatibel-mundur dengan rilis sebelumnya (docs/13 §5 — tabel "Perubahan aman/tidak aman").

Langkah:
1. Vercel dashboard → Deployments → pilih deployment sehat sebelumnya → "Promote to Production".
2. Konfirmasi `/api/health` mengembalikan `{ "status": "ok", "db": true }` pada domain produksi.
3. Jalankan uji asap manual: login, catat satu transaksi kecil, verifikasi saldo berubah.
4. Catat insiden: apa yang salah, jam berapa rollback selesai, dan tautan ke deployment yang di-rollback.

## 2. Selisih rekonsiliasi

`/api/cron/reconcile` (src/app/api/cron/reconcile/route.ts) menjalankan `runReconciliation()` (src/lib/db/reconcile.ts) setiap hari 03:00 WIB. Fungsi ini **hanya membaca dan melaporkan** — ia tidak pernah memperbaiki data sendiri.

1. **Jalankan ulang secara manual** untuk melihat laporan penuh (nominal termasuk — endpoint ini butuh `CRON_SECRET`, bukan publik):
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<domain-produksi>/api/cron/reconcile
   ```
2. Baca field mana yang berisi (`walletBalanceDrift`, `ledgerOwnerMismatches`, `unbalancedMemberTransfers`, `invalidCreatedByRows`, `oneWayTransferLinks`, `debtRemainingDrift`, `receivableRemainingDrift`) — masing-masing memetakan langsung ke satu invarian di [05-financial-integrity.md §5](05-financial-integrity.md#5-invarian).
3. **`ledgerOwnerMismatches` yang berisi bukan sekadar bug numerik — itu insiden keamanan.** Artinya ada jalur kode yang menulis ke ledger milik user lain. Hentikan penyelidikan baris data, mulai penyelidikan jalur kode: grep pemanggil `postEntries` (src/lib/finance/ledger.ts) yang tidak melewati `requireUser()`/`requireHouseholdMember()`.
4. Untuk temuan numerik (`walletBalanceDrift`, `debtRemainingDrift`, dll.): telusuri `ledger_entries`/`debt_payments` di sekitar `walletId`/`obligationId` yang dilaporkan, cari operasi yang menulis saldo tanpa transaction, atau yang gagal di tengah jalan tanpa rollback.
5. **Perbaiki penyebabnya di kode dulu.** Deploy fix. Baru setelah itu koreksi datanya.
6. **Koreksi data selalu lewat entry `adjustment` baru dengan catatan** (`src/lib/finance/ledger.ts`'s `source: 'adjustment'`) — **tidak pernah** `UPDATE wallets SET balance = ...` langsung. `UPDATE` langsung membuat baris `ledger_entries` dan `wallets.balance` tidak sinkron lagi — persis apa yang rekonsiliasi ada untuk mendeteksi.
7. Jalankan ulang `curl` di atas untuk konfirmasi laporan sekarang kosong (`hasFindings: false`) untuk entitas yang diperbaiki.

## 3. Tingkat error tinggi

1. Buka dashboard Sentry (project ini) → filter 5 menit terakhir → urutkan berdasarkan jumlah kejadian.
2. Karena scrubber (src/lib/observability/scrubber.ts) membuang nominal dan nama sebelum event terkirim, breadcrumb dan `extra` yang tersisa aman dibaca siapa pun yang punya akses Sentry — tidak perlu meminta akses tambahan untuk lihat detail.
3. Kalau error terkonsentrasi pada satu route/Server Action, dan deployment terbaru adalah penyebabnya (korelasikan waktu) → **rollback** ([§1](#1-rollback)) dulu, investigasi akar masalah sesudahnya di lingkungan non-produksi.
4. Kalau error tersebar dan berkorelasi dengan status Neon (bukan deployment) → cek [status.neon.tech](https://status.neon.tech) dan dashboard Neon untuk compute/connection limit.

## 4. Kegagalan cron

Semua cron di `/api/cron/*` idempoten (docs/13 §9's catatan; masing-masing route punya doc comment yang menjelaskan idempotensinya sendiri — lihat src/app/api/cron/*/route.ts).

1. Vercel dashboard → Cron Jobs → lihat log eksekusi yang gagal, catat route dan waktu.
2. Picu ulang manual:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<domain-produksi>/api/cron/<nama-route>
   ```
3. **Snapshot net worth yang terlewat** (`/api/cron/net-worth-snapshot`) dapat diisi ulang dengan memanggil ulang endpoint yang sama pada hari itu — upsert-nya (`ON CONFLICT (entity_id, snapshot_date) DO UPDATE`) membuat panggilan terlambat tetap menghasilkan baris yang benar untuk tanggal tersebut, bukan duplikat.
4. Kalau kegagalan berulang (bukan sekali kebetulan): baca pesan error di log fungsi Vercel untuk route tersebut. Kegagalan berturut-turut yang sama biasanya berarti masalah di luar cron itu sendiri (koneksi DB habis, `CRON_SECRET` salah di env Vercel setelah rotasi — lihat [§6](#6-kebocoran-rahasia)).

## 5. Migrasi gagal

Migrasi berjalan di build step (`npm run build` = `db:migrate && next build`, docs/13 §4), **sebelum** kode baru aktif. Kalau migrasi gagal, build gagal, dan Vercel **tidak pernah mengganti deployment produksi** — versi lama tetap melayani trafik. Tidak ada rollback kode yang dibutuhkan untuk kasus ini; yang gagal adalah deployment baru, bukan yang lama.

1. Baca log build di Vercel dashboard untuk pesan error `drizzle-kit migrate` yang persis.
2. Migrasi memakai `DATABASE_URL_UNPOOLED` (koneksi langsung, docs/13 §4) — kegagalan paling umum adalah statement yang mengambil lock terlalu lama atau bentrok dengan koneksi aktif. Cek dashboard Neon untuk query yang sedang berjalan.
3. **Jangan** menjalankan migrasi manual langsung ke database produksi di luar pipeline untuk "memperbaiki cepat" — itu membuat riwayat migrasi (`drizzle` schema tracking) dan repo tidak sinkron lagi.
4. Perbaiki file migrasi (lihat docs/13 §5 untuk pola migrasi aman — kolom baru nullable/default aman langsung, drop/rename kolom butuh dua rilis), commit, deploy ulang.
5. Kalau migrasi yang salah **sudah pernah berhasil ter-apply** sebagian sebelumnya (jarang, tapi mungkin kalau migrasi sebelumnya berhasil dan yang ini gagal di tengah): verifikasi state skema aktual dengan `drizzle-kit studio` sebelum menulis migrasi perbaikan — jangan asumsikan state dari nama file migrasi saja.

## 6. Kebocoran rahasia

1. **Rotasi kredensial yang bocor** di sumbernya dulu (Google Cloud Console untuk OAuth, penyedia SMTP untuk `SMTP_PASSWORD`, Neon dashboard untuk `DATABASE_URL`, atau generate ulang string acak untuk `AUTH_SECRET`/`CRON_SECRET`).
2. Update env var yang sesuai di Vercel dashboard (Production **dan** Preview environment kalau kredensial yang sama dipakai di keduanya).
3. Redeploy (env var baru tidak aktif untuk instance yang sudah berjalan sampai deployment baru).
4. Cabut kredensial lama di sisi penyedia (jangan cuma ganti env var — kredensial lama yang masih valid di penyedia tetap dapat dipakai penyerang).
5. Tinjau log akses penyedia terkait (Google Cloud audit log, Neon connection log) untuk periode sejak kebocoran diperkirakan terjadi sampai rotasi selesai.
6. Kalau `AUTH_SECRET` yang bocor: rotasinya membatalkan **seluruh sesi aktif** (database session — docs/12 §1) — ini konsekuensi yang diharapkan, bukan efek samping yang perlu dihindari, untuk kredensial sekritis ini.

## 7. Uji pemulihan backup

Lihat [LAUNCH-CHECKLIST.md](../LAUNCH-CHECKLIST.md) untuk status uji ini di lingkungan saat ini (dijalankan sekali sebelum peluncuran sungguhan, atau didokumentasikan sebagai tertunda dengan alasannya). Prosedurnya, begitu ada akses Neon console dengan branching aktif:

1. Neon dashboard → project produksi → Branches → "Create branch" dari titik waktu (PITR) sebelum insiden, atau dari `main` untuk uji rutin non-insiden.
2. Point aplikasi (lokal, `.env` sementara) ke `DATABASE_URL` branch baru.
3. Verifikasi data yang diharapkan ada benar-benar ada: jalankan `runReconciliation()` terhadap branch tersebut (`npx tsx -e "..."` atau lewat test yang mengimpor `src/lib/db/reconcile.ts` dengan `DATABASE_URL` diarahkan ke branch) — laporan harus konsisten dengan ekspektasi titik waktu itu.
4. Hapus branch uji setelah selesai (tidak menumpuk biaya storage).
5. Catat waktu tempuh (berapa lama dari "create branch" sampai "data terverifikasi") — ini angka RTO praktis untuk insiden sungguhan.

## 8. Kontak & eskalasi

Aplikasi solo/skala kecil di peluncuran ini — tidak ada rotasi on-call formal. Siapa pun yang memegang akses Vercel + Neon + Sentry dashboard dapat menjalankan seluruh runbook ini; tidak ada langkah yang butuh persetujuan orang lain untuk kondisi darurat (§1–§6 di atas).
