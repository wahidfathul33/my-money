# Todo — 12 Sharing & Privacy

## Modul Visibilitas

- [ ] `src/lib/visibility/transactions.ts` — `visibleTransactionsPredicate(userId, householdIds)` (dua klausa)
- [ ] `src/lib/visibility/household-items.ts` — join `status='active'` + `share_wealth=true` + `exclude_from_household=false`
- [ ] `getActiveHouseholdIds(userId)` — diambil sekali per request
- [ ] **Unit test setiap cabang — target 100%**
- [ ] Aturan lint: query lintas-user wajib melewati modul ini

## Tag Transaksi

- [ ] Tambahkan `householdId` opsional ke `createTransaction` & `updateTransaction`
- [ ] **Verifikasi keanggotaan aktif di dalam transaction**
- [ ] `setTransactionHousehold(id, householdId | null)`
- [ ] `bulkTagTransactions(ids[], householdId)` dengan batas jumlah per panggilan
- [ ] Integration test: household yang bukan miliknya ditolak

## Berbagi Kekayaan

- [ ] `setShareWealth(userId, householdId, share)` — hanya untuk keanggotaan sendiri
- [ ] `setExcludeFromHousehold(entityType, entityId, exclude)` — hanya pemilik
- [ ] Berlaku untuk dompet, aset, hutang, piutang, savings goal
- [ ] `getSharingSummary(userId)` — status per household + daftar pengecualian
- [ ] Integration test: bukan pemilik ditolak
- [ ] Integration test: tidak dapat mengubah `share_wealth` anggota lain

## UI — Toggle Transaksi

- [ ] Toggle 🏠 di baris meta sheet transaksi
- [ ] **Hanya muncul bila anggota household**
- [ ] Pemilih household bila punya lebih dari satu
- [ ] Ingat pilihan terakhir **per kategori**
- [ ] Baris meta tinggi tetap — tombol Simpan tidak bergeser
- [ ] Verifikasi: akun tanpa household melihat baris meta persis seperti sebelumnya

## UI — Berbagi

- [ ] `ShareWealthToggle` + dialog konfirmasi sesuai [docs/10 §5.1](../../docs/10-ux-states.md#51-dialog-mengaktifkan-berbagi-kekayaan)
- [ ] Dialog memuat bagian "TIDAK akan melihat"
- [ ] Mematikan **tanpa** dialog
- [ ] Toggle pengecualian di detail wallet/aset/hutang/piutang/goal

## UI — Pengeluaran Keluarga

- [ ] `/household/[id]/transactions` — struktur seperti riwayat pribadi
- [ ] Nama pembayar sebagai baris meta
- [ ] Chip filter Anggota
- [ ] **Tidak menampilkan saldo dompet**
- [ ] `GET /api/households/[id]/transactions` dengan `requireHouseholdMember`
- [ ] Empty state + CTA penandaan massal

## UI — Penandaan Massal

- [ ] Mode pilih di riwayat transaksi
- [ ] Pilih beberapa → "Tandai ke keluarga"
- [ ] Konfirmasi menyebutkan jumlah
- [ ] Dapat diurungkan

## UI — Yang Saya Bagikan

- [ ] `/settings/sharing` sesuai [docs/09 §17](../../docs/09-screen-specs.md#17-apa-yang-saya-bagikan--settingssharing)
- [ ] Per household: status `share_wealth` + daftar pengecualian + jumlah transaksi bertanda
- [ ] "Berhenti berbagi semuanya" dengan konfirmasi
- [ ] **Tanpa tombol "bagikan semuanya"**
- [ ] Empty state: "Semua data Anda privat"

## Test

- [ ] **Unit: seluruh cabang predikat visibilitas (100%)**
- [ ] **Integration: bergabung ke household tidak membagikan apa pun**
- [ ] Integration: `share_wealth` aktif → kekayaan terlihat anggota lain
- [ ] Integration: mematikan → tidak lagi terlihat pada permintaan berikutnya
- [ ] Integration: `exclude_from_household` menyembunyikan satu item, sisanya tetap
- [ ] Integration: transaksi bertanda terlihat anggota lain; yang tidak bertanda tidak
- [ ] Integration: `owner` tidak dapat melihat dompet pribadi anggota
- [ ] Integration: anggota `removed` tidak lagi terhitung di kekayaan keluarga
- [ ] Integration: tidak dapat mengubah pengaturan berbagi milik orang lain
- [ ] **Integration: isolasi lintas-household**
- [ ] E2E (dua konteks): aktifkan `share_wealth` → terlihat → matikan → hilang
- [ ] E2E: tandai pengeluaran → muncul di pengeluaran keluarga dengan nama pembayar
- [ ] E2E: penandaan massal transaksi lama

## Verifikasi Akhir

- [ ] `npm run test:coverage` — `lib/visibility` 100% cabang
- [ ] `npm run verify` hijau
- [ ] **Grep: tidak ada tabel, kolom, atau array baru yang menyimpan izin per objek per user**
- [ ] Periksa manual dua akun: akun B hanya melihat yang benar-benar dibagikan akun A
