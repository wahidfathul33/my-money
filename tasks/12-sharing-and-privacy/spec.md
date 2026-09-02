# Task 12 — Sharing & Privacy

**Fase:** F2 · **Bergantung pada:** 11 · **Dokumen:** [03 §5](../../docs/03-domain-model.md#5-model-berbagi), [12 §4](../../docs/12-security-and-auth.md#4-query-visibilitas), [ADR-024](../../docs/16-decision-log.md#adr-024--tidak-ada-acl-per-objek), [ADR-028](../../docs/16-decision-log.md#adr-028--berbagi-kekayaan-satu-sakelar-per-anggota)

## Objektif

Membuat data mulai mengalir antar anggota — dengan setiap aliran berasal dari keputusan eksplisit pemiliknya, lewat **dua mekanisme saja**.

## Ruang Lingkup

**Termasuk:** `lib/visibility/**`, tag transaksi ke household, penandaan massal transaksi lama, `share_wealth` per keanggotaan, `exclude_from_household` per item, halaman pengeluaran keluarga, `/settings/sharing`.

**Tidak termasuk:** agregasi kekayaan keluarga (task 19) · budget household (task 14).

## Dua Mekanisme

| # | Mekanisme | Membagikan | Tidak membagikan |
|---|-----------|-----------|------------------|
| 1 | Tag transaksi (`household_id`) | Nominal, kategori, tanggal, catatan, nama pembayar | Saldo dompet |
| 2 | `share_wealth` per keanggotaan | Nilai aset & liabilitas di rincian kekayaan keluarga | Transaksi, isi rekening per dompet |

**Tidak ada mekanisme ketiga.** Tidak ada ACL per objek, tidak ada cara memberi akses kepada orang tertentu. Berbagi selalu ke household sebagai lapisan.

Konsekuensinya, query visibilitas transaksi muat dalam dua klausa tanpa subquery — lihat [12 §4.1](../../docs/12-security-and-auth.md#41-transaksi-yang-boleh-dilihat).

## Modul Visibilitas

`src/lib/visibility/**` berisi predikat dari [12 §4](../../docs/12-security-and-auth.md#4-query-visibilitas). Target coverage **100% cabang** — modulnya kecil, murni, dan menentukan siapa boleh melihat data siapa.

Aturan lint: query lintas-user wajib melewati modul ini.

## Penandaan Massal

Kebanyakan orang membuat household **setelah** berminggu-minggu mencatat. Memaksa mereka menunggu transaksi baru untuk melihat laporan keluarga terisi adalah cara yang tidak perlu untuk kehilangan mereka.

## Kriteria Penerimaan

- [ ] Toggle 🏠 di sheet transaksi; **hanya muncul** bila user anggota household.
- [ ] Toggle tidak menggeser posisi tombol Simpan; baris meta tinggi tetap.
- [ ] Pilihan household terakhir diingat **per kategori**.
- [ ] Keanggotaan aktif diverifikasi **di dalam transaction** saat menulis `household_id`.
- [ ] `share_wealth` default `false`; mengaktifkannya butuh dialog konfirmasi yang menyebutkan apa yang akan **dan tidak akan** terlihat.
- [ ] Mematikan `share_wealth` **tanpa dialog** — penarikan akses tidak boleh punya friksi.
- [ ] `exclude_from_household` dapat di-toggle pada dompet, aset, hutang, piutang, savings goal.
- [ ] Query kekayaan menyaring `status = 'active'` **dan** `share_wealth = true` **dan** `exclude_from_household = false`.
- [ ] Halaman pengeluaran keluarga menampilkan transaksi bertanda dari **semua** anggota, dengan nama pembayar.
- [ ] Halaman itu **tidak** menampilkan saldo dompet siapa pun.
- [ ] Penandaan massal transaksi lama berfungsi dengan konfirmasi jumlah.
- [ ] `/settings/sharing` menampilkan status per household + daftar pengecualian dalam satu layar.
- [ ] "Berhenti berbagi semuanya" mematikan `share_wealth` di seluruh household dengan konfirmasi.
- [ ] **Tidak ada** tombol "bagikan semuanya".
- [ ] Coverage `lib/visibility/**` = 100% cabang.
- [ ] **Test privasi default:** bergabung tidak membagikan apa pun.
- [ ] **Test pencabutan:** mematikan `share_wealth` berlaku pada permintaan berikutnya.
- [ ] **Test isolasi:** anggota household X tidak melihat data household Y.

## Verifikasi

```bash
npm run test           # visibilitas 100% cabang + privasi default + pencabutan
npm run test:e2e       # aktifkan berbagi → terlihat → matikan → hilang
npm run test:coverage  # verifikasi 100% pada lib/visibility
```

## Berkas yang Disentuh

Baru: `src/lib/visibility/{transactions,household-items}.ts` · `src/features/sharing/{actions,queries}.ts` · `src/features/sharing/components/{share-wealth-toggle,exclusion-list,sharing-summary}.tsx` · `src/app/(app)/settings/sharing/page.tsx` · `src/app/(app)/household/[householdId]/transactions/page.tsx` · `src/app/api/households/[id]/transactions/route.ts` · test.
Diubah: sheet transaksi (toggle 🏠) · service transaksi (`household_id`) · `eslint.config.mjs`.

## Batasan

**Selalu:** predikat visibilitas hanya dari `lib/visibility/**` · keanggotaan diverifikasi di dalam transaction · query kekayaan menyaring `status = 'active'` dan `share_wealth = true` · default privat.
**Tanya dulu:** menambah mekanisme berbagi ketiga.
**Jangan:** membuat tabel izin per objek · tombol "bagikan semuanya" · konfirmasi saat mencabut · menampilkan saldo dompet di halaman pengeluaran keluarga · menyalin predikat visibilitas ke query lain.

## Catatan

Larangan "membuat tabel izin per objek" berlaku juga untuk bentuk yang terlihat tidak berbahaya — kolom `shared_with_user_id`, tabel `*_permissions`, atau array `visible_to`. Semuanya membawa kembali masalah yang sama: pertanyaan "siapa dapat melihat apa" berubah menjadi penelusuran graf.

Kalau kebutuhan berbagi yang lebih halus muncul, jalurnya adalah ADR baru — bukan kolom yang menumpang di tabel yang sudah ada.
