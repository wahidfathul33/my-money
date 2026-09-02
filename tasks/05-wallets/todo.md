# Todo — 05 Dompet

## Service

- [ ] `createWallet` — INSERT dompet + `opening_balance` entry bila saldo awal ≠ 0, satu transaction
- [ ] `updateWallet` — nama, ikon, warna (jenis tidak dapat diubah)
- [ ] `archiveWallet` / `restoreWallet`
- [ ] `deleteWallet` — hanya bila tanpa ledger entry, selain itu melempar
- [ ] `adjustWalletBalance` — hitung selisih, tulis `adjustment` entry
- [ ] `reorderWallets`
- [ ] `setDefaultWallet`
- [ ] Semua memverifikasi kepemilikan di dalam transaction

## Query

- [ ] `listWallets` — dikelompokkan per jenis, di-scope user
- [ ] `getWallet` — dengan transaksi terbaru
- [ ] `getTotalCash` — **tidak menyertakan** kartu kredit
- [ ] `getTotalCreditCardLiability`

## Server Action

- [ ] `createWalletAction`, `updateWalletAction`, `archiveWalletAction`
- [ ] `adjustWalletBalanceAction`, `reorderWalletsAction`, `setDefaultWalletAction`
- [ ] Skema Zod per action
- [ ] `revalidatePath('/wallets')`, `'/'`

## UI

- [ ] `/wallets` — daftar dikelompokkan, total per kelompok
- [ ] Kartu kredit dikelompokkan terpisah, berlabel "Liabilitas"
- [ ] `WalletCard` — nama, jenis, saldo, ikon, warna
- [ ] Sheet buat/edit dompet
- [ ] `/wallets/[id]` — saldo, transaksi dompet, aksi
- [ ] Sheet penyesuaian saldo, menampilkan selisih yang akan dicatat
- [ ] Tekan-lama untuk mengurutkan ulang (mobile), drag (desktop)
- [ ] Empty state: belum ada dompet
- [ ] Dialog konfirmasi hapus, menawarkan arsip

## Test

- [ ] Unit: saldo kartu kredit tidak boleh positif
- [ ] Integration: saldo awal menghasilkan `opening_balance` entry
- [ ] Integration: penyesuaian saldo menghasilkan entry selisih yang benar
- [ ] Integration: hapus dompet ber-entry ditolak
- [ ] Integration: arsip menyembunyikan dari pemilih, riwayat tetap
- [ ] Integration: `getTotalCash` mengecualikan kartu kredit
- [ ] **Integration: isolasi lintas-user (baca, ubah, arsip)**
- [ ] Integration: rekonsiliasi 0 selisih setelah rangkaian operasi
- [ ] E2E: buat dompet → saldo tampil → sesuaikan saldo → arsipkan

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Rekonsiliasi 0 selisih
- [ ] Periksa manual di 360px, termasuk pengurutan ulang
