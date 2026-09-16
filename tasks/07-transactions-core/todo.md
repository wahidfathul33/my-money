# Todo — 07 Transactions Core

## Service

- [x] `createTransaction` — satu transaction: INSERT tx + `postEntries` + saldo
- [x] Verifikasi kepemilikan dompet & kategori **di dalam** transaction
- [x] Verifikasi `category.type` cocok dengan `transaction.type`
- [x] Tanda diterapkan di batas ledger (`expense` → negatif)
- [x] `updateTransaction` — void lama + pembalik + entry baru, satu transaction
- [x] `voidTransaction` — set `voided_at` + pembalik
- [x] `unvoidTransaction` — untuk aksi Urungkan
- [x] Penanganan idempotensi: tangkap unique violation → kembalikan yang ada

## Query

- [x] `getRecentTransactions(userId, limit)`
- [x] `getMonthlyTotals(userId, period)` — income & expense, mengecualikan transfer & void
- [x] `getFrequentCategories(userId, type, limit)` — 30 hari terakhir

## Server Action

- [x] `createTransactionAction`, `updateTransactionAction`, `voidTransactionAction`, `unvoidTransactionAction`
- [x] Skema Zod: `amount` sebagai string digit, `idempotencyKey` UUID wajib
- [x] Wrapper `action` (auth → validasi → rate limit → handler → peta error)
- [x] `revalidatePath('/')`, `'/transactions'`, `'/wallets'`

## Keypad

- [x] `AmountKeypad` — 1-9, 0, `000`, `.`, hapus, `+`, `−`, simpan
- [x] Aritmetika berurutan: `45000 + 12000` → simpan mengevaluasi lalu mengirim
- [x] Tampilan nominal `text-display`, `tabular-nums`
- [x] Tombol simpan nonaktif saat 0
- [x] Target sentuh ≥ 44px
- [x] Unit test evaluasi aritmetika, termasuk operasi berantai

## Sheet

- [x] `AddTransactionSheet` — segmented Pengeluaran | Pemasukan (Transfer menyusul task 08)
- [x] Autofokus nominal, keypad terbuka
- [x] Chip kategori: 4 tersering + "lainnya"
- [x] Grid kategori penuh di sheet bertingkat
- [x] Baris meta: dompet · tanggal · catatan — **tinggi tetap**, sisakan ruang untuk toggle household
- [x] `WalletPicker` — sheet
- [x] Pemilih tanggal: Hari ini / Kemarin / pilih
- [x] `idempotencyKey` dibuat saat sheet dibuka, diperbarui tiap kali dibuka ulang
- [x] Konfirmasi "Buang input?" saat menutup dengan nominal terisi
- [x] Tombol simpan menjadi spinner + nonaktif saat mengirim

## Setelah Simpan

- [x] Sheet tertutup, tidak ada navigasi
- [x] Toast "Tersimpan" + aksi Urungkan, 5 detik
- [x] Toast di atas bottom nav
- [x] Angka dashboard terbarui

## Edit & Void

- [x] Sheet detail transaksi dengan aksi Edit / Hapus
- [x] Form edit terisi nilai lama
- [x] Hapus langsung diterapkan + undo (tanpa dialog)
- [x] Geser kiri pada item daftar → hapus cepat

## Test

- [x] Unit: aritmetika keypad
- [x] Unit: tanda diterapkan sesuai `type`
- [x] Integration: saldo berubah benar untuk income & expense
- [x] Integration: **rollback** saat kategori tidak sah → nol perubahan
- [x] Integration: idempotensi — kunci sama dua kali → satu transaksi, saldo terpotong sekali
- [x] Integration: edit mengoreksi saldo dengan benar
- [x] Integration: void + unvoid mengembalikan saldo seperti semula
- [x] Integration: transaksi ter-void dikecualikan dari `getMonthlyTotals`
- [x] Integration: kategori `income` ditolak untuk transaksi `expense`
- [x] **Integration: isolasi lintas-user** (dompet & kategori)
- [x] Integration: rekonsiliasi 0 selisih setelah rangkaian catat/edit/void
- [x] E2E: alur 3 tap, ukur durasi < 5 detik
- [x] E2E: undo memulihkan transaksi & saldo

## Verifikasi Akhir

- [x] `npm run verify` hijau
- [x] Rekonsiliasi 0 selisih
- [x] Periksa manual: catat pengeluaran satu tangan di 360px, < 5 detik
