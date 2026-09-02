# Task 18 — Debts & Receivables

**Fase:** F4 · **Bergantung pada:** 12 · **Dokumen:** [03-domain §12](../../docs/03-domain-model.md#12-hutang--piutang), [ADR-010](../../docs/16-decision-log.md#adr-010--piutang-tidak-dihitung-sebagai-aset-secara-default)

## Objektif

Hutang dan piutang dengan pembayaran yang selalu meninggalkan net worth tidak berubah, dan piutang yang diperlakukan konservatif.

## Ruang Lingkup

**Termasuk:** CRUD hutang & piutang, `affects_wallet`, cicilan/pelunasan sebagian, status, jatuh tempo & telat, `counterparty_user_id`, `exclude_from_household`, setting piutang sebagai aset.

**Tidak termasuk:** amortisasi · bunga majemuk · penautan otomatis dua sisi antar anggota (v1.x).

## Struktur Cermin

| | Hutang | Piutang |
|-|--------|---------|
| Arti | Saya meminjam | Orang lain meminjam dari saya |
| Saat dibuat (`affects_wallet`) | Dompet **+** | Dompet **−** |
| Saat dibayar | Dompet **−**, sisa turun | Dompet **+**, sisa turun |
| Net worth | Liabilitas | Aset (dapat dikonfigurasi) |

## `affects_wallet`

Tidak semua hutang melibatkan kas masuk — seorang teman membelikan sesuatu untuk Anda, jadi Anda berhutang tanpa pernah menerima uang tunai. Bendera ini menentukan apakah pembuatan hutang menulis ledger entry.

Memaksa ledger entry pada kasus itu akan menciptakan saldo dompet palsu.

## Piutang di Net Worth

Default: **tidak dihitung sebagai aset**, ditampilkan terpisah di bawah pemisah. Piutang personal (pinjaman ke teman/keluarga) punya tingkat gagal bayar tinggi, dan net worth sebaiknya konservatif.

Setting `count_receivables_as_asset` tersedia bagi yang tidak setuju.

## Status Turunan

`overdue` **bukan kolom tersimpan**. Ia diturunkan (`due_date < hari_ini AND status ≠ paid`). Kalau disimpan, ia akan basi setiap tengah malam dan butuh cron hanya untuk memperbaruinya.

## Kriteria Penerimaan

- [ ] CRUD hutang & piutang; `affects_wallet` menentukan ada tidaknya ledger entry saat pembuatan.
- [ ] Pembayaran: `debt_payments` + ledger entry + `remaining_amount` turun + status diperbarui — satu transaction.
- [ ] `FOR UPDATE` saat validasi; kelebihan bayar ditolak dengan `OVERPAYMENT` dan menyebut sisa.
- [ ] Status otomatis: `active` → `partially_paid` → `paid`.
- [ ] `CHECK debt_remaining_valid` menolak sisa negatif atau melebihi nominal awal.
- [ ] **Pembayaran hutang tidak mengubah net worth** — property test.
- [ ] `overdue` diturunkan, bukan disimpan.
- [ ] Jatuh tempo ≤ 7 hari dan yang telat muncul di "Perlu Perhatian" dashboard.
- [ ] Piutang tidak dihitung sebagai aset secara default; setting mengubahnya.
- [ ] `counterparty_user_id` dapat diisi bila lawannya sesama anggota household.
- [ ] Bila terisi dan pasangan catatannya belum ada, UI menampilkan: *"Pasangan catatan dari {nama} belum ada."*
- [ ] `exclude_from_household` dapat di-toggle.
- [ ] `written_off` tersedia untuk yang tidak tertagih, dengan konfirmasi (mengubah net worth).
- [ ] **Test isolasi:** lintas-user.

## Verifikasi

```bash
npm run test        # property test net worth + integration kelebihan bayar & status
npm run test:e2e    # buat hutang → cicil → sisa turun → lunas
```

## Berkas yang Disentuh

Baru: `src/features/obligations/{actions,queries,schema}.ts` · `src/features/obligations/components/*` · `src/lib/services/obligations.ts` · `src/app/(app)/wealth/debts/**` · test.
Diubah: `src/lib/finance/net-worth.ts` (liabilitas + piutang opsional) · settings (toggle piutang sebagai aset).

## Batasan

**Selalu:** `FOR UPDATE` saat memvalidasi terhadap sisa · pembayaran dalam satu transaction · `overdue` diturunkan.
**Tanya dulu:** menambah perhitungan bunga majemuk · mengubah default piutang.
**Jangan:** menyimpan `overdue` sebagai kolom · mengizinkan kelebihan bayar · menghapus keras hutang yang punya pembayaran.

## Catatan

**Hutang antar anggota household.** Bila kedua sisi dicatat dan keduanya disertakan di household, agregasi menjumlahkan `+X` aset dan `−X` liabilitas sehingga saling meniadakan — hasil yang benar.

Bila hanya satu sisi dicatat, kekayaan keluarga menjadi miring. Sistem tidak dapat mendeteksinya otomatis, tetapi `counterparty_user_id` memungkinkan UI menampilkan catatan pengingat. Penautan dua sisi otomatis dijadwalkan v1.x.
