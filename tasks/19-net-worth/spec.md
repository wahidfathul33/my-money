# Task 19 — Net Worth

**Fase:** F5 · **Bergantung pada:** 15, 16, 17, 18 · **Dokumen:** [03-domain §14](../../docs/03-domain-model.md#14-net-worth), [ADR-029](../../docs/16-decision-log.md#adr-029--kekayaan-keluarga-ditampilkan-per-anggota)

## Objektif

Menyatukan seluruh sumber aset dan liabilitas menjadi dua angka yang dapat dipercaya — pribadi dan keluarga — beserta bukti bahwa keduanya benar.

Task ini adalah tempat setiap invarian anti-double-count diuji bersamaan. Kalau ada satu modul sebelumnya yang menghitung uang dua kali, di sinilah ia terlihat.

## Ruang Lingkup

**Termasuk:** perhitungan net worth pribadi & household, `CoverageNote`, halaman rincian keduanya, snapshot harian keduanya, tren dengan penanda perubahan cakupan, penelusuran ke modul sumber.

**Tidak termasuk:** dashboard (task 20) · laporan (task 21).

## Formula

Pribadi dan household sesuai [03-domain §14.1–14.2](../../docs/03-domain-model.md#141-pribadi).

Yang mudah salah dan harus diperiksa satu per satu:

| Komponen | Aturan |
|----------|--------|
| Dompet cash/bank/ewallet | Hanya `balance > 0`; yang negatif masuk liabilitas |
| Kartu kredit | Selalu liabilitas sebesar `ABS(balance)`, tidak pernah aset |
| Tabungan | Σ kontribusi non-void; setiap kontribusi berpasangan ledger entry |
| Emas | Berat × **harga buyback**, bukan harga jual |
| Deposito | **Pokok saja** untuk `at_maturity`; bunga akrual tidak dihitung |
| Piutang | Aset **hanya bila** `count_receivables_as_asset` |

## Kekayaan Keluarga: Per Anggota Dulu

`HOUSEHOLD_NET_WORTH` menjumlahkan aset dan liabilitas anggota aktif yang `share_wealth = true`, mengecualikan item ber-`exclude_from_household`.

**Tampilan utamanya adalah rincian per anggota, bukan totalnya.** Angka gabungan dari berbagi sebagian — "Rp245 juta dari 2 dari 3 anggota" — sulit dipakai untuk keputusan apa pun. Rincian per anggota tidak ambigu; totalnya tetap ada sebagai baris sekunder yang selalu menyebut cakupannya.

`CoverageNote` bersifat prop non-opsional pada komponen total — merender angkanya tanpa cakupan menghasilkan error TypeScript.

Anggota yang belum berbagi **tetap ditampilkan** berlabel "Belum berbagi". Menyembunyikannya membuat total tampak lebih lengkap daripada sebenarnya.

## Snapshot

Dua tabel terpisah. Snapshot household **tidak direkonstruksi** dari snapshot pribadi: cakupan berbagi berubah kapan saja, dan menghitung ulang belakangan menghasilkan angka historis yang tidak pernah benar-benar ditampilkan ke siapa pun.

`contributing_count` disimpan agar grafik dapat menandai titik perubahan cakupan. Lonjakan karena seorang anggota mulai berbagi bukan pertumbuhan kekayaan.

## Kriteria Penerimaan

- [ ] Rincian net worth pribadi **menjumlah tepat** ke total — diverifikasi test.
- [ ] Seluruh invarian I1–I18 yang relevan hijau.
- [ ] **I13:** transfer ke anggota yang tertaut tidak mengubah kekayaan keluarga.
- [ ] Transfer ke anggota memindahkan kekayaan antar pribadi tetapi **tidak** mengubah total keluarga — property test kedua arah.
- [ ] Kartu kredit muncul di liabilitas, tidak pernah di Total Kas.
- [ ] Emas dinilai dengan harga buyback.
- [ ] Bunga deposito akrual tidak dihitung.
- [ ] Kekayaan keluarga menyaring `status='active'` **dan** `share_wealth=true` **dan** `exclude_from_household=false`.
- [ ] **Tampilan utama adalah per anggota**; total sebagai baris sekunder.
- [ ] `CoverageNote` wajib pada total; komponen menolak dirender tanpanya (tipe non-opsional).
- [ ] Anggota yang belum berbagi tetap tampil berlabel "Belum berbagi".
- [ ] Setiap baris rincian dapat ditap menuju modul sumbernya.
- [ ] Cron menulis snapshot pribadi **dan** household; idempoten lewat `ON CONFLICT`.
- [ ] Grafik tren menandai titik perubahan `contributing_count`.
- [ ] Riwayat < 2 titik → delta disembunyikan, bukan ditampilkan 0%.
- [ ] Net worth negatif ditampilkan apa adanya, tidak disembunyikan.
- [ ] Stacked bar horizontal, bukan pie — terbaca di 360px.

## Verifikasi

```bash
npm run test        # seluruh property test invarian
npm run test:e2e    # rincian menjumlah ke total; cakupan benar
npm run dev         # periksa manual: telusuri satu angka sampai transaksi asalnya
```

## Berkas yang Disentuh

Baru: `src/lib/finance/household-net-worth.ts` · `src/features/net-worth/{queries,components}` · `src/components/finance/{coverage-note,net-worth-hero}.tsx` · `src/app/(app)/wealth/net-worth/page.tsx` · `src/app/(app)/household/[householdId]/net-worth/page.tsx` · `src/app/api/net-worth/history/route.ts` · `src/app/api/households/[id]/net-worth/route.ts` · `src/app/api/cron/net-worth-snapshot/route.ts` · test.
Diubah: `src/lib/finance/net-worth.ts` (lengkapi seluruh sumber).

## Batasan

**Selalu:** rincian per anggota sebagai tampilan utama · `CoverageNote` menyertai total · snapshot append-only · household menyaring `status='active'` dan `share_wealth=true`.
**Tanya dulu:** menambah kategori aset baru ke formula.
**Jangan:** merender total household tanpa cakupan · menyembunyikan anggota yang belum berbagi · merekonstruksi snapshot household dari snapshot pribadi · memasukkan bunga akrual atau kartu kredit ke aset · pie chart untuk komposisi.

## Catatan

**Penelusuran adalah yang membuat angka ini dipercaya.** Kalau net worth terasa aneh, pengguna harus bisa menelusurinya: total → komposisi → modul → transaksi asal. Tanpa itu, satu angka yang terasa salah cukup untuk menghancurkan kepercayaan pada seluruh aplikasi.

Jalankan job rekonsiliasi sebagai bagian dari test task ini. Kalau ada modul sebelumnya yang meninggalkan selisih, di sinilah tempat paling murah untuk menemukannya.
