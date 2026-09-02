# Task 15 — Savings Goals

**Fase:** F3 · **Bergantung pada:** 11 · **Dokumen:** [03-domain §10](../../docs/03-domain-model.md#10-savings-goal), [ADR-026](../../docs/16-decision-log.md#adr-026--savings-hanya-kontribusi-yang-memindahkan-uang)

## Objektif

Savings goal pribadi dan bersama, dengan kontribusi yang **selalu memindahkan uang**.

## Ruang Lingkup

**Termasuk:** CRUD goal pribadi & bersama, kontribusi dari dompet, penarikan, progress, riwayat kontribusi per anggota.

**Tidak termasuk:** mode "komitmen" tanpa memindahkan uang (**ditolak untuk MVP** — [ADR-026](../../docs/16-decision-log.md#adr-026--savings-hanya-kontribusi-yang-memindahkan-uang)) · auto-debit terjadwal (v1.x).

## Satu Mode Saja

Kontribusi mengurangi saldo dompet dan menambah pos tabungan, dalam satu transaction. `savings_contributions.ledger_entry_id` bersifat `NOT NULL`.

```
Kontribusi Rp1.000.000 dari BCA ke goal "Dana Darurat":

ledger_entries         dompet=BCA  −100000000   ← saldo BENAR-BENAR turun
savings_contributions  goal        +100000000

Net worth: Kas −1jt, Tabungan +1jt ⇒ berubah 0.
```

`NOT NULL` itu membuat penghitungan ganda **mustahil secara struktural**: tidak ada cara menambah angka tabungan tanpa mengurangi saldo wallet.

**Kenapa tidak ada mode "komitmen".** Mencatat niat yang tidak didukung dana yang bergerak akan menambah angka ke pos tabungan sementara uangnya masih terhitung penuh di saldo dompet — jalur penghitungan ganda paling halus yang bisa ada di sistem ini, dan satu-satunya yang memerlukan pertahanan berlapis hanya untuk menahannya.

Niat sudah terwakili `target_amount` dan saran kontribusi bulanan.

## Goal Bersama

`household_id IS NOT NULL`. Kontribusi tiap anggota terlihat dengan namanya, dan **selalu berasal dari dompet pribadi kontributor** — sistem tidak pernah membuat saldo bersama.

```
🎯 Liburan Keluarga — target Rp20.000.000
   Wahid   Rp5.000.000
   Istri   Rp3.000.000
   ─────────────────────
   Total   Rp8.000.000   → 40%
```

**Penarikan hanya atas kontribusi sendiri, ke dompet sendiri** — konsekuensi langsung dari aturan "setiap orang hanya menulis buku besarnya sendiri".

## Kriteria Penerimaan

- [ ] CRUD goal pribadi dan bersama; goal bersama dapat dibuat anggota mana pun.
- [ ] Kontribusi: ledger entry ada, saldo dompet turun, `current_amount` naik — satu transaction.
- [ ] `ledger_entry_id NOT NULL` menolak kontribusi tanpa ledger entry — diverifikasi test.
- [ ] Penarikan hanya atas kontribusi milik penarik, ke dompet miliknya.
- [ ] Kontribusi tidak mengubah net worth — hanya berpindah pos (property test).
- [ ] Formula progress, sisa, sisa waktu, saran bulanan sesuai [03 §10.3](../../docs/03-domain-model.md#103-formula).
- [ ] Goal bersama menampilkan saran bulanan per anggota.
- [ ] Riwayat kontribusi menampilkan nama kontributor pada goal bersama.
- [ ] Status `completed` otomatis saat progress ≥ target.
- [ ] Target terlewat menampilkan "Target terlewat", bukan angka negatif.
- [ ] Kontribusi savings **tidak pernah** terhitung sebagai expense.
- [ ] **Test isolasi:** anggota tidak dapat menarik kontribusi anggota lain, dan tidak dapat menarik ke dompet orang lain.

## Verifikasi

```bash
npm run test        # property test net worth + integration kontribusi & penarikan
npm run test:e2e    # kontribusi → saldo turun → net worth tetap
```

## Berkas yang Disentuh

Baru: `src/features/savings/{actions,queries,schema}.ts` · `src/features/savings/components/{goal-card,contribute-sheet,contribution-history,member-contributions}.tsx` · `src/lib/services/savings.ts` · `src/lib/finance/savings.ts` · `src/app/(app)/wealth/savings/**` · `src/app/(app)/household/[householdId]/savings/**` · test.
Diubah: `src/lib/finance/net-worth.ts` (tambah pos tabungan).

## Batasan

**Selalu:** setiap kontribusi berpasangan dengan ledger entry, satu transaction · penarikan hanya atas kontribusi sendiri.
**Tanya dulu:** menambah mode kontribusi apa pun.
**Jangan:** menambah angka tabungan tanpa mengurangi saldo dompet · mengizinkan penarikan dana anggota lain · memperlakukan kontribusi sebagai expense · membuat saldo bersama.

## Catatan

**Godaan yang akan muncul:** shared goal terasa "kurang" tanpa cara mencatat komitmen yang belum didanai. Kalau kebutuhan itu terbukti nyata, jalurnya adalah catatan non-finansial terpisah yang **tidak pernah** menyentuh `current_amount` maupun perhitungan aset — bukan menambahkan mode pada tabel kontribusi.
