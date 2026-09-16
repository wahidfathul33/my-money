# Todo — 05 Dompet

## Service

- [x] `createWallet` — INSERT dompet + `opening_balance` entry bila saldo awal ≠ 0, satu transaction
- [x] `updateWallet` — nama, ikon, warna (jenis tidak dapat diubah)
- [x] `archiveWallet` / `restoreWallet`
- [x] `deleteWallet` — hanya bila tanpa ledger entry, selain itu melempar
- [x] `adjustWalletBalance` — hitung selisih, tulis `adjustment` entry
- [x] `reorderWallets`
- [x] `setDefaultWallet`
- [x] Semua memverifikasi kepemilikan di dalam transaction

## Query

- [x] `listWallets` — dikelompokkan per jenis, di-scope user
- [x] `getWallet` — dengan transaksi terbaru
- [x] `getTotalCash` — **tidak menyertakan** kartu kredit
- [x] `getTotalCreditCardLiability`

## Server Action

- [x] `createWalletAction`, `updateWalletAction`, `archiveWalletAction`
- [x] `adjustWalletBalanceAction`, `reorderWalletsAction`, `setDefaultWalletAction`
- [x] Skema Zod per action
- [x] `revalidatePath('/wallets')`, `'/'`

## UI

- [x] `/wallets` — daftar dikelompokkan, total per kelompok
- [x] Kartu kredit dikelompokkan terpisah, berlabel "Liabilitas"
- [x] `WalletCard` — nama, jenis, saldo, ikon, warna
- [x] Sheet buat/edit dompet
- [x] `/wallets/[id]` — saldo, transaksi dompet, aksi
- [x] Sheet penyesuaian saldo, menampilkan selisih yang akan dicatat
- [x] Tekan-lama untuk mengurutkan ulang (mobile), drag (desktop)
- [x] Empty state: belum ada dompet
- [x] Dialog konfirmasi hapus, menawarkan arsip

## Test

- [x] Unit: saldo kartu kredit tidak boleh positif
- [x] Integration: saldo awal menghasilkan `opening_balance` entry
- [x] Integration: penyesuaian saldo menghasilkan entry selisih yang benar
- [x] Integration: hapus dompet ber-entry ditolak
- [x] Integration: arsip menyembunyikan dari pemilih, riwayat tetap
- [x] Integration: `getTotalCash` mengecualikan kartu kredit
- [x] **Integration: isolasi lintas-user (baca, ubah, arsip)**
- [x] Integration: rekonsiliasi 0 selisih setelah rangkaian operasi
- [x] E2E: buat dompet → saldo tampil → sesuaikan saldo → arsipkan

## Verifikasi Akhir

- [x] `npm run verify` hijau
- [x] Rekonsiliasi 0 selisih
- [x] Periksa manual di 360px, termasuk pengurutan ulang
