# Task 07 — Transactions Core

**Fase:** F1 · **Bergantung pada:** 05, 06 · **Dokumen:** [03-domain §8](../../docs/03-domain-model.md#8-transaksi), [05-financial-integrity](../../docs/05-financial-integrity.md), [09-screen §2](../../docs/09-screen-specs.md#2-add-transaction--bottom-sheet)

## Objektif

Alur pencatatan transaksi — **fitur terpenting di seluruh aplikasi**.

Ini satu-satunya hal yang dilakukan pengguna berkali-kali setiap hari. Kalau terasa merepotkan, mereka berhenti mencatat dalam dua minggu, dan setiap fitur lain menjadi tidak berguna karena tidak ada datanya.

Karena itu task ini punya dua ukuran keberhasilan yang sama pentingnya: **benar** (saldo selalu cocok dengan ledger) dan **cepat** (≤ 3 tap, < 5 detik).

## Ruang Lingkup

**Termasuk:** catat income & expense, sheet + keypad kustom, ledger atomik, edit, void + undo, idempotensi, default cerdas.

**Tidak termasuk:** transfer (task 08) · riwayat & filter (task 09) · tag household (task 12).

## Alur Target

```
[Home] → tap FAB                    ← tap 1
  → keypad terbuka, fokus di nominal
  → ketik nominal
  → tap kategori dari chip "sering dipakai"   ← tap 2
  → dompet & tanggal terisi otomatis
  → tap Simpan                      ← tap 3
  → toast "Tersimpan" + Urungkan (5 detik)
```

**Default yang harus benar:** dompet dari `users.default_wallet_id` atau yang terakhir dipakai · tanggal hari ini · tab "Pengeluaran" aktif · 4 kategori tersering 30 hari terakhir sebagai chip.

## Aturan Integritas

Setiap operasi adalah **satu** DB transaction sesuai [05 §4](../../docs/05-financial-integrity.md#4-batas-transaksi-per-operasi):

- **Catat:** `transactions` INSERT · `ledger_entries` INSERT · `wallets.balance` UPDATE
- **Edit:** void entry lama · pembalik INSERT · entry baru INSERT · saldo UPDATE
- **Void:** `voided_at` SET · pembalik INSERT · saldo UPDATE

`transactions.amount` **selalu positif**. Tanda diterapkan di batas ledger, ditentukan `type` — bukan disimpan di kolom amount. Ini mencegah kelas bug di mana nominal negatif tersimpan dan setiap agregasi harus mengingat aturan tandanya sendiri.

**Idempotensi:** klien membuat UUID saat sheet dibuka dan mengirimnya sebagai `idempotencyKey`. Pengulangan mengembalikan hasil yang sudah ada, **bukan error** — dari sisi pengguna, hasilnya memang benar.

## Kriteria Penerimaan

- [ ] Mencatat pengeluaran dari dashboard selesai dalam **3 tap** (di luar mengetik nominal).
- [ ] Keypad kustom: angka, `000`, `.`, hapus, `+`, `−`, simpan. `+`/`−` mengevaluasi berurutan.
- [ ] Tombol Simpan nonaktif saat nominal 0.
- [ ] Kategori: 4 tersering + "lainnya" yang membuka grid penuh.
- [ ] Dompet dan tanggal terisi default dengan benar.
- [ ] Setelah simpan: sheet tertutup, toast + Urungkan 5 detik, angka dashboard terbarui.
- [ ] Urungkan memulihkan transaksi beserta ledger entry-nya, atomik.
- [ ] Menutup sheet dengan nominal terisi → konfirmasi "Buang input?".
- [ ] Edit transaksi mengoreksi saldo dengan benar; riwayat perubahan tetap dapat diaudit.
- [ ] Void menyembunyikan transaksi dari daftar dan mengecualikannya dari seluruh agregasi.
- [ ] Mengirim `idempotencyKey` yang sama dua kali menghasilkan satu transaksi; saldo terpotong sekali.
- [ ] Validasi: kategori cocok dengan `type`; tanggal ≤ besok; nominal > 0; dompet & kategori milik user.
- [ ] **Test rollback:** kategori tidak sah → nol perubahan tersisa, saldo utuh.
- [ ] **Test isolasi:** user B tidak dapat mencatat ke dompet user A.
- [ ] Rekonsiliasi 0 selisih setelah rangkaian catat/edit/void.

## Verifikasi

```bash
npm run test        # unit + integration: atomisitas, idempotensi, rollback, isolasi
npm run test:e2e    # alur 3 tap, ukur durasi < 5 detik
npm run dev         # periksa manual di 360px, satu tangan
```

## Berkas yang Disentuh

Baru: `src/features/transactions/{actions,queries,schema}.ts` · `src/features/transactions/components/{add-sheet,amount-keypad,category-picker,wallet-picker}.tsx` · `src/lib/services/transactions.ts` · test.
Diubah: `src/components/layout/bottom-nav.tsx` (FAB membuka sheet sungguhan).

## Batasan

**Selalu:** satu DB transaction per operasi · `amount` positif, tanda di ledger · verifikasi kepemilikan di dalam transaction · hormati `idempotencyKey`.
**Tanya dulu:** menambah field ke form · mengubah alur 3 tap.
**Jangan:** menyimpan nominal negatif di `transactions.amount` · hard delete · menyentuh `wallets.balance` di luar `postEntries` · menaruh state sheet di URL.

## Catatan

**Keypad kustom, bukan keyboard OS.** Tinggi sheet menjadi dapat diprediksi (keyboard OS tingginya berbeda-beda dan sering menutupi tombol simpan), tombol kalkulator bisa disisipkan, dan `000` menghemat banyak ketukan pada nominal rupiah.

Toggle household (🏠) di baris meta **belum ada** di task ini — ia ditambahkan di task 12. Sisakan ruangnya di tata letak agar penambahannya nanti tidak menggeser posisi tombol Simpan.
