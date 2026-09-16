# Todo — 06 Categories

## Katalog Kanonis

- [x] `src/lib/db/seed/categories.ts` — `CATEGORY_CATALOG` (10 expense + 6 income)
- [x] Tipe `SystemCategoryKey` sebagai union literal dari katalog
- [x] `seedCategories(tx, userId)` — insert seluruh entri dengan `system_key`
- [x] Idempoten lewat `categories_user_system_key_uniq` (`ON CONFLICT DO NOTHING`)
- [x] Ganti seed sederhana dari task 04 dengan katalog ini
- [x] Unit test: katalog tidak punya kunci duplikat
- [x] Integration test: seeder dipanggil dua kali → satu set kategori

## Set Ikon

- [x] `src/lib/icons.ts` — ~60 ikon lucide terkurasi, dikelompokkan tematik
- [x] Tipe `IconName` sebagai union literal
- [x] Komponen `Icon` yang memetakan nama → komponen (tree-shakeable, bukan barrel import)

## Service

- [x] `createCategory` — verifikasi kepemilikan parent, cek nama unik
- [x] `updateCategory` — nama, ikon, warna, parent (**bukan** `type`)
- [x] `archiveCategory` / `restoreCategory`
- [x] `deleteCategory` — hanya bila tanpa transaksi dan bukan `is_system`
- [x] `reorderCategories`

## Query

- [x] `listCategories(type?)` — hierarkis, di-scope user
- [x] `getRecentCategories(userId, type, limit)` — paling sering dipakai 30 hari terakhir (untuk task 07)
- [x] `getCategoryUsageCount` — untuk cek sebelum hapus

## Server Action

- [x] `createCategoryAction`, `updateCategoryAction`, `archiveCategoryAction`
- [x] `deleteCategoryAction`, `reorderCategoriesAction`
- [x] Skema Zod; nama maks 40 karakter, tidak boleh kosong setelah trim

## UI

- [x] `/settings/categories` — tab Pengeluaran | Pemasukan
- [x] Daftar hierarkis, sub-kategori terindentasi
- [x] Sheet buat/edit — nama, ikon, warna, parent opsional
- [x] Pemilih ikon: grid + pencarian
- [x] Pemilih warna: palet token, bukan color picker bebas
- [x] Lencana kategori bawaan
- [x] Pengurutan ulang
- [x] Dialog hapus: bila terpakai, tampilkan jumlah transaksi + tawarkan arsip

## Test

- [x] Integration: trigger menolak kedalaman 2
- [x] Integration: `CHECK categories_system_no_parent` menolak kategori bawaan ber-parent
- [x] Integration: unique index menolak nama duplikat case-insensitive
- [x] Integration: `name_norm` terisi & mengikuti perubahan nama
- [x] **Integration: mengganti nama kategori bawaan tidak mengubah `system_key`**
- [x] **Integration: `system_key` tidak dapat diisi lewat action mana pun**
- [x] Integration: kategori ber-`system_key` tidak dapat dihapus
- [x] Integration: kategori kustom dibuat dengan `system_key = NULL`
- [x] Integration: kategori terpakai tidak dapat dihapus
- [x] Integration: perubahan `type` ditolak service
- [x] **Integration: isolasi lintas-user**
- [x] E2E: buat → pakai di transaksi → hapus ditolak → arsipkan
- [x] E2E: ganti nama kategori bawaan → tetap muncul, kunci tidak berubah

## Verifikasi Akhir

- [x] `npm run verify` hijau
- [x] Periksa manual: pemilih ikon nyaman di 360px
