# Task 14 — Budgets

**Fase:** F3 · **Bergantung pada:** 11 · **Dokumen:** [03-domain §13](../../docs/03-domain-model.md#13-budget), [04-database §11](../../docs/04-database-schema.md#11-budget)

## Objektif

Budget bulanan dengan dua cakupan — pribadi dan household — yang lahir sekaligus, bukan pribadi dulu lalu ditambal.

## Ruang Lingkup

**Termasuk:** CRUD budget pribadi & household, status ambang, perulangan bulanan, rincian per anggota, cron rollover.

**Tidak termasuk:** rollover sisa anggaran (v1.x, default tidak rollover) · budget total non-kategori (opsional bila waktu cukup).

## Dua Cakupan

| | Budget pribadi | Budget household |
|-|----------------|------------------|
| Pemilik | `user_id` | `household_id` |
| Kategori | `category_id` | `category_key` (= `system_key`) |
| Menghitung | Transaksi user itu | Transaksi bertanda household, semua anggota |
| Peran | Pemilik | Anggota mana pun |

Budget household memakai **`system_key`**, bukan `category_id`, karena tiap anggota punya kategorinya sendiri. Pencocokannya **eksak** — bukan perbandingan teks yang bisa gagal diam-diam pada "Makan dan Minum" atau "Makanan".

Konsekuensinya: budget household hanya dapat dibuat untuk kategori bawaan. Kategori kustom tidak dapat dicocokkan lintas anggota — ia tetap **ditampilkan** di laporan sebagai barisnya sendiri disertai nama pemilik, tetapi tidak dianggarkan bersama.

`CHECK budget_scope_exclusive` memastikan sebuah budget adalah salah satu, tidak pernah keduanya — keadaan setengah pribadi setengah household tidak punya arti dan akan membingungkan setiap query yang menyentuhnya.

## Bukan Double Counting

Sebuah transaksi dapat terhitung pada budget pribadi **dan** budget household sekaligus. Ini bukan penghitungan ganda: keduanya menjawab pertanyaan berbeda — *"apakah saya boros bulan ini"* vs *"apakah keluarga boros bulan ini"* — dan tidak pernah dijumlahkan bersama.

Yang **tidak pernah** terhitung terhadap budget mana pun: transfer, kontribusi savings, pembayaran hutang. Semuanya bukan konsumsi.

## Perulangan

`is_recurring` default `true`. Cron pada tanggal 1 (zona waktu terkait) memateralisasi instance periode baru.

Instance dimaterialisasi per periode, bukan dihitung dari satu baris induk, sehingga riwayat "budget saya bulan Maret berapa" tetap akurat meskipun nominalnya kemudian diubah.

Tanpa perulangan, user harus membuat ulang seluruh budget setiap tanggal 1 — dan sebagian besar akan berhenti melakukannya dalam dua bulan.

## Kriteria Penerimaan

- [ ] Budget pribadi per kategori, periode bulanan.
- [ ] Budget household per `category_key`; anggota mana pun dapat membuat/mengubah.
- [ ] Budget household hanya menerima `system_key` yang ada di katalog — diverifikasi test.
- [ ] `CHECK budget_scope_exclusive` menolak budget bercakupan ganda — diverifikasi test.
- [ ] Terpakai dihitung dengan benar, termasuk sub-kategori.
- [ ] **Transfer, kontribusi savings, dan pembayaran hutang tidak pernah terhitung** — diverifikasi test.
- [ ] Transaksi ter-void dikecualikan.
- [ ] Batas periode memakai zona waktu user (pribadi) dan zona waktu household (household).
- [ ] Status: `safe` < 80% ≤ `warning` < 100% ≤ `over`, dengan warna sesuai.
- [ ] Budget household menampilkan rincian per anggota.
- [ ] `is_recurring` default aktif; cron memateralisasi periode baru; idempoten.
- [ ] Unique index mencegah dua budget untuk kategori & periode yang sama.
- [ ] Dashboard hanya menampilkan budget ≥ 80% — yang sehat tidak butuh perhatian.
- [ ] **Test isolasi:** lintas-user dan lintas-household.

## Verifikasi

```bash
npm run test        # perhitungan terpakai + pengecualian + rollover idempoten
npm run test:e2e    # buat budget → catat pengeluaran → progres bergerak
```

## Berkas yang Disentuh

Baru: `src/features/budgets/{actions,queries,schema}.ts` · `src/features/budgets/components/{budget-bar,budget-sheet,member-breakdown}.tsx` · `src/lib/services/budgets.ts` · `src/lib/finance/budget.ts` · `src/app/(app)/budgets/page.tsx` · `src/app/(app)/household/[householdId]/budgets/page.tsx` · `src/app/api/cron/budget-rollover/route.ts` · test.

## Batasan

**Selalu:** budget household dicocokkan lewat `system_key` · zona waktu yang benar per cakupan · peran diperiksa untuk budget household.
**Tanya dulu:** menambah jenis periode · mengaktifkan rollover sisa.
**Jangan:** menghitung transfer/savings/pembayaran hutang ke budget · menjumlahkan budget pribadi dan household · mencocokkan kategori lewat teks.

## Catatan

**Cron rollover berjalan harian, bukan bulanan.** Ia memeriksa apakah hari ini tanggal 1 di zona waktu terkait. Cron bulanan dalam UTC akan menembak pada tanggal yang salah bagi pengguna WIB.
