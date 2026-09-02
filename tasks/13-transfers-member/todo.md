# Todo — 13 Transfers Between Members

## Property Test Dulu (harus merah)

- [ ] Transfer ke anggota → kekayaan keluarga **tidak berubah**
- [ ] Transfer ke anggota → net worth pengirim −amount, penerima +amount
- [ ] Jalankan → pastikan merah sebelum implementasi

## Visibilitas Tujuan

- [ ] `src/lib/visibility/transfer-targets.ts` — predikat dari [docs/12 §4.3](../../docs/12-security-and-auth.md#43-dompet-yang-boleh-dipilih-sebagai-tujuan-transfer)
- [ ] Menyaring: anggota aktif · dompet aktif · `exclude_from_household = false` · bukan `credit_card`
- [ ] `TransferTargetDto` — **tanpa field `balance`** (kesalahan tipe bila ditambahkan)
- [ ] `listTransferTargets(userId, householdId)` → anggota + wallet-nya
- [ ] Unit test setiap cabang predikat

## Service

- [ ] `createMemberTransfer({ userId, householdId, fromWalletId, counterpartyUserId, toWalletId, amount, date, note, idempotencyKey })`
- [ ] Satu DB transaction:
  - [ ] verifikasi `fromWalletId` milik `userId`, aktif
  - [ ] `requireHouseholdMember` untuk **kedua** user
  - [ ] verifikasi `toWalletId` lolos predikat `transfer-targets` (`WALLET_NOT_ELIGIBLE` bila tidak)
  - [ ] INSERT 2 `transactions`, `created_by` = `userId` pada keduanya
  - [ ] `postEntries` 2 entry — **`user_id` tiap entry = pemilik wallet-nya**
  - [ ] isi `linked_transaction_id` dua arah
- [ ] `acknowledgeTransaction({ userId, transactionId })` — hanya pemilik
- [ ] Pindahkan dompet & hapus: memakai `updateTransaction` / `voidTransaction` yang sudah ada
- [ ] Void sisi penerima melepas `linked_transaction_id` dua arah

## Query

- [ ] `listActivity(userId)` — `created_by <> user_id`, non-void, terbaru dulu
- [ ] `countUnacknowledged(userId)` — lencana

## Server Action

- [ ] `createMemberTransferAction`, `acknowledgeTransactionAction`
- [ ] Kode error `WALLET_NOT_ELIGIBLE` dengan pesan menyebut nama anggota
- [ ] Idempotensi pada pencatatan
- [ ] `revalidatePath` untuk pencatat

## UI — Mencatat

- [ ] Segmented "Dompet saya" | "Ke anggota keluarga"
- [ ] `TransferTargetPicker` — pilih anggota → pilih rekening (nama + jenis)
- [ ] Catatan: "Saldo {nama} langsung berubah. Ia akan melihatnya di Aktivitas."
- [ ] Dialog konfirmasi sesuai [docs/10 §5.2](../../docs/10-ux-states.md#52-dialog-mencatat-transfer-ke-anggota)
- [ ] Empty state bila anggota belum punya rekening yang dapat dituju

## UI — Aktivitas

- [ ] `/activity` sesuai [docs/09 §14](../../docs/09-screen-specs.md#14-aktivitas--activity)
- [ ] Bagian "Belum ditinjau" dan "Sebelumnya"
- [ ] Kartu: penulis, nominal, dompet tujuan, tanggal, household
- [ ] Aksi Oke / Pindahkan / Hapus
- [ ] Lencana pada context switcher & menu Lainnya
- [ ] Empty state
- [ ] Halaman & lencana tersembunyi bila user tanpa household

## Test

- [ ] **Integration: kedua saldo bergerak benar, satu transaction**
- [ ] Integration: `ledger_entries.user_id` = pemilik dompet pada kedua entry
- [ ] Integration: `created_by` = pencatat pada kedua baris
- [ ] Integration: `linked_transaction_id` dua arah
- [ ] **Integration: rollback — kegagalan di tengah tidak menyisakan satu sisi pun**
- [ ] Integration: dompet tujuan bukan milik counterparty → ditolak
- [ ] Integration: dompet tujuan ber-`exclude_from_household` → `WALLET_NOT_ELIGIBLE`
- [ ] Integration: dompet tujuan kartu kredit → ditolak
- [ ] Integration: user di luar household → ditolak
- [ ] **Integration: `CHECK tx_created_by_rule` menolak `created_by <> user_id` di luar sisi penerima transfer**
- [ ] **Integration: `TransferTargetDto` tidak memuat `balance`**
- [ ] Integration: penerima memindahkan ke dompet lain → entry berpindah, saldo benar
- [ ] Integration: penerima menghapus sisinya → tautan lepas, saldo pengirim tidak tersentuh
- [ ] Integration: bukan pemilik tidak dapat `acknowledge`
- [ ] Integration: transfer tidak masuk agregasi income/expense
- [ ] **Integration: invarian I11, I12, I18, I19 — nol pelanggaran**
- [ ] **Property test keduanya hijau**
- [ ] E2E (dua konteks): catat → kedua saldo benar → muncul di Aktivitas penerima → Oke
- [ ] E2E (dua konteks): penerima memindahkan lalu menghapus

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Rekonsiliasi 0 selisih, termasuk I11 & I19
- [ ] **Audit manual: grep seluruh `postEntries` di `src/lib/services/**`. Hanya `createMemberTransfer` yang boleh menulis entry dengan `user_id` selain pemanggil.**
