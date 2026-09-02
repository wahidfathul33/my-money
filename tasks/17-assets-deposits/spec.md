# Task 17 — Assets: Deposits (Deposito)

**Fase:** F4 · **Bergantung pada:** 12 · **Dokumen:** [03-domain §11.3](../../docs/03-domain-model.md#113-deposito), [ADR-013](../../docs/16-decision-log.md#adr-013--bunga-akrual-tidak-masuk-net-worth)

## Objektif

Deposito dengan estimasi imbal hasil yang jujur — **setelah pajak**, dan **tanpa mengklaim bunga yang belum diterima sebagai kekayaan**.

## Ruang Lingkup

**Termasuk:** CRUD deposito, perhitungan bunga prorata + PPh 20%, jadwal pembayaran, ARO, pencairan, cron jatuh tempo, `exclude_from_household`.

**Tidak termasuk:** penalti pencairan dini yang dihitung otomatis (dicatat manual bila terjadi).

## Perhitungan

```
tenor_hari        = maturity_date − start_date
bunga_kotor       = principal × (interest_rate_annual/100) × (tenor_hari / 365)
pajak             = bunga_kotor × tax_rate          ← default 0,20
bunga_bersih      = bunga_kotor − pajak
nilai_jatuh_tempo = principal + bunga_bersih
```

**PPh final 20% adalah default** untuk pokok di atas Rp7,5 juta; otomatis 0 di bawah ambang itu. Mengabaikan pajak membuat estimasi imbal hasil terlalu tinggi ~20% — cukup besar untuk memengaruhi keputusan menempatkan dana.

## Bunga Akrual Bukan Kekayaan

Untuk `payout_schedule = at_maturity` (default), **nilai berjalan deposito tetap sebesar pokok** sampai cair. Bunga terakumulasi ditampilkan sebagai estimasi terpisah, berlabel jelas, dan **tidak masuk net worth**.

Alasannya: bunga belum diterima dan mungkin tidak jadi diterima — pencairan dini umumnya menghanguskannya. Net worth yang memuat uang yang belum ada adalah kebohongan kecil yang menumpuk.

Konsekuensinya: net worth naik melonjak saat deposito cair, bukan bertambah bertahap. UI menjelaskannya lewat estimasi yang terlihat sepanjang waktu.

Untuk `monthly`, bunga bersih dikreditkan ke dompet terkait tiap bulan lewat cron — dan sejak saat itu ia memang menjadi kekayaan.

## ARO

Praktik standar di Indonesia. Bila `aro_enabled`, deposito jatuh tempo membuat deposito penerus otomatis dengan pokok = pokok lama, atau pokok + bunga bersih bila `aro_include_interest`. `rolled_from_id` menautkan keduanya.

Tanpa ARO, deposito yang di-roll oleh bank akan tercatat `matured` dan hilang dari net worth padahal dananya masih ada.

## Kriteria Penerimaan

- [ ] CRUD deposito; pembuatan menulis ledger entry (dompet turun) bila didanai dari wallet.
- [ ] Perhitungan bunga cocok dengan nilai yang dihitung tangan — unit test dengan angka eksplisit.
- [ ] `tax_rate` default 0,20; otomatis 0 bila pokok ≤ Rp7.500.000.
- [ ] **Bunga akrual `at_maturity` tidak masuk total aset** — unit test net worth.
- [ ] Nilai berjalan deposito `at_maturity` = pokok, bukan pokok + bunga.
- [ ] `monthly`: cron mengkreditkan bunga bersih ke dompet tiap bulan, idempoten.
- [ ] Cron menandai `matured` pada `maturity_date`.
- [ ] ARO membuat deposito penerus dengan `rolled_from_id` terisi; idempoten.
- [ ] Pencairan menulis ledger entry sebesar `pokok + bunga_bersih` dan menandai `withdrawn`.
- [ ] Jatuh tempo dalam 7 hari muncul di "Perlu Perhatian" dashboard.
- [ ] UI menampilkan estimasi bunga dengan label "estimasi, setelah pajak 20%" dan warna sekunder.
- [ ] `CHECK` menolak `maturity_date ≤ start_date`, suku bunga di luar 0–100, `tax_rate` di luar 0–1.
- [ ] `exclude_from_household` dapat di-toggle.
- [ ] **Test isolasi:** lintas-user.

## Verifikasi

```bash
npm run test        # unit bunga dengan angka dihitung tangan + integration cron & ARO
npm run test:e2e    # buat deposito → estimasi tampil → cairkan → saldo naik
```

## Berkas yang Disentuh

Baru: `src/features/assets/deposits/{actions,queries,schema}.ts` · `src/features/assets/deposits/components/*` · `src/lib/services/deposits.ts` · `src/lib/finance/deposit.ts` · `src/app/(app)/wealth/assets/deposits/**` · `src/app/api/cron/deposit-maturity/route.ts` · test.

## Batasan

**Selalu:** pajak diperhitungkan dalam estimasi · bunga akrual di luar net worth · cron idempoten.
**Tanya dulu:** mengubah ambang pajak · menambah jadwal pembayaran baru.
**Jangan:** memasukkan bunga belum diterima ke total aset · menampilkan estimasi tanpa label · `float` untuk pokok atau bunga.

## Catatan

**Unit test bunga harus memakai nilai harapan yang dihitung tangan**, disertai komentar aritmetiknya — bukan disalin dari output implementasi. Test yang harapannya berasal dari kode yang diuji hanya mengunci bug, tidak menangkapnya.

Contoh dari [14-testing §4](../../docs/14-testing-strategy.md#4-unit-test--logika-finansial) dapat dipakai langsung.
