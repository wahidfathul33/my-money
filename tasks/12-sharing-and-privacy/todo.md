# Todo — 12 Sharing & Privacy

## Modul Visibilitas

- [x] `src/lib/visibility/transactions.ts` — `visibleTransactionsPredicate(userId, householdIds)` (dua klausa)
- [x] `src/lib/visibility/household-items.ts` — join `status='active'` + `share_wealth=true` + `exclude_from_household=false`
- [x] `getActiveHouseholdIds(userId)` — diambil sekali per request
- [x] **Unit test setiap cabang — target 100%**
- [x] Aturan lint: query lintas-user wajib melewati modul ini

## Tag Transaksi

- [x] Tambahkan `householdId` opsional ke `createTransaction` & `updateTransaction`
- [x] **Verifikasi keanggotaan aktif di dalam transaction**
- [x] `setTransactionHousehold(id, householdId | null)`
- [x] `bulkTagTransactions(ids[], householdId)` dengan batas jumlah per panggilan
- [x] Integration test: household yang bukan miliknya ditolak

## Berbagi Kekayaan

- [x] `setShareWealth(userId, householdId, share)` — hanya untuk keanggotaan sendiri
- [x] `setExcludeFromHousehold(entityType, entityId, exclude)` — hanya pemilik
- [x] Berlaku untuk dompet, aset, hutang, piutang, savings goal
- [x] `getSharingSummary(userId)` — status per household + daftar pengecualian
- [x] Integration test: bukan pemilik ditolak
- [x] Integration test: tidak dapat mengubah `share_wealth` anggota lain

## UI — Toggle Transaksi

- [x] Toggle 🏠 di baris meta sheet transaksi
- [x] **Hanya muncul bila anggota household**
- [x] Pemilih household bila punya lebih dari satu
- [x] Ingat pilihan terakhir **per kategori**
- [x] Baris meta tinggi tetap — tombol Simpan tidak bergeser
- [x] Verifikasi: akun tanpa household melihat baris meta persis seperti sebelumnya

## UI — Berbagi

- [x] `ShareWealthToggle` + dialog konfirmasi sesuai [docs/10 §5.1](../../docs/10-ux-states.md#51-dialog-mengaktifkan-berbagi-kekayaan)
- [x] Dialog memuat bagian "TIDAK akan melihat"
- [x] Mematikan **tanpa** dialog
- [x] Toggle pengecualian di detail wallet/aset/hutang/piutang/goal

## UI — Pengeluaran Keluarga

- [x] `/household/[id]/transactions` — struktur seperti riwayat pribadi
- [x] Nama pembayar sebagai baris meta
- [x] Chip filter Anggota
- [x] **Tidak menampilkan saldo dompet**
- [x] `GET /api/households/[id]/transactions` dengan `requireHouseholdMember`
- [x] Empty state + CTA penandaan massal

## UI — Penandaan Massal

- [x] Mode pilih di riwayat transaksi
- [x] Pilih beberapa → "Tandai ke keluarga"
- [x] Konfirmasi menyebutkan jumlah
- [x] Dapat diurungkan

## UI — Yang Saya Bagikan

- [x] `/settings/sharing` sesuai [docs/09 §17](../../docs/09-screen-specs.md#17-apa-yang-saya-bagikan--settingssharing)
- [x] Per household: status `share_wealth` + daftar pengecualian + jumlah transaksi bertanda
- [x] "Berhenti berbagi semuanya" dengan konfirmasi
- [x] **Tanpa tombol "bagikan semuanya"**
- [x] Empty state: "Semua data Anda privat"

## Test

- [x] **Unit: seluruh cabang predikat visibilitas (100%)**
- [x] **Integration: bergabung ke household tidak membagikan apa pun**
- [x] Integration: `share_wealth` aktif → kekayaan terlihat anggota lain
- [x] Integration: mematikan → tidak lagi terlihat pada permintaan berikutnya
- [x] Integration: `exclude_from_household` menyembunyikan satu item, sisanya tetap
- [x] Integration: transaksi bertanda terlihat anggota lain; yang tidak bertanda tidak
- [x] Integration: `owner` tidak dapat melihat dompet pribadi anggota
- [x] Integration: anggota `removed` tidak lagi terhitung di kekayaan keluarga
- [x] Integration: tidak dapat mengubah pengaturan berbagi milik orang lain
- [x] **Integration: isolasi lintas-household**
- [x] E2E (dua konteks): aktifkan `share_wealth` → terlihat → matikan → hilang
- [x] E2E: tandai pengeluaran → muncul di pengeluaran keluarga dengan nama pembayar
- [x] E2E: penandaan massal transaksi lama

## Verifikasi Akhir

- [x] `npm run test:coverage` — `lib/visibility` 100% cabang
- [x] `npm run verify` hijau
- [x] **Grep: tidak ada tabel, kolom, atau array baru yang menyimpan izin per objek per user**
- [x] Periksa manual dua akun: akun B hanya melihat yang benar-benar dibagikan akun A
