# Todo — 07 Transactions Core

## Service

- [ ] `createTransaction` — satu transaction: INSERT tx + `postEntries` + saldo
- [ ] Verifikasi kepemilikan dompet & kategori **di dalam** transaction
- [ ] Verifikasi `category.type` cocok dengan `transaction.type`
- [ ] Tanda diterapkan di batas ledger (`expense` → negatif)
- [ ] `updateTransaction` — void lama + pembalik + entry baru, satu transaction
- [ ] `voidTransaction` — set `voided_at` + pembalik
- [ ] `unvoidTransaction` — untuk aksi Urungkan
- [ ] Penanganan idempotensi: tangkap unique violation → kembalikan yang ada

## Query

- [ ] `getRecentTransactions(userId, limit)`
- [ ] `getMonthlyTotals(userId, period)` — income & expense, mengecualikan transfer & void
- [ ] `getFrequentCategories(userId, type, limit)` — 30 hari terakhir

## Server Action

- [ ] `createTransactionAction`, `updateTransactionAction`, `voidTransactionAction`, `unvoidTransactionAction`
- [ ] Skema Zod: `amount` sebagai string digit, `idempotencyKey` UUID wajib
- [ ] Wrapper `action` (auth → validasi → rate limit → handler → peta error)
- [ ] `revalidatePath('/')`, `'/transactions'`, `'/wallets'`

## Keypad

- [ ] `AmountKeypad` — 1-9, 0, `000`, `.`, hapus, `+`, `−`, simpan
- [ ] Aritmetika berurutan: `45000 + 12000` → simpan mengevaluasi lalu mengirim
- [ ] Tampilan nominal `text-display`, `tabular-nums`
- [ ] Tombol simpan nonaktif saat 0
- [ ] Target sentuh ≥ 44px
- [ ] Unit test evaluasi aritmetika, termasuk operasi berantai

## Sheet

- [ ] `AddTransactionSheet` — segmented Pengeluaran | Pemasukan (Transfer menyusul task 08)
- [ ] Autofokus nominal, keypad terbuka
- [ ] Chip kategori: 4 tersering + "lainnya"
- [ ] Grid kategori penuh di sheet bertingkat
- [ ] Baris meta: dompet · tanggal · catatan — **tinggi tetap**, sisakan ruang untuk toggle household
- [ ] `WalletPicker` — sheet
- [ ] Pemilih tanggal: Hari ini / Kemarin / pilih
- [ ] `idempotencyKey` dibuat saat sheet dibuka, diperbarui tiap kali dibuka ulang
- [ ] Konfirmasi "Buang input?" saat menutup dengan nominal terisi
- [ ] Tombol simpan menjadi spinner + nonaktif saat mengirim

## Setelah Simpan

- [ ] Sheet tertutup, tidak ada navigasi
- [ ] Toast "Tersimpan" + aksi Urungkan, 5 detik
- [ ] Toast di atas bottom nav
- [ ] Angka dashboard terbarui

## Edit & Void

- [ ] Sheet detail transaksi dengan aksi Edit / Hapus
- [ ] Form edit terisi nilai lama
- [ ] Hapus langsung diterapkan + undo (tanpa dialog)
- [ ] Geser kiri pada item daftar → hapus cepat

## Test

- [ ] Unit: aritmetika keypad
- [ ] Unit: tanda diterapkan sesuai `type`
- [ ] Integration: saldo berubah benar untuk income & expense
- [ ] Integration: **rollback** saat kategori tidak sah → nol perubahan
- [ ] Integration: idempotensi — kunci sama dua kali → satu transaksi, saldo terpotong sekali
- [ ] Integration: edit mengoreksi saldo dengan benar
- [ ] Integration: void + unvoid mengembalikan saldo seperti semula
- [ ] Integration: transaksi ter-void dikecualikan dari `getMonthlyTotals`
- [ ] Integration: kategori `income` ditolak untuk transaksi `expense`
- [ ] **Integration: isolasi lintas-user** (dompet & kategori)
- [ ] Integration: rekonsiliasi 0 selisih setelah rangkaian catat/edit/void
- [ ] E2E: alur 3 tap, ukur durasi < 5 detik
- [ ] E2E: undo memulihkan transaksi & saldo

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Rekonsiliasi 0 selisih
- [ ] Periksa manual: catat pengeluaran satu tangan di 360px, < 5 detik
