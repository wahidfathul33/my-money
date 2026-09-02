# Task 05 — Dompet

**Fase:** F1 · **Bergantung pada:** 02, 04 · **Dokumen:** [03-domain §6](../../docs/03-domain-model.md#6-dompet), [04-database §5](../../docs/04-database-schema.md#5-dompet)

## Objektif

CRUD dompet dengan saldo yang selalu dapat ditelusuri ke ledger, dan semantik kartu kredit yang benar sejak awal.

## Ruang Lingkup

**Termasuk:** daftar & detail dompet, buat/edit/arsip, saldo awal sebagai `opening_balance`, kartu kredit sebagai liabilitas, penyesuaian saldo, urutan dompet, dompet default.

**Tidak termasuk:** `exclude_from_household` (task 12) · transaksi (task 07).

## Aturan Penting

**Saldo awal bukan pengecualian.** Dompet dengan saldo awal ≠ 0 menulis `ledger_entry` bertipe `opening_balance`. Ini menjaga invarian "saldo = Σ entry" berlaku tanpa kasus khusus — dan kasus khusus pada invarian finansial adalah tempat bug bersembunyi.

**Kartu kredit adalah liabilitas.** Saldonya ≤ 0 (dijaga `CHECK`), dikecualikan dari "Total Kas", masuk liabilitas sebesar nilai absolutnya. Belanja membuatnya makin negatif; membayar tagihan menggerakkannya ke arah nol.

**Penyesuaian saldo tidak menimpa.** Ketika saldo asli berbeda dengan yang tercatat, sistem membuat `adjustment` entry sebesar selisihnya. Selisihnya terlihat di riwayat sebagai "Penyesuaian saldo" — jujur bahwa ada koreksi, bukan menyembunyikannya.

**Arsip, bukan hapus.** Dompet dengan ledger entry tidak dapat dihapus keras. Dompet tanpa entry sama sekali boleh.

## Kriteria Penerimaan

- [ ] Daftar dompet dikelompokkan per jenis, dengan total per kelompok; kartu kredit dikelompokkan terpisah berlabel "Liabilitas".
- [ ] Membuat dompet dengan saldo awal ≠ 0 menghasilkan `opening_balance` entry; `wallets.balance` = nominal itu.
- [ ] `CHECK` menolak kartu kredit bersaldo positif — diverifikasi test.
- [ ] "Total Kas" tidak menyertakan kartu kredit.
- [ ] Penyesuaian saldo membuat `adjustment` entry sebesar selisih; saldo akhir = nilai yang dimasukkan user.
- [ ] Dompet dengan entry tidak dapat dihapus; dialog menawarkan arsip sebagai gantinya.
- [ ] Dompet diarsipkan hilang dari pemilih tetapi riwayatnya tetap ada.
- [ ] Urutan dompet dapat diubah (tekan-lama di mobile) dan bertahan.
- [ ] `users.default_wallet_id` dapat diubah dari detail wallet.
- [ ] Setelah setiap operasi, `wallets.balance` = `SUM(ledger_entries.amount)` — diverifikasi rekonsiliasi.
- [ ] **Test isolasi:** user B tidak dapat membaca, mengubah, atau mengarsipkan dompet user A.

## Verifikasi

```bash
npm run test        # unit + integration dompet, termasuk isolasi
npm run test:e2e    # buat dompet → saldo awal muncul → arsipkan
npm run dev         # periksa manual di 360px
```

## Berkas yang Disentuh

Baru: `src/features/wallets/{actions,queries,schema}.ts` · `src/features/wallets/components/*` · `src/lib/services/wallets.ts` · `src/app/(app)/wallets/{page,[id]/page}.tsx` · test.

## Batasan

**Selalu:** saldo hanya berubah lewat `postEntries` · verifikasi kepemilikan di dalam transaction · `bigint` untuk nominal.
**Tanya dulu:** menambah jenis dompet baru.
**Jangan:** `UPDATE dompet SET balance = <nilai absolut>` · menghapus dompet yang punya entry · menambahkan `household_id` ke tabel wallets.

## Catatan

Meski `exclude_from_household` sudah ada di skema dari task 03, kolom itu **tidak disentuh** di task ini. Ia diaktifkan di task 12 bersama seluruh mekanisme berbagi lainnya, agar aturan privasinya lahir utuh, bukan sepotong.

Tidak ada tabel izin yang menempel pada dompet — lihat [ADR-024](../../docs/16-decision-log.md#adr-024--tidak-ada-acl-per-objek).
