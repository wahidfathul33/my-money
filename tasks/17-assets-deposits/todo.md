# Todo — 17 Assets: Deposits

## Logika Murni

- [x] `lib/finance/deposit.ts` — `calculateDepositInterest({principal, annualRatePercent, startDate, maturityDate, taxRate})`
- [x] Mengembalikan `{grossInterest, tax, netInterest, maturityValue}`
- [x] `accruedInterest(deposit, asOf)` — untuk estimasi berjalan
- [x] `currentValue(deposit)` — **= pokok untuk `at_maturity`**
- [x] `shouldApplyTax(principal)` — ambang Rp7,5 juta
- [x] `daysRemaining(deposit, today)`
- [x] **Unit test dengan nilai dihitung tangan + komentar aritmetik**
- [x] Unit test: tenor 0 hari → bunga 0
- [x] Unit test: pokok di bawah ambang → pajak 0
- [x] Unit test: pembulatan half-up pada bunga

## Service

- [x] `createDeposit` — satu transaction: INSERT asset + deposit + ledger entry bila didanai dompet
- [x] `updateDeposit` — hanya bila `active`
- [x] `withdrawDeposit` — ledger entry `pokok + bunga_bersih`, status `withdrawn`, asset `disposed`
- [x] `processMaturities()` — untuk cron: `active` → `matured`, proses ARO
- [x] `payMonthlyInterest()` — untuk cron, hanya `payout_schedule = 'monthly'`
- [x] ARO: buat deposito penerus, `rolled_from_id` terisi, pokok sesuai `aro_include_interest`

## Query

- [x] `listDeposits(userId)` — dengan estimasi bunga & sisa hari (dihitung client-side dari field mentah — lihat queries.ts file header)
- [x] `getTotalDepositValue(userId)` — **hanya pokok deposito aktif**
- [x] `getUpcomingMaturities(userId, days)` — untuk dashboard

## Net Worth

- [x] Aset deposito = Σ pokok deposito `active`
- [x] **Verifikasi bunga akrual tidak muncul di jalur perhitungan**
- [x] Unit test: deposito dengan bunga akrual besar → total aset = pokok saja

## Server Action

- [x] `createDepositAction`, `updateDepositAction`, `withdrawDepositAction`
- [x] Zod: pokok > 0, `maturity_date > start_date`, suku bunga 0–100, `tax_rate` 0–1
- [x] Idempotensi pada pembuatan & pencairan

## UI

- [x] `/wealth/assets/deposits` — daftar kartu + total pokok
- [x] Kartu: bank, pokok, suku bunga, jatuh tempo, sisa hari
- [x] Estimasi bunga bersih dengan label **"estimasi, setelah pajak 20%"**, warna sekunder
- [x] Penanda untuk jatuh tempo ≤ 7 hari
- [x] Sheet buat: bank, pokok, suku bunga, tanggal, jadwal, ARO, dompet sumber
- [x] `tax_rate` otomatis 0 bila pokok ≤ Rp7,5 juta, dengan penjelasan
- [x] Dialog pencairan: menampilkan pokok + bunga bersih yang akan diterima
- [x] Peringatan bila mencairkan sebelum jatuh tempo: bunga bisa hangus
- [x] Lencana ARO + tautan ke deposito asal (`rolled_from_id`)
- [x] Toggle `exclude_from_household` (reuses task 12's shared `<ExclusionToggle>`, `entityType: 'asset'`)
- [x] Empty state

## Cron

- [x] `/api/cron/deposit-maturity` — bearer `CRON_SECRET`
- [x] `active` → `matured` pada `maturity_date`
- [x] Proses ARO → deposito penerus
- [x] Bayar bunga bulanan untuk `payout_schedule = 'monthly'`
- [x] **Idempoten:** dijaga status sekarang; panggil dua kali → satu efek
- [x] Proses per batch dengan cursor

## Test

- [x] **Unit: bunga cocok dengan perhitungan tangan**
- [x] Unit: pajak 20% diterapkan di atas ambang, 0 di bawah
- [x] Unit: nilai berjalan `at_maturity` = pokok
- [x] **Unit: bunga akrual tidak masuk total aset**
- [x] Integration: pembuatan mengurangi saldo dompet
- [x] Integration: pencairan menambah saldo sebesar pokok + bunga bersih
- [x] Integration: cron menandai `matured` pada tanggalnya
- [x] Integration: ARO membuat penerus dengan pokok benar
- [x] Integration: ARO dengan `aro_include_interest` → pokok termasuk bunga bersih
- [x] Integration: cron dipanggil dua kali → satu efek
- [x] Integration: bunga bulanan dikreditkan sekali per bulan
- [x] Integration: `CHECK` menolak tanggal & suku bunga tidak sah
- [x] **Integration: isolasi lintas-user**
- [x] E2E: buat deposito → estimasi tampil berlabel → cairkan → saldo naik

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Rekonsiliasi 0 selisih
- [x] Periksa manual: deposito Rp100 juta 4,25% setahun → estimasi bunga bersih ≈ Rp3,4 juta (bukan Rp4,25 juta) — lihat src/lib/finance/__tests__/deposit.test.ts's first test
