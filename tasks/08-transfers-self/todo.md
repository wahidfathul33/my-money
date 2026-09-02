# Todo — 08 Transfers (Self)

## Logika Murni

- [ ] `src/lib/finance/transfer.ts` — bentuk entry dari input transfer
- [ ] Unit test: menghasilkan dua entry dengan tanda berlawanan, jumlah 0

## Service

- [ ] `createSelfTransfer` — satu transaction:
  - [ ] verifikasi **kedua** dompet milik user, keduanya aktif
  - [ ] INSERT `transactions` (type `transfer`, category null, counterparty null)
  - [ ] `postEntries` dua entry
- [ ] `voidTransfer` — membalikkan kedua entry, satu transaction
- [ ] Penanganan idempotensi

## Query

- [ ] `getTransferDetail(transactionId)` — nama dompet asal & tujuan dari kedua entry
- [ ] Pastikan `getMonthlyTotals` mengecualikan `type = 'transfer'`

## Server Action

- [ ] `createSelfTransferAction`, `voidTransferAction`
- [ ] Zod: `fromWalletId ≠ toWalletId` di level skema
- [ ] `revalidatePath('/')`, `'/transactions'`, `'/wallets'`

## UI

- [ ] Tab "Transfer" pada `AddTransactionSheet`
- [ ] Ganti baris kategori dengan pemilih Dari → Ke
- [ ] Sembunyikan kategori sepenuhnya di mode transfer
- [ ] Dompet tujuan mengecualikan dompet asal dari daftar
- [ ] Dompet diarsipkan tidak muncul di kedua pemilih
- [ ] Item riwayat transfer: ikon `⇄`, "BCA → GoPay", warna netral, tanpa tanda

## Test

- [ ] Integration: kedua saldo berubah benar
- [ ] Integration: tepat dua ledger entry, Σ = 0
- [ ] Integration: satu baris `transactions`, `counterparty_user_id` NULL
- [ ] Integration: **rollback** saat dompet tujuan tidak sah
- [ ] Integration: dompet asal = tujuan ditolak
- [ ] Integration: dompet diarsipkan ditolak
- [ ] Integration: transfer tidak muncul di total income/expense
- [ ] Integration: void membalikkan kedua entry
- [ ] Integration: idempotensi — kunci sama dua kali → satu transfer
- [ ] **Integration: isolasi lintas-user**
- [ ] Property test: net worth tidak berubah oleh transfer
- [ ] Integration: `CHECK tx_category_rule` menolak transfer ber-kategori
- [ ] E2E: transfer → kedua saldo benar → tampil netral di riwayat

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Rekonsiliasi 0 selisih
- [ ] Periksa manual: transfer tidak mengubah total pengeluaran bulan ini
