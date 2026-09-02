# Task 06 — Categories

**Fase:** F1 · **Bergantung pada:** 04 · **Dokumen:** [03-domain §7](../../docs/03-domain-model.md#7-kategori), [04-database §6](../../docs/04-database-schema.md#6-kategori), [ADR-027](../../docs/16-decision-log.md#adr-027--kategori-kanonis-ber-system_key)

## Objektif

Katalog kategori kanonis yang di-seed identik untuk setiap pengguna, plus kategori kustom — sehingga agregasi household nanti dapat mengelompokkan **secara eksak**, bukan dengan mencocokkan teks.

## Ruang Lingkup

**Termasuk:** katalog kanonis + seeder, CRUD kategori kustom, sub-kategori satu tingkat, pemilih ikon terkurasi, arsip, urutan.

**Tidak termasuk:** merge kategori (v1.x) · budget (task 14).

## Katalog Kanonis

Daftar kategori bawaan didefinisikan **di kode** (`src/lib/db/seed/categories.ts`), bukan di database, dan di-seed identik untuk setiap pengguna baru. Setiap entri punya `system_key` yang stabil.

```ts
export const CATEGORY_CATALOG = [
  { systemKey: 'food_drinks',   name: 'Makan & Minum',  type: 'expense', icon: 'utensils' },
  { systemKey: 'transport',     name: 'Transportasi',   type: 'expense', icon: 'car' },
  // … 10 expense + 6 income, lihat docs/03 §7.1
] as const
```

**`system_key` adalah alasan utama task ini ada.** Ia yang membuat "Makan & Minum" milik Wahid dan milik Istri berkumpul pada satu baris laporan keluarga — secara eksak, tanpa membandingkan teks.

Pencocokan lewat nama akan gagal diam-diam pada "Makan dan Minum" atau "Makanan", dan kegagalannya berupa angka salah tanpa tanda apa pun.

**Aturan katalog:** kunci yang sudah dirilis tidak pernah diubah atau dipakai ulang. Menambah kategori bawaan berarti menambah entri **dan** migrasi yang menyisipkannya untuk pengguna yang sudah ada.

## Aturan Lain

**`type` tidak dapat diubah setelah dibuat** — mengubahnya membuat transaksi lama tidak konsisten.

**`system_key` tidak dapat diubah dan tidak dapat diisi pengguna.** Nama kategori bawaan **boleh** diganti; kuncinya tetap, sehingga agregasi household tidak terpengaruh.

**Kedalaman maksimum 1**, ditegakkan trigger database. Kategori bawaan tidak boleh punya parent (`CHECK categories_system_no_parent`).

**Ikon dari set terkurasi**, bukan unggahan.

## Kriteria Penerimaan

- [ ] `CATEGORY_CATALOG` berisi 10 expense + 6 income sesuai [03 §7.1](../../docs/03-domain-model.md#71-katalog-kanonis).
- [ ] Seeder membuat seluruh entri katalog untuk pengguna baru, dengan `system_key` terisi.
- [ ] Seeder idempoten: dipanggil dua kali tidak menduplikasi (`categories_user_system_key_uniq`).
- [ ] Kategori bawaan dapat diarsipkan dan **diganti namanya**, tetapi tidak dapat dihapus.
- [ ] Mengganti nama kategori bawaan **tidak** mengubah `system_key`.
- [ ] Kategori kustom dibuat dengan `system_key = NULL`.
- [ ] `system_key` tidak dapat diisi lewat action mana pun — diverifikasi test.
- [ ] `type` tidak dapat diubah setelah dibuat.
- [ ] Trigger menolak sub-kategori pada kategori yang sendirinya punya parent.
- [ ] `CHECK categories_system_no_parent` menolak kategori bawaan ber-parent.
- [ ] Kategori yang dipakai transaksi tidak dapat dihapus; dialog menawarkan arsip.
- [ ] Unique index menolak nama duplikat (case-insensitive) dalam satu `type`.
- [ ] Urutan kategori dapat diubah dan bertahan.
- [ ] Pemilih ikon menampilkan ~60 ikon terkurasi dengan pencarian.
- [ ] **Test isolasi:** user B tidak dapat membaca atau mengubah kategori user A.

## Verifikasi

```bash
npm run test        # unit + integration, termasuk trigger kedalaman & isolasi
npm run test:e2e    # buat kategori → dipakai transaksi → tidak dapat dihapus
```

## Berkas yang Disentuh

Baru: `src/lib/db/seed/categories.ts` (katalog) · `src/features/categories/{actions,queries,schema}.ts` · `src/features/categories/components/*` · `src/lib/services/categories.ts` · `src/app/(app)/settings/categories/page.tsx` · `src/lib/icons.ts` · test.
Diubah: `src/lib/db/seed.ts` (memakai katalog).

## Batasan

**Selalu:** verifikasi kepemilikan di dalam transaction · seeder idempoten · `system_key` hanya diisi seeder.
**Tanya dulu:** menambah entri katalog · memperbolehkan kedalaman > 1.
**Jangan:** mengubah atau memakai ulang `system_key` yang sudah dirilis · mengizinkan perubahan `type` · mengizinkan pengguna mengisi `system_key` · menghapus kategori terpakai · unggahan ikon.

## Catatan

Set ikon di `src/lib/icons.ts` dipakai juga oleh dompet dan savings goal. Dibuat sekali di sini, dipakai berulang.

Task 04 sudah membuat seed kategori sederhana. Task ini **menggantinya** dengan katalog kanonis ber-`system_key`. Karena belum ada data produksi, penggantiannya cukup mengubah kode seeder — tanpa migrasi data.

