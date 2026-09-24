# Task 24 — Todo

## Property Test Dulu

- [ ] `computeNextRunDate` (`src/lib/date/recurring.ts`) — harian/mingguan/bulanan, termasuk kasus jepit akhir bulan (31 Jan → Feb, 30 Apr → Mei tanggal 30, dst). fast-check property test dengan tanggal mulai acak.

## Skema & Migrasi

- [ ] `src/lib/db/schema/recurring.ts` — `recurring_transactions`, `recurring_savings_contributions`, enum `recurring_frequency`, `recurring_status` (reuse `categoryTypeEnum` untuk `type`, jangan bikin baru)
- [ ] Indeks `(status, next_run_date)` di kedua tabel
- [ ] Ekspor dari `src/lib/db/schema/index.ts`
- [ ] `npx drizzle-kit generate` terhadap `DATABASE_URL_UNPOOLED` — cek penomoran lanjut dari migrasi terakhir yang ada saat ini
- [ ] `docs/04-database-schema.md` — dokumentasikan dua tabel baru

## Logika Murni

- [ ] `src/lib/date/recurring.ts` — `computeNextRunDate`, plus konversi date↔Date lokal (cek pola `toLocalDate`/`src/lib/date/timezone.ts` yang sudah ada dulu sebelum menulis sendiri)

## Service

- [ ] `src/lib/services/recurring-transactions.ts` — `createRecurringTransaction`, `pauseRecurringTransaction`, `resumeRecurringTransaction`, `deleteRecurringTransaction`, `materializeRecurringTransactions` (reuse `createTransaction`, resolusi timezone per user seperti `materializeRecurringBudgets`)
- [ ] `src/lib/services/recurring-savings.ts` — `createRecurringContribution`, `pause`/`resume`/`delete`, `materializeRecurringContributions` (reuse `contribute`)
- [ ] Idempotency key deterministik (`recurring:${id}:${date}`, `recurring-contrib:${id}:${date}`) — verifikasi lewat test "cron dipanggil dua kali di hari sama = satu transaksi"
- [ ] Kegagalan per-baris tertangkap, tidak menggagalkan baris lain, `next_run_date` TIDAK dimajukan pada baris gagal

## Query

- [ ] `src/features/recurring/queries.ts` — daftar aturan rutin milik user (gabungan transaksi + kontribusi untuk halaman kelola)

## Server Action

- [ ] `src/features/recurring/actions.ts` — `createRecurringTransactionAction` (materialisasi sinkron kalau `start_date` = hari ini), `createRecurringContributionAction`, pause/resume/delete untuk keduanya. `requireUser()` di baris pertama tiap action.

## Cron

- [ ] `src/app/api/cron/recurring/route.ts` — Bearer `CRON_SECRET`, panggil `materializeRecurringTransactions` lalu `materializeRecurringContributions`
- [ ] Entri baru di `vercel.json` (satu route, jadwal harian, beda beberapa menit dari entri lain yang sudah ada)
- [ ] `docs/06-api-contracts.md` §7 dan `docs/13-deployment-vercel.md` — tabel jadwal cron

## UI

- [ ] Toggle "Ulangi transaksi ini" di `transaction-editor.tsx`/`add-transaction-sheet.tsx` — hanya tab Pemasukan/Pengeluaran, reveal Frekuensi + tanggal berakhir opsional saat aktif
- [ ] Toggle "Kontribusi otomatis" di halaman detail savings goal — dompet sumber, nominal, frekuensi, tanggal berakhir opsional
- [ ] `/settings/recurring` — daftar gabungan, aksi jeda/lanjutkan/hapus per baris
- [ ] Entri menu baru di `src/app/(app)/settings/page.tsx` menuju `/settings/recurring`

## Test

- [ ] Property test `computeNextRunDate`
- [ ] Unit: `materializeRecurringTransactions`/`materializeRecurringContributions` — idempotency dua-kali-jalan, kegagalan per-baris, jeda mencegah materialisasi, lanjut memakai `next_run_date` tersimpan (bukan hari ini), tag household terhormati
- [ ] Unit: server actions (validasi, auth guard, materialisasi sinkron saat `start_date` = hari ini)
- [ ] e2e: buat transaksi rutin → simulasi cron → muncul di riwayat dengan saldo dompet berubah
- [ ] e2e: toggle kontribusi otomatis dari goal → simulasi cron → saldo goal naik, net worth tidak berubah
- [ ] e2e: jeda transaksi rutin → simulasi cron → tidak ada transaksi baru

## Verifikasi Akhir

- [ ] `npm run verify` hijau (typecheck + lint + test)
- [ ] `npm run test:e2e` hijau
- [ ] Cek manual: `/settings/recurring` bisa dicapai dari menu Pengaturan tanpa tahu URL-nya langsung
- [ ] Cek manual: transaksi rutin bulanan yang dibuat tanggal 31 tidak error saat dimajukan ke Februari
