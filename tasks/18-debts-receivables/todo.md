# Todo — 18 Debts & Receivables

## Logika Murni

- [ ] `lib/finance/obligation.ts` — `deriveStatus(initial, remaining)` → active/partially_paid/paid
- [ ] `isOverdue(dueDate, status, today, tz)`
- [ ] `progressPercent(initial, remaining)`
- [ ] Unit test: sisa = awal, sisa sebagian, sisa 0, tanpa `due_date`

## Service — Hutang

- [ ] `createDebt` — satu transaction; ledger entry **hanya bila** `affects_wallet`
- [ ] `updateDebt` — hanya bila belum ada pembayaran
- [ ] `recordDebtPayment` — satu transaction:
  - [ ] `SELECT ... FOR UPDATE` pada hutang
  - [ ] tolak bila nominal > sisa (`OVERPAYMENT`, sebut sisa)
  - [ ] INSERT `debt_payments` + `postEntries` + UPDATE sisa & status
- [ ] `voidDebtPayment` — pembalik + sisa dikembalikan
- [ ] `writeOffDebt` — status `written_off`

## Service — Piutang

- [ ] Padanan lengkap dengan tanda ledger terbalik
- [ ] `createReceivable`, `recordReceivablePayment`, `voidReceivablePayment`, `writeOffReceivable`

## Query

- [ ] `listDebts(userId)` / `listReceivables(userId)` — dengan `overdue` turunan
- [ ] `getTotalDebt(userId)` — status ≠ paid/written_off
- [ ] `getTotalReceivable(userId)`
- [ ] `getUpcomingDue(userId, days)` — hutang + piutang, untuk dashboard
- [ ] `getOverdue(userId)`

## Net Worth

- [ ] Liabilitas += Σ sisa hutang
- [ ] Aset += Σ sisa piutang **hanya bila** `count_receivables_as_asset`
- [ ] Property test: pembayaran hutang tidak mengubah net worth
- [ ] Property test: pembayaran piutang tidak mengubah net worth

## Server Action

- [ ] `createDebtAction`, `updateDebtAction`, `recordDebtPaymentAction`, `writeOffDebtAction`
- [ ] Empat padanan untuk piutang
- [ ] `updatePreferencesAction` — toggle `count_receivables_as_asset`
- [ ] Zod: nominal > 0, `due_date ≥ start_date`
- [ ] Idempotensi pada pembayaran

## UI

- [ ] `/wealth/debts` — tab Hutang | Piutang, tab di search param
- [ ] Bagian "Jatuh tempo segera" di atas, lalu "Aktif", lalu "Selesai"
- [ ] Yang telat paling atas dengan aksen danger
- [ ] `ObligationRow` — nama, sisa dari awal, progress bar, jatuh tempo
- [ ] Sheet buat: nama pihak, nominal, tanggal, jatuh tempo, catatan, `affects_wallet`
- [ ] Pemilih `counterparty_user_id` bila ada household
- [ ] Catatan "Pasangan catatan dari {nama} belum ada" bila relevan
- [ ] Sheet catat pembayaran: nominal (default = sisa), dompet, tanggal
- [ ] Dialog `written_off` dengan peringatan efek pada net worth
- [ ] Toggle `exclude_from_household`
- [ ] Kartu "Perlu Perhatian" di dashboard
- [ ] Toggle "Hitung piutang sebagai aset" di settings
- [ ] Empty state hutang & piutang

## Test

- [ ] Unit: status turunan, `overdue`, progress
- [ ] Integration: `affects_wallet = true` menulis ledger entry
- [ ] Integration: `affects_wallet = false` **tidak** menulis ledger entry
- [ ] Integration: pembayaran mengurangi saldo & sisa dengan nominal sama
- [ ] Integration: **kelebihan bayar ditolak dengan `OVERPAYMENT`**
- [ ] Integration: dua pembayaran bersamaan tidak dapat melebihi sisa (`FOR UPDATE`)
- [ ] Integration: status otomatis berpindah `active` → `partially_paid` → `paid`
- [ ] Integration: `CHECK debt_remaining_valid` menolak sisa tidak sah
- [ ] Integration: piutang — tanda ledger terbalik
- [ ] Integration: piutang tidak masuk aset secara default
- [ ] Integration: toggle setting memasukkannya ke aset
- [ ] Integration: `overdue` benar pada batas hari zona waktu
- [ ] **Property test: pembayaran hutang tidak mengubah net worth**
- [ ] **Integration: isolasi lintas-user**
- [ ] E2E: buat hutang → cicil → sisa turun → lunas → pindah ke bagian Selesai

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Rekonsiliasi 0 selisih
- [ ] Periksa manual: bayar cicilan → saldo turun, sisa hutang turun, net worth **tidak berubah**
