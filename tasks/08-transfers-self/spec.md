# Task 08 — Transfers (Self)

**Fase:** F1 · **Bergantung pada:** 07 · **Dokumen:** [03-domain §9](../../docs/03-domain-model.md#9-transfer), [04-database §7](../../docs/04-database-schema.md#7-transaksi--ledger)

## Objektif

Transfer antar dompet milik sendiri, dengan model data yang **sudah siap menampung transfer antar anggota** di task 13 tanpa perlu dibongkar.

## Ruang Lingkup

**Termasuk:** satu transaksi + dua ledger entry, tab Transfer di sheet, tampilan netral di riwayat, void transfer.

**Tidak termasuk:** transfer antar anggota (task 13) — tetapi struktur datanya dibangun di sini.

## Model Data

```
Transfer Rp500.000 dari BCA ke GoPay (keduanya milik Wahid):

transactions
  T1  type=transfer  user=Wahid  amount=50000000
      category_id=NULL  counterparty_user_id=NULL

ledger_entries
  L1  dompet=BCA     amount=-50000000  transaction_id=T1
  L2  dompet=GoPay   amount=+50000000  transaction_id=T1
```

**Tidak ada tabel grup.** Kedua entry sudah terhubung lewat `transaction_id` — menambahkan tabel penghubung di atasnya hanya menduplikasi informasi yang sudah ada.

**Invarian I2:** untuk transaksi `type='transfer'` dengan `counterparty_user_id IS NULL`, `SUM(ledger_entries.amount) = 0`.

Kolom `counterparty_user_id` sudah ada di skema dari task 03 dan **selalu NULL** di task ini. Task 13 mengaktifkannya untuk transfer ke anggota household — dan bentuknya sengaja dibuat sedemikian rupa sehingga transfer ke anggota menghasilkan **satu** entry, bukan dua.

## Aturan

**Transfer bukan income maupun expense.** Dikecualikan dari setiap agregasi income/expense, dari budget, dan dari laporan. Kalau transfer terhitung sebagai expense, total pengeluaran bulanan meledak dan angkanya tidak bermakna — kesalahan yang langsung menghancurkan kepercayaan pada aplikasi.

**Perlakuan visual netral.** Warna `--color-neutral-flow`, tanpa awalan `+` atau `−`. Transfer bukan untung maupun rugi.

**Kategori harus null.** Ditegakkan `CHECK tx_category_rule`.

## Kriteria Penerimaan

- [ ] Tab "Transfer" di sheet mengganti baris kategori dengan pemilih asal → tujuan.
- [ ] Transfer membuat satu `transactions` dan dua `ledger_entries` — satu DB transaction.
- [ ] Saldo asal turun dan saldo tujuan naik dengan nominal yang sama.
- [ ] `SUM(ledger_entries.amount) = 0` per transaksi transfer — diverifikasi test.
- [ ] Validasi menolak: dompet asal = tujuan · dompet diarsipkan · dompet bukan milik user · nominal ≤ 0.
- [ ] Transfer **tidak** muncul di total income maupun expense.
- [ ] Di riwayat, transfer tampil netral dengan format "BCA → GoPay", tanpa tanda.
- [ ] Void transfer membalikkan **kedua** entry dalam satu transaction.
- [ ] Net worth tidak berubah sebelum dan sesudah transfer — property test.
- [ ] Idempotensi berfungsi seperti pada transaksi biasa.
- [ ] **Test rollback:** dompet tujuan tidak sah → nol perubahan, saldo asal utuh.
- [ ] **Test isolasi:** user B tidak dapat mentransfer dari dompet user A.

## Verifikasi

```bash
npm run test        # integration atomisitas + property test net worth
npm run test:e2e    # transfer → cek kedua saldo
```

## Berkas yang Disentuh

Baru: `src/features/transfers/{actions,queries,schema}.ts` · `src/features/transfers/components/transfer-form.tsx` · `src/lib/services/transfers.ts` · `src/lib/finance/transfer.ts` · test.
Diubah: `src/features/transactions/components/add-sheet.tsx` (tab Transfer) · komponen item riwayat (perlakuan netral).

## Batasan

**Selalu:** kedua entry dalam satu DB transaction · kategori null pada transfer · kecualikan dari agregasi income/expense.
**Tanya dulu:** menambah jenis transfer.
**Jangan:** memodelkan transfer sebagai pasangan expense + income · mewarnai transfer merah/hijau · membuat tabel grup atau tabel `transfers` terpisah.

## Catatan

Perhatikan perbedaan bentuk antara kedua jenis transfer, dan bahwa ini disengaja:

| | Transfer sendiri (task ini) | Transfer ke anggota (task 13) |
|-|------------------------------|-------------------------------|
| Baris transaksi | 1 | 1 per orang, masing-masing ditulis pemiliknya |
| Ledger entry | 2 (kedua dompet milik sendiri) | **1** — hanya dompet milik pencatat |
| Σ entry per transaksi | 0 | −amount (pengirim) atau +amount (penerima) |

Karena transfer ke anggota tidak pernah menulis dua entry sekaligus, invarian I2 hanya berlaku untuk transfer sendiri. Itulah sebabnya predikatnya menyertakan `counterparty_user_id IS NULL`.
