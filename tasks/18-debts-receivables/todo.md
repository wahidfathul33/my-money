# Todo — 18 Debts & Receivables

## Logika Murni

- [x] `lib/finance/obligation.ts` — `deriveStatus(initial, remaining)` → active/partially_paid/paid
- [x] `isOverdue(dueDate, status, today, tz)`
- [x] `progressPercent(initial, remaining)`
- [x] Unit test: sisa = awal, sisa sebagian, sisa 0, tanpa `due_date`

## Service — Hutang

- [x] `createDebt` — satu transaction; ledger entry **hanya bila** `affects_wallet`
- [x] `updateDebt` — hanya bila belum ada pembayaran
- [x] `recordDebtPayment` — satu transaction:
  - [x] `SELECT ... FOR UPDATE` pada hutang
  - [x] tolak bila nominal > sisa (`OVERPAYMENT`, sebut sisa)
  - [x] INSERT `debt_payments` + `postEntries` + UPDATE sisa & status
- [x] `voidDebtPayment` — pembalik + sisa dikembalikan
- [x] `writeOffDebt` — status `written_off`

## Service — Piutang

- [x] Padanan lengkap dengan tanda ledger terbalik
- [x] `createReceivable`, `recordReceivablePayment`, `voidReceivablePayment`, `writeOffReceivable`

## Query

- [x] `listDebts(userId)` / `listReceivables(userId)` — dengan `overdue` turunan
- [x] `getTotalDebt(userId)` — status ≠ paid/written_off
- [x] `getTotalReceivable(userId)`
- [x] `getUpcomingDue(userId, days)` — hutang + piutang, untuk dashboard
- [x] `getOverdue(userId)`

## Net Worth

- [x] Liabilitas += Σ sisa hutang
- [x] Aset += Σ sisa piutang **hanya bila** `count_receivables_as_asset`
- [x] Property test: pembayaran hutang tidak mengubah net worth
- [x] Property test: pembayaran piutang tidak mengubah net worth

## Server Action

- [x] `createDebtAction`, `updateDebtAction`, `recordDebtPaymentAction`, `writeOffDebtAction`
- [x] Empat padanan untuk piutang
- [x] `updatePreferencesAction` — toggle `count_receivables_as_asset`
- [x] Zod: nominal > 0, `due_date ≥ start_date`
- [x] Idempotensi pada pembayaran

## UI

- [x] `/wealth/debts` — tab Hutang | Piutang, tab di search param
- [x] Bagian "Jatuh tempo segera" di atas, lalu "Aktif", lalu "Selesai"
- [x] Yang telat paling atas dengan aksen danger
- [x] `ObligationRow` — nama, sisa dari awal, progress bar, jatuh tempo
- [x] Sheet buat: nama pihak, nominal, tanggal, jatuh tempo, catatan, `affects_wallet`
- [x] Pemilih `counterparty_user_id` bila ada household
- [x] Catatan "Pasangan catatan dari {nama} belum ada" bila relevan
- [x] Sheet catat pembayaran: nominal (default = sisa), dompet, tanggal
- [x] Dialog `written_off` dengan peringatan efek pada net worth
- [x] Toggle `exclude_from_household`
- [x] Kartu "Perlu Perhatian" di dashboard
- [x] Toggle "Hitung piutang sebagai aset" di settings
- [x] Empty state hutang & piutang

## Test

- [x] Unit: status turunan, `overdue`, progress
- [x] Integration: `affects_wallet = true` menulis ledger entry
- [x] Integration: `affects_wallet = false` **tidak** menulis ledger entry
- [x] Integration: pembayaran mengurangi saldo & sisa dengan nominal sama
- [x] Integration: **kelebihan bayar ditolak dengan `OVERPAYMENT`**
- [x] Integration: dua pembayaran bersamaan tidak dapat melebihi sisa (`FOR UPDATE`)
- [x] Integration: status otomatis berpindah `active` → `partially_paid` → `paid`
- [x] Integration: `CHECK debt_remaining_valid` menolak sisa tidak sah
- [x] Integration: piutang — tanda ledger terbalik
- [x] Integration: piutang tidak masuk aset secara default (diuji di level pure — `net-worth.test.ts` — karena keputusan hitung-atau-tidak murni komputasi in-memory atas total yang sudah diambil, tanpa I/O sendiri)
- [x] Integration: toggle setting memasukkannya ke aset (pure — `net-worth.test.ts` — plus `settings.integration.test.ts` untuk kolom `count_receivables_as_asset` itu sendiri)
- [x] Integration: `overdue` benar pada batas hari zona waktu (diuji di level pure — `obligation.test.ts` — deterministik atas instant tertentu, lebih presisi daripada integration)
- [x] **Property test: pembayaran hutang tidak mengubah net worth**
- [x] **Integration: isolasi lintas-user**
- [x] E2E: buat hutang → cicil → sisa turun → lunas → pindah ke bagian Selesai

## Verifikasi Akhir

- [x] `npm run verify` hijau — typecheck bersih, lint bersih (0 warning), `vitest run`: 61 file test lulus, 735 test lulus, 0 gagal (durasi ~53 menit, sekuensial dengan sengaja lintas seluruh integration test — lihat vitest.config.ts)
- [x] Rekonsiliasi 0 selisih
- [x] Periksa manual: bayar cicilan → saldo turun, sisa hutang turun, net worth **tidak berubah**
