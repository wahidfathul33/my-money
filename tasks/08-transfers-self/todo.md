# Todo — 08 Transfers (Self)

## Logika Murni

- [x] `src/lib/finance/transfer.ts` — bentuk entry dari input transfer
- [x] Unit test: menghasilkan dua entry dengan tanda berlawanan, jumlah 0

## Service

- [x] `createSelfTransfer` — satu transaction:
  - [ ] verifikasi **kedua** dompet milik user, keduanya aktif
  - [ ] INSERT `transactions` (type `transfer`, category null, counterparty null)
  - [ ] `postEntries` dua entry
- [x] `voidTransfer` — membalikkan kedua entry, satu transaction
- [x] Penanganan idempotensi

## Query

- [x] `getTransferDetail(transactionId)` — nama dompet asal & tujuan dari kedua entry
- [x] Pastikan `getMonthlyTotals` mengecualikan `type = 'transfer'`

## Server Action

- [x] `createSelfTransferAction`, `voidTransferAction`
- [x] Zod: `fromWalletId ≠ toWalletId` di level skema
- [x] `revalidatePath('/')`, `'/transactions'`, `'/wallets'`

## UI

- [x] Tab "Transfer" pada `AddTransactionSheet`
- [x] Ganti baris kategori dengan pemilih Dari → Ke
- [x] Sembunyikan kategori sepenuhnya di mode transfer
- [x] Dompet tujuan mengecualikan dompet asal dari daftar
- [x] Dompet diarsipkan tidak muncul di kedua pemilih
- [x] Item riwayat transfer: ikon `⇄`, "BCA → GoPay", warna netral, tanpa tanda

## Test

- [x] Integration: kedua saldo berubah benar
- [x] Integration: tepat dua ledger entry, Σ = 0
- [x] Integration: satu baris `transactions`, `counterparty_user_id` NULL
- [x] Integration: **rollback** saat dompet tujuan tidak sah
- [x] Integration: dompet asal = tujuan ditolak
- [x] Integration: dompet diarsipkan ditolak
- [x] Integration: transfer tidak muncul di total income/expense
- [x] Integration: void membalikkan kedua entry
- [x] Integration: idempotensi — kunci sama dua kali → satu transfer
- [x] **Integration: isolasi lintas-user**
- [x] Property test: net worth tidak berubah oleh transfer
- [x] Integration: `CHECK tx_category_rule` menolak transfer ber-kategori
- [x] E2E: transfer → kedua saldo benar → tampil netral di riwayat

## Verifikasi Akhir

- [x] `npm run verify` hijau
- [x] Rekonsiliasi 0 selisih
- [x] Periksa manual: transfer tidak mengubah total pengeluaran bulan ini
