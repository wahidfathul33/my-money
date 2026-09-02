# Task 13 — Transfers Between Members

**Fase:** F2 · **Bergantung pada:** 11 · **Dokumen:** [03 §9.3](../../docs/03-domain-model.md#93-transfer-ke-anggota-household), [12 §4.3](../../docs/12-security-and-auth.md#43-dompet-yang-boleh-dipilih-sebagai-tujuan-transfer), [ADR-030](../../docs/16-decision-log.md#adr-030--transfer-ke-anggota-mencatat-kedua-sisi-sekaligus)

## Objektif

Mencatat transfer ke anggota household: satu pencatatan, dua sisi, kedua saldo langsung benar.

Ini **satu-satunya operasi di seluruh aplikasi yang menulis ke buku besar orang lain.** Task ini menegakkan batasnya — dan membuktikan bahwa batas itu tidak bocor ke mana-mana.

## Premis

Aplikasi ini **tidak memindahkan uang** — perpindahannya sudah terjadi lewat bank. Kedua saldo memang seharusnya berubah, jadi keduanya dicatat sekaligus, lalu penerima diberi tahu.

Tidak ada status pending, tidak ada persetujuan, tidak ada entry pembalik, tidak ada kedaluwarsa.

## Ruang Lingkup

**Termasuk:** mencatat transfer ke anggota (pilih orang → pilih rekeningnya), query pemilih tujuan, halaman Aktivitas, tandai sudah ditinjau, pindahkan ke dompet lain, hapus sisi sendiri.

**Tidak termasuk:** notifikasi push (v1.x) · pembaruan waktu nyata (v1.x — penerima melihatnya saat memuat halaman).

## Alur

```
Wahid mencatat transfer Rp1.000.000 dari BCA-nya ke BRI Istri
(uangnya sudah pindah lewat m-banking)

SATU DB transaction:
  transactions
    T1  user=Wahid  counterparty=Istri  created_by=Wahid  linked=T2
    T2  user=Istri  counterparty=Wahid  created_by=Wahid  linked=T1
        acknowledged_at=NULL
  ledger_entries
    L1  dompet=BCA Wahid  −1jt  user_id=Wahid   transaction_id=T1
    L2  dompet=BRI Istri  +1jt  user_id=Istri   transaction_id=T2

→ Saldo Wahid −1jt, saldo Istri +1jt, keduanya seketika.
→ Kekayaan keluarga tidak berubah.
→ Lencana Aktivitas Istri bertambah 1.
```

**`ledger_entries.user_id` selalu pemilik dompet**, bukan pencatat. Itu yang menjaga invarian I11 tetap berlaku meski entry-nya ditulis orang lain.

## Batas yang Harus Dijaga

Tiga hal ini yang membuat pengecualian aturan 1.3 dapat diterima:

| Batas | Ditegakkan oleh |
|-------|-----------------|
| Hanya bentuk transfer, hanya sisi penerima | `CHECK tx_created_by_rule` di database |
| Hanya ke dompet yang boleh dituju | Verifikasi di dalam transaction terhadap query §4.3 |
| Penerima berdaulat atas sisinya | Pindahkan & hapus adalah operasi biasa atas transaksinya sendiri |

**Dompet tujuan wajib:** milik `counterpartyUserId`, aktif, `exclude_from_household = false`, dan bukan kartu kredit.

## Pemilih Tujuan

Query terpisah dari query dompet biasa, mengembalikan `TransferTargetDto` yang **tidak punya field saldo sama sekali**. Kebocoran saldo lewat jalur ini menjadi kesalahan tipe, bukan kesalahan review.

## Kriteria Penerimaan

- [ ] Tab "Ke anggota keluarga" muncul di mode transfer bila user punya household.
- [ ] Form memilih **anggota**, lalu **rekening tujuan** milik anggota itu.
- [ ] Pemilih rekening menampilkan nama + jenis saja; kartu kredit dan dompet ber-`exclude_from_household` tidak muncul.
- [ ] **`TransferTargetDto` tidak punya field `balance`** — diverifikasi test.
- [ ] Satu pencatatan menghasilkan 2 transaksi + 2 ledger entry + 2 saldo terbarui, satu DB transaction.
- [ ] `ledger_entries.user_id` = pemilik dompet pada kedua entry.
- [ ] `created_by` = pencatat pada kedua baris transaksi.
- [ ] `linked_transaction_id` terisi dua arah.
- [ ] Validasi: kedua user anggota aktif household yang sama, diperiksa di dalam transaction.
- [ ] Dompet tujuan bukan milik `counterpartyUserId` → ditolak.
- [ ] Dompet tujuan ber-`exclude_from_household` → `WALLET_NOT_ELIGIBLE`.
- [ ] Penerima tanpa dompet layak → ditolak dengan pesan menyebut namanya.
- [ ] Dialog konfirmasi menyatakan bahwa saldo penerima langsung berubah.
- [ ] `/activity` menampilkan transaksi ber-`created_by <> user_id` milik pemanggil.
- [ ] "Oke" mengisi `acknowledged_at`; lencana berkurang.
- [ ] "Pindahkan" memindahkan entry ke dompet lain milik penerima — edit biasa.
- [ ] "Hapus" mem-void sisi penerima dan melepas tautan dua arah.
- [ ] **`CHECK tx_created_by_rule` menolak `created_by <> user_id` di luar sisi penerima transfer** — diverifikasi test.
- [ ] Transfer tidak dihitung sebagai income maupun expense di laporan mana pun.
- [ ] **Property test:** kekayaan keluarga tidak berubah; net worth pengirim −amount, penerima +amount.
- [ ] **Invarian I11, I12, I18, I19 hijau** setelah seluruh operasi task ini.
- [ ] Rollback: kegagalan di tengah tidak menyisakan satu sisi pun.

## Verifikasi

```bash
npm run test        # property test + integration setiap batas
npm run test:e2e    # dua konteks: catat → kedua saldo benar → penerima meninjau
```

## Berkas yang Disentuh

Baru: `src/features/transfers/{member-actions,target-queries}.ts` · `src/features/transfers/components/{member-transfer-form,transfer-target-picker,confirm-member-transfer}.tsx` · `src/features/activity/{queries,actions,components}` · `src/app/(app)/activity/page.tsx` · `src/lib/visibility/transfer-targets.ts` · test.
Diubah: `src/lib/services/transfers.ts` · sheet transaksi (tab) · context switcher (lencana).

## Batasan

**Selalu:** kedua sisi dalam satu DB transaction · `ledger_entries.user_id` = pemilik dompet · `created_by` terisi · dompet tujuan diverifikasi kelayakannya di dalam transaction.
**Tanya dulu:** memperluas bentuk operasi yang boleh menulis ke ledger orang lain.
**Jangan:** menyertakan `balance` di query pemilih tujuan · menulis ke dompet yang tidak lolos §4.3 · membuat jalur kedua yang menulis lintas-ledger · menghitung transfer sebagai income/expense.

## Catatan

**Godaan yang akan muncul:** setelah operasi ini ada, akan terasa "tinggal sedikit lagi" untuk membiarkan anggota mencatatkan pengeluaran atas nama orang lain, atau menyesuaikan saldo anggota lain. Jangan.

`CHECK tx_created_by_rule` sengaja ditulis sesempit mungkin justru untuk itu: memperluasnya menuntut migrasi dan ADR baru, bukan satu baris kode.
