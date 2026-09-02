# Todo — 06 Categories

## Katalog Kanonis

- [ ] `src/lib/db/seed/categories.ts` — `CATEGORY_CATALOG` (10 expense + 6 income)
- [ ] Tipe `SystemCategoryKey` sebagai union literal dari katalog
- [ ] `seedCategories(tx, userId)` — insert seluruh entri dengan `system_key`
- [ ] Idempoten lewat `categories_user_system_key_uniq` (`ON CONFLICT DO NOTHING`)
- [ ] Ganti seed sederhana dari task 04 dengan katalog ini
- [ ] Unit test: katalog tidak punya kunci duplikat
- [ ] Integration test: seeder dipanggil dua kali → satu set kategori

## Set Ikon

- [ ] `src/lib/icons.ts` — ~60 ikon lucide terkurasi, dikelompokkan tematik
- [ ] Tipe `IconName` sebagai union literal
- [ ] Komponen `Icon` yang memetakan nama → komponen (tree-shakeable, bukan barrel import)

## Service

- [ ] `createCategory` — verifikasi kepemilikan parent, cek nama unik
- [ ] `updateCategory` — nama, ikon, warna, parent (**bukan** `type`)
- [ ] `archiveCategory` / `restoreCategory`
- [ ] `deleteCategory` — hanya bila tanpa transaksi dan bukan `is_system`
- [ ] `reorderCategories`

## Query

- [ ] `listCategories(type?)` — hierarkis, di-scope user
- [ ] `getRecentCategories(userId, type, limit)` — paling sering dipakai 30 hari terakhir (untuk task 07)
- [ ] `getCategoryUsageCount` — untuk cek sebelum hapus

## Server Action

- [ ] `createCategoryAction`, `updateCategoryAction`, `archiveCategoryAction`
- [ ] `deleteCategoryAction`, `reorderCategoriesAction`
- [ ] Skema Zod; nama maks 40 karakter, tidak boleh kosong setelah trim

## UI

- [ ] `/settings/categories` — tab Pengeluaran | Pemasukan
- [ ] Daftar hierarkis, sub-kategori terindentasi
- [ ] Sheet buat/edit — nama, ikon, warna, parent opsional
- [ ] Pemilih ikon: grid + pencarian
- [ ] Pemilih warna: palet token, bukan color picker bebas
- [ ] Lencana kategori bawaan
- [ ] Pengurutan ulang
- [ ] Dialog hapus: bila terpakai, tampilkan jumlah transaksi + tawarkan arsip

## Test

- [ ] Integration: trigger menolak kedalaman 2
- [ ] Integration: `CHECK categories_system_no_parent` menolak kategori bawaan ber-parent
- [ ] Integration: unique index menolak nama duplikat case-insensitive
- [ ] Integration: `name_norm` terisi & mengikuti perubahan nama
- [ ] **Integration: mengganti nama kategori bawaan tidak mengubah `system_key`**
- [ ] **Integration: `system_key` tidak dapat diisi lewat action mana pun**
- [ ] Integration: kategori ber-`system_key` tidak dapat dihapus
- [ ] Integration: kategori kustom dibuat dengan `system_key = NULL`
- [ ] Integration: kategori terpakai tidak dapat dihapus
- [ ] Integration: perubahan `type` ditolak service
- [ ] **Integration: isolasi lintas-user**
- [ ] E2E: buat → pakai di transaksi → hapus ditolak → arsipkan
- [ ] E2E: ganti nama kategori bawaan → tetap muncul, kunci tidak berubah

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Periksa manual: pemilih ikon nyaman di 360px
