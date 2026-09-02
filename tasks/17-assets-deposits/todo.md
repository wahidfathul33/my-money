# Todo — 17 Assets: Deposits

## Logika Murni

- [ ] `lib/finance/deposit.ts` — `calculateDepositInterest({principal, annualRatePercent, startDate, maturityDate, taxRate})`
- [ ] Mengembalikan `{grossInterest, tax, netInterest, maturityValue}`
- [ ] `accruedInterest(deposit, asOf)` — untuk estimasi berjalan
- [ ] `currentValue(deposit)` — **= pokok untuk `at_maturity`**
- [ ] `shouldApplyTax(principal)` — ambang Rp7,5 juta
- [ ] `daysRemaining(deposit, today)`
- [ ] **Unit test dengan nilai dihitung tangan + komentar aritmetik**
- [ ] Unit test: tenor 0 hari → bunga 0
- [ ] Unit test: pokok di bawah ambang → pajak 0
- [ ] Unit test: pembulatan half-up pada bunga

## Service

- [ ] `createDeposit` — satu transaction: INSERT asset + deposit + ledger entry bila didanai dompet
- [ ] `updateDeposit` — hanya bila `active`
- [ ] `withdrawDeposit` — ledger entry `pokok + bunga_bersih`, status `withdrawn`, asset `disposed`
- [ ] `processMaturities()` — untuk cron: `active` → `matured`, proses ARO
- [ ] `payMonthlyInterest()` — untuk cron, hanya `payout_schedule = 'monthly'`
- [ ] ARO: buat deposito penerus, `rolled_from_id` terisi, pokok sesuai `aro_include_interest`

## Query

- [ ] `listDeposits(userId)` — dengan estimasi bunga & sisa hari
- [ ] `getTotalDepositValue(userId)` — **hanya pokok deposito aktif**
- [ ] `getUpcomingMaturities(userId, days)` — untuk dashboard

## Net Worth

- [ ] Aset deposito = Σ pokok deposito `active`
- [ ] **Verifikasi bunga akrual tidak muncul di jalur perhitungan**
- [ ] Unit test: deposito dengan bunga akrual besar → total aset = pokok saja

## Server Action

- [ ] `createDepositAction`, `updateDepositAction`, `withdrawDepositAction`
- [ ] Zod: pokok > 0, `maturity_date > start_date`, suku bunga 0–100, `tax_rate` 0–1
- [ ] Idempotensi pada pembuatan & pencairan

## UI

- [ ] `/wealth/assets/deposits` — daftar kartu + total pokok
- [ ] Kartu: bank, pokok, suku bunga, jatuh tempo, sisa hari
- [ ] Estimasi bunga bersih dengan label **"estimasi, setelah pajak 20%"**, warna sekunder
- [ ] Penanda untuk jatuh tempo ≤ 7 hari
- [ ] Sheet buat: bank, pokok, suku bunga, tanggal, jadwal, ARO, dompet sumber
- [ ] `tax_rate` otomatis 0 bila pokok ≤ Rp7,5 juta, dengan penjelasan
- [ ] Dialog pencairan: menampilkan pokok + bunga bersih yang akan diterima
- [ ] Peringatan bila mencairkan sebelum jatuh tempo: bunga bisa hangus
- [ ] Lencana ARO + tautan ke deposito asal (`rolled_from_id`)
- [ ] Toggle `exclude_from_household`
- [ ] Empty state

## Cron

- [ ] `/api/cron/deposit-maturity` — bearer `CRON_SECRET`
- [ ] `active` → `matured` pada `maturity_date`
- [ ] Proses ARO → deposito penerus
- [ ] Bayar bunga bulanan untuk `payout_schedule = 'monthly'`
- [ ] **Idempoten:** dijaga status sekarang; panggil dua kali → satu efek
- [ ] Proses per batch dengan cursor

## Test

- [ ] **Unit: bunga cocok dengan perhitungan tangan**
- [ ] Unit: pajak 20% diterapkan di atas ambang, 0 di bawah
- [ ] Unit: nilai berjalan `at_maturity` = pokok
- [ ] **Unit: bunga akrual tidak masuk total aset**
- [ ] Integration: pembuatan mengurangi saldo dompet
- [ ] Integration: pencairan menambah saldo sebesar pokok + bunga bersih
- [ ] Integration: cron menandai `matured` pada tanggalnya
- [ ] Integration: ARO membuat penerus dengan pokok benar
- [ ] Integration: ARO dengan `aro_include_interest` → pokok termasuk bunga bersih
- [ ] Integration: cron dipanggil dua kali → satu efek
- [ ] Integration: bunga bulanan dikreditkan sekali per bulan
- [ ] Integration: `CHECK` menolak tanggal & suku bunga tidak sah
- [ ] **Integration: isolasi lintas-user**
- [ ] E2E: buat deposito → estimasi tampil berlabel → cairkan → saldo naik

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Rekonsiliasi 0 selisih
- [ ] Periksa manual: deposito Rp100 juta 4,25% setahun → estimasi bunga bersih ≈ Rp3,4 juta (bukan Rp4,25 juta)
