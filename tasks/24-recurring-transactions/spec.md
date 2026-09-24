# Task 24 — Transaksi Rutin & Kontribusi Tabungan Otomatis

**Fase:** F7 (v1.1) · **Bergantung pada:** 07 (transactions-core), 14 (budgets — pola cron rollover), 15 (savings-goals — `contribute()`) · **Dokumen:** [00-overview §"Ditunda ke v1.x"](../../docs/00-overview.md), [15-roadmap §7](../../docs/15-roadmap.md#7-setelah-v10), [06-api-contracts §7](../../docs/06-api-contracts.md#7-cron-jobs)

Fitur ini **sengaja tidak ada di v1.0** — `docs/00-overview.md` mendaftar "Transaksi berulang" di antara yang ditunda, dan `docs/15-roadmap.md` §7 menyebutnya kandidat v1.1 yang "tidak dijadwalkan, ditinjau ulang setelah pemakaian nyata". Task ini mengimplementasikannya sebagai perpanjangan v1.0 yang sudah selesai (24/24), bukan revisi task manapun yang ada.

## Objektif

User bisa membuat transaksi (pemasukan/pengeluaran) yang tercatat otomatis berulang sesuai jadwal, dan bisa membuat kontribusi tabungan otomatis dari dompet ke savings goal yang sudah ada — keduanya langsung terpost tanpa perlu konfirmasi setiap siklus, sama seperti budget rollover.

## Ruang Lingkup

**Termasuk:**
- Transaksi rutin: pemasukan & pengeluaran saja (bukan transfer), pribadi maupun ditandai ke household (sama seperti tag 🏠 pada transaksi biasa)
- Frekuensi: harian, mingguan, bulanan — tanggal jangkar diturunkan dari tanggal mulai, bukan kolom terpisah
- Kontribusi tabungan otomatis: dompet → savings goal yang **sudah ada**, memakai `contribute()` yang sudah ada (net-worth-neutral, bukan transaksi baru)
- Auto-post langsung tanpa konfirmasi (mirip `materializeRecurringBudgets`), dieksekusi oleh satu cron harian baru
- Kelola (lihat/jeda/lanjutkan/hapus) transaksi rutin & kontribusi rutin dari satu halaman `/settings/recurring`
- Toggle "Ulangi transaksi ini" di form tambah transaksi yang sudah ada (hanya utk tab Pemasukan/Pengeluaran, bukan Transfer)
- Toggle "Kontribusi otomatis" di halaman detail savings goal yang sudah ada

**Tidak termasuk (v1.x berikutnya, jangan dibangun):**
- Transfer rutin (user secara eksplisit hanya minta "transaksi keluar, transaksi masuk, tabungan rutin")
- Interval kustom ("tiap 2 minggu", "tiap 3 bulan") — hanya harian/mingguan/bulanan
- Auto-pause setelah gagal berturut-turut, atau notifikasi kegagalan — gagal cukup berarti `next_run_date` TIDAK dimajukan (dicoba lagi run berikutnya)
- Household budget rutin bersama yang dibuat/dimiliki bersama (tiap anggota tetap membuat aturannya sendiri, seperti transaksi biasa — lihat "Model Kepemilikan" di bawah)
- Preview/ringkasan "transaksi rutin akan datang" di dashboard (v1.x lain kalau memang dibutuhkan setelah dipakai nyata)

## Model Kepemilikan (penting — baca sebelum desain skema)

Ini **bukan** aturan bersama milik household. Setiap `recurring_transactions`/`recurring_savings_contributions` row dimiliki **satu user**, memakai **dompet milik user itu** — identik dengan bagaimana transaksi biasa bekerja hari ini. Tag `household_id` (nullable FK, sama seperti `transactions.household_id`) hanya membuat transaksi HASIL materialisasinya terlihat oleh anggota household lain (`isHouseholdItemVisible`) — bukan berarti aturan rutinnya "milik" household. Jangan buat konsep kepemilikan household baru; reuse persis pola tag opsional yang sudah ada di `transactions`.

Konsekuensinya: **tidak ada gerbang `requireHouseholdMember` khusus di luar yang sudah ada di `createTransaction`** — materialisasi memanggil `createTransaction` apa adanya, yang sudah memverifikasi keanggotaan household di dalam transaksinya sendiri kalau `householdId` diisi.

## Skema Database

Dua tabel baru, ikuti persis konvensi `budgets`/`savings_goals` yang sudah ada (lihat `src/lib/db/schema/budgets.ts` & `savings.ts` sebagai acuan langsung):

```
recurring_transactions
  id                uuid PK
  user_id           uuid FK users(id) ON DELETE CASCADE NOT NULL
  household_id      uuid FK households(id) ON DELETE SET NULL   -- nullable, sama seperti transactions.household_id
  type              category_type ('income'|'expense')          -- REUSE categoryTypeEnum, jangan bikin enum baru
  amount            bigint NOT NULL, CHECK (amount > 0)          -- sama seperti transactions.amount
  category_id       uuid FK categories(id) NOT NULL
  wallet_id         uuid FK wallets(id) NOT NULL
  note              text
  frequency         recurring_frequency ('daily'|'weekly'|'monthly') NOT NULL  -- enum baru
  start_date        date NOT NULL   -- date murni, bukan timestamp — lihat catatan di bawah
  end_date          date            -- nullable = tanpa batas
  next_run_date     date NOT NULL
  status            recurring_status ('active'|'paused'|'ended') NOT NULL DEFAULT 'active'  -- enum baru, pola sama seperti savings_status/deposit_status
  created_at        timestamptz NOT NULL DEFAULT now()
  updated_at        timestamptz NOT NULL DEFAULT now()

recurring_savings_contributions
  id                uuid PK
  user_id           uuid FK users(id) ON DELETE CASCADE NOT NULL
  goal_id           uuid FK savings_goals(id) NOT NULL
  wallet_id         uuid FK wallets(id) NOT NULL
  frequency         recurring_frequency NOT NULL   -- REUSE enum yang sama
  start_date        date NOT NULL
  end_date          date
  next_run_date     date NOT NULL
  status            recurring_status NOT NULL DEFAULT 'active'  -- REUSE enum yang sama
  created_at        timestamptz NOT NULL DEFAULT now()
  updated_at        timestamptz NOT NULL DEFAULT now()
  -- TIDAK ADA amount di sini yang terpisah dari yang dipakai contribute() —
  -- pakai kolom amount juga (bigint NOT NULL, CHECK > 0), sama pola.
```

**Kenapa `date`, bukan `timestamp with time zone`** (beda dari `transactions.transaction_date`): tanggal jadwal berulang murni kalender ("tiap tanggal 1", bukan "tiap jam 00:05 UTC") — `timestamp` akan memaksa pemilihan jam yang tidak relevan dan mempersulit perbandingan `next_run_date <= today` per zona waktu user. `transactions.transaction_date` sendiri tetap `timestamp` tidak berubah; materialisasi mengonversi `next_run_date` (date) menjadi `Date` pada tengah hari lokal user sebelum memanggil `createTransaction`/`contribute` — **cek dulu bagaimana bagian lain basis kode ini (mis. `toLocalDate`, `src/lib/date/timezone.ts`) menangani konversi date↔Date sebelum menulis ulang polanya sendiri.**

Tambahkan indeks pada `(status, next_run_date)` di kedua tabel — ini yang dipakai query cron setiap hari.

Migrasi: `npx drizzle-kit generate` (bukan `push`) terhadap `DATABASE_URL_UNPOOLED`, mengikuti `drizzle.config.ts`'s catatan. Penomoran lanjut dari migrasi terakhir (`0005_old_stranger.sql` per riset — cek ulang saat mengerjakan, mungkin sudah bertambah).

## Perhitungan `next_run_date` Berikutnya

Fungsi murni baru (butuh property test — pola "Property Test Dulu" di `todo.md`), kemungkinan `src/lib/date/recurring.ts`:

```
computeNextRunDate(current: string /* YYYY-MM-DD */, frequency: 'daily'|'weekly'|'monthly'): string
```

- `daily` → `current + 1 hari`
- `weekly` → `current + 7 hari`
- `monthly` → bulan kalender berikutnya, **hari-nya dijepit (clamp)** ke hari terakhir bulan tujuan kalau tanggal asal tidak ada di bulan itu (mis. mulai tanggal 31 Januari → next run 28/29 Februari, BUKAN error, BUKAN meluber ke Maret). Ini yang paling gampang salah — tulis property test yang generate tanggal mulai acak (termasuk 29/30/31) dan verifikasi hasilnya selalu tanggal valid di bulan yang benar.

## Materialisasi (Cron)

**Satu route cron baru**, bukan dua — akun Vercel Hobby yang dipakai project ini sudah punya 6 cron harian (lihat `vercel.json`); menambah lebih dari satu lagi menambah risiko yang tidak perlu terhadap batas paket. `src/app/api/cron/recurring/route.ts`, pola identik `budget-rollover/route.ts` (Bearer `CRON_SECRET`, tidak ada `requireUser` — ini panggilan mesin-ke-mesin), memanggil DUA fungsi service secara berurutan dalam satu request:

```ts
export async function GET(request: Request): Promise<NextResponse> {
  // ...auth check identik budget-rollover...
  const transactions = await materializeRecurringTransactions();
  const contributions = await materializeRecurringContributions();
  return NextResponse.json({ transactions, contributions });
}
```

`materializeRecurringTransactions(now = new Date())` — letakkan di `src/lib/services/recurring-transactions.ts` (file baru; jangan menggemukkan `transactions.ts` yang sudah besar):
- Untuk setiap timezone user berbeda yang punya baris `status='active' AND next_run_date <= today` (pola resolusi timezone-per-user identik `materializeRecurringBudgets` — lihat `budgets.ts` baris ~224-303 sebagai acuan LANGSUNG, termasuk kenapa cron ini harus tetap jalan HARIAN meski sebagian besar user tidak match hari itu)
- Untuk tiap baris due: panggil `createTransaction(userId, { type, amount, categoryId, walletId, transactionDate: <next_run_date jam 12 siang lokal>, note, idempotencyKey: \`recurring:${id}:${nextRunDate}\`, householdId })` — **JANGAN tulis ulang logika posting**, reuse fungsi yang sudah ada apa adanya, termasuk semua validasinya (wallet aktif, kategori cocok tipe, dst).
- Bungkus per-baris dalam try/catch — satu baris gagal (dompet diarsipkan, kategori dihapus, dst) tidak boleh menggagalkan baris lain. Gagal → JANGAN majukan `next_run_date` (dicoba lagi run berikutnya), hitung sebagai `failed`, lanjut.
- Sukses → majukan `next_run_date` via `computeNextRunDate`. Kalau `end_date` diisi dan next_run_date baru melewatinya → set `status = 'ended'`.
- Update `next_run_date`/`status` dalam TRANSAKSI DB YANG SAMA dengan `createTransaction`-nya (satu `dbWrite.transaction(...)` yang membungkus keduanya) — ini yang membuat re-run cron di hari yang sama aman: kalau berhasil, baris itu tidak akan cocok lagi dengan `next_run_date <= today` di percobaan kedua.

`materializeRecurringContributions(now = new Date())` di `src/lib/services/recurring-savings.ts` (file baru) — pola identik di atas, tapi memanggil `contribute(userId, goalId, { walletId, amount, contributionDate, note: null, idempotencyKey: \`recurring-contrib:${id}:${nextRunDate}\` })`. Goal yang sudah `archived` → gagal dengan wajar (tangkap error dari `assertGoalAccess`/`contribute` yang sudah ada), jangan majukan `next_run_date`.

**`vercel.json`**: satu entri baru, jadwal harian, ikuti pola penjadwalan bertahap yang sudah ada (lihat entri lain — semuanya beda beberapa menit di jam malam UTC = dini hari WIB). Tambahkan baris ke tabel cron di `docs/06-api-contracts.md` §7 dan `docs/13-deployment-vercel.md`.

## Server Actions & UI

**Transaksi rutin:**
- `createRecurringTransactionAction` — validasi (Zod), `requireUser()`, lalu panggil service `createRecurringTransaction(userId, input)`. Kalau `start_date` = hari ini (lokal), materialisasi kejadian PERTAMA secara sinkron di request yang sama (panggil ulang logika materialize-satu-baris, jangan duplikasi) — pengguna yang membuat "gaji hari ini" pada tanggal gajian itu sendiri mengharapkan tercatat SEKARANG, bukan menunggu cron besok. Kalau `start_date` di masa depan, cukup simpan barisnya dengan `next_run_date = start_date`.
- `pauseRecurringTransactionAction` / `resumeRecurringTransactionAction` / `deleteRecurringTransactionAction` — pola sederhana, masing-masing verifikasi kepemilikan (`userId` cocok) sebelum menulis.
- Toggle "Ulangi transaksi ini" di `src/features/transactions/components/transaction-editor.tsx` / `add-transaction-sheet.tsx` — HANYA muncul di tab Pemasukan/Pengeluaran (`type !== 'transfer'`). Saat aktif: tampilkan Frekuensi (segmented: Harian/Mingguan/Bulanan) + tanggal berakhir opsional. Saat disimpan dengan toggle aktif, panggil `createRecurringTransactionAction` bukan `createTransactionAction`.

**Kontribusi tabungan otomatis:**
- `createRecurringContributionAction` / `pause` / `resume` / `delete` — pola sama persis.
- Toggle "Kontribusi otomatis" di halaman detail goal (`src/features/savings/components/goal-detail-client.tsx` atau file setara) — dompet sumber, nominal, frekuensi, tanggal berakhir opsional.

**Halaman kelola:** `/settings/recurring` — daftar gabungan (transaksi rutin + kontribusi rutin, beri badge/ikon pembeda), tiap baris: nama/kategori, nominal, frekuensi, jadwal berikutnya, status, aksi jeda/lanjutkan/hapus. Tambahkan entrinya ke daftar menu `/settings` yang sudah ada (`src/app/(app)/settings/page.tsx`) — **jangan ulangi bug yang baru saja diperbaiki di halaman Kekayaan** (fitur yang ada tapi tidak punya entry point di UI manapun).

## Kriteria Penerimaan

- [ ] Transaksi rutin harian/mingguan/bulanan terpost otomatis pada `next_run_date`, tanpa konfirmasi user
- [ ] **Bulanan tanggal 31 dari bulan 31-hari, dijadwalkan ulang ke bulan 30/28/29-hari, tidak pernah error atau meluber ke bulan berikutnya** (property test)
- [ ] Kontribusi tabungan otomatis net-worth-neutral — sama seperti kontribusi manual, memakai `contribute()` apa adanya
- [ ] Menjalankan cron dua kali di hari yang sama tidak pernah membuat transaksi/kontribusi duplikat (idempotency key + `next_run_date` yang sudah dimajukan dalam transaksi DB yang sama)
- [ ] Satu baris gagal (dompet/kategori/goal sudah tidak valid) tidak menggagalkan baris lain dalam run cron yang sama
- [ ] Transaksi rutin yang ditandai household tetap menghormati `requireHouseholdMember` yang sudah ada di `createTransaction` — tidak ada gerbang household baru yang perlu ditulis
- [ ] Jeda (`paused`) menghentikan materialisasi tanpa menghapus barisnya; lanjut (`resume`) melanjutkan dari `next_run_date` yang tersimpan, bukan dari hari ini
- [ ] `/settings/recurring` menampilkan semua aturan milik user dan terhubung dari menu Pengaturan
- [ ] Toggle "Ulangi transaksi ini" tidak muncul di tab Transfer

## Verifikasi

```bash
npm run typecheck && npm run lint
npm run test    # unit: computeNextRunDate property test (termasuk kasus akhir bulan),
                 # materializeRecurringTransactions/Contributions (idempotency, per-baris gagal,
                 # household tag, jeda/lanjut), server actions
npm run test:e2e # e2e: buat transaksi rutin dari form → cron simulasi → muncul di riwayat;
                  # toggle kontribusi otomatis dari goal → cron simulasi → saldo goal naik,
                  # net worth tidak berubah; jeda mencegah materialisasi berikutnya
```

## Berkas yang Disentuh

**Baru:** `src/lib/db/schema/recurring.ts` · migrasi Drizzle baru · `src/lib/date/recurring.ts` (+ test) · `src/lib/services/recurring-transactions.ts` (+ test) · `src/lib/services/recurring-savings.ts` (+ test) · `src/features/recurring/actions.ts` · `src/features/recurring/queries.ts` · `src/features/recurring/components/*` (daftar, form) · `src/app/(app)/settings/recurring/page.tsx` · `src/app/api/cron/recurring/route.ts` · `e2e/recurring.spec.ts`

**Diubah:** `src/lib/db/schema/index.ts` (ekspor tabel/enum baru) · `src/features/transactions/components/transaction-editor.tsx` / `add-transaction-sheet.tsx` (toggle) · `src/features/savings/components/goal-detail-client.tsx` (toggle) · `src/app/(app)/settings/page.tsx` (entri menu baru) · `vercel.json` · `docs/06-api-contracts.md` §7 · `docs/13-deployment-vercel.md` · `docs/04-database-schema.md` (dua tabel baru) · `tasks/todo.md` (index root)

## Batasan

**Selalu:**
- Reuse `createTransaction`/`contribute` apa adanya untuk posting — jangan menduplikasi logika `postEntries`/validasi di jalur rutin
- Majukan `next_run_date` dalam transaksi DB yang SAMA dengan posting-nya (atomicity = idempotency di sini)
- `date` murni untuk `start_date`/`end_date`/`next_run_date`, bukan `timestamp`

**Tanya dulu:**
- Kalau saat implementasi ternyata Vercel Hobby punya batas JUMLAH cron (bukan cuma frekuensi) dan project sudah mepet batas itu — konfirmasi ke user sebelum menambah cron baru ke `vercel.json`/deploy

**Jangan:**
- Jangan bikin transfer rutin (di luar lingkup, tidak diminta)
- Jangan bikin konsep "recurring rule milik household" — ini murni milik satu user dengan tag opsional, identik transaksi biasa
- Jangan bikin auto-pause berbasis jumlah kegagalan — cukup "gagal → tidak dimajukan, coba lagi run berikutnya"
- Jangan lupa entry point UI-nya (masalah yang baru saja ditemukan & diperbaiki di halaman Kekayaan/Emas) — setiap fitur baru WAJIB tertaut dari suatu tempat yang bisa ditemukan user tanpa tahu URL-nya
