# Task 10 — Household Core

**Fase:** F2 · **Bergantung pada:** 09 · **Dokumen:** [03-domain §4](../../docs/03-domain-model.md#4-household), [12-security §2–3](../../docs/12-security-and-auth.md#2-model-otorisasi)

## Objektif

Membangun entitas household, guard otorisasinya, dan kerangka konteks `/household/[id]` — **tanpa berbagi data apa pun**.

Task ini sengaja tidak menampilkan angka finansial siapa pun. Ia membangun wadah dan penjaganya lebih dulu, sehingga ketika data mulai mengalir di task 12, aturan aksesnya sudah ada dan sudah teruji.

## Ruang Lingkup

**Termasuk:** buat household, `requireHouseholdMember`, layout & guard `/household/[id]`, context switcher, daftar household, ubah nama & zona waktu, arsipkan.

**Tidak termasuk:** undangan & peran (task 11) · berbagi data (task 12) · transfer antar anggota (task 13). Pembuat household otomatis menjadi `owner`; tidak ada anggota lain sampai task 11.

## Aturan Otorisasi

Ini bagian terpenting dari task ini.

```ts
// Dipanggil di dalam transaction, bukan sebelumnya —
// keanggotaan dapat dicabut kapan saja.
await requireHouseholdMember(tx, userId, householdId, /* requireOwner */ true)
```

**Melempar `NotFoundError`, bukan `ForbiddenError`, saat bukan anggota.** Membedakan "household ini tidak ada" dari "household ini ada tapi Anda bukan anggota" membocorkan keberadaan household orang lain kepada siapa pun yang menebak UUID.

**Peran tidak memberi akses ke data pribadi anggota lain.** Prinsip ini ditegakkan sejak sini agar tidak ada kode yang terlanjur mengasumsikan sebaliknya. Lihat [12-security §2](../../docs/12-security-and-auth.md#2-model-otorisasi).

## Context Switcher

Sesuai [02-IA §3](../../docs/02-information-architecture.md#3-context-switcher). Berpindah konteks adalah **navigasi biasa** ke `/` atau `/household/[id]` — tanpa state global, tanpa mode tersimpan.

**Disembunyikan sepenuhnya bila user belum punya household.** Pengguna yang tidak memakai fitur ini tidak boleh melihat jejaknya sama sekali. Ini kriteria penerimaan, bukan preferensi — lihat risiko di [01-product §5](../../docs/01-product-analysis.md#5-risiko-produk).

## Kriteria Penerimaan

- [ ] Membuat household menghasilkan `households` + `household_members` (owner, active) dalam satu transaction.
- [ ] `hm_single_owner_idx` memastikan tepat satu owner aktif — diverifikasi test.
- [ ] `/household` menampilkan daftar; redirect langsung bila user hanya punya satu.
- [ ] `/household/[id]/layout.tsx` memanggil guard; non-anggota menerima **404**, bukan 403.
- [ ] `requireHouseholdMember` memeriksa status `active` **dan** peringkat peran.
- [ ] Context switcher tampil di header (mobile) dan atas sidebar (desktop).
- [ ] **Pengguna tanpa household tidak melihat elemen household apa pun** — switcher tersembunyi, hanya ada satu entri "Buat keluarga" di menu Lainnya.
- [ ] Berpindah konteks mengubah URL; tidak ada state tersimpan.
- [ ] Owner dapat mengubah nama dan zona waktu; peran lain tidak.
- [ ] Mengarsipkan household menyembunyikannya dari switcher tanpa menyentuh data anggota mana pun.
- [ ] Ringkasan keluarga menampilkan daftar langkah untuk household baru — lihat [10-ux §2.1](../../docs/10-ux-states.md#21-ringkasan-keluarga-yang-baru-dibuat).
- [ ] **Test isolasi lintas-household:** anggota household A menerima 404 saat mengakses household B.

## Verifikasi

```bash
npm run test        # unit peringkat peran + integration guard & isolasi
npm run test:e2e    # buat household → switcher muncul → berpindah konteks
npm run dev         # periksa: akun tanpa household tidak melihat jejak fitur ini
```

## Berkas yang Disentuh

Baru: `src/lib/auth/require-household.ts` · `src/features/household/{actions,queries,schema}.ts` · `src/features/household/components/{context-switcher,household-nav,setup-steps}.tsx` · `src/lib/services/households.ts` · `src/app/(app)/household/**` · test.
Diubah: `src/components/layout/{app-shell,bottom-nav,sidebar}.tsx`.

## Batasan

**Selalu:** `requireHouseholdMember` di dalam transaction · `NotFoundError` untuk non-anggota · konteks dari URL.
**Tanya dulu:** menambah peran baru · mengubah struktur rute household.
**Jangan:** memberi household kepemilikan atas entitas finansial apa pun · menyimpan konteks aktif di cookie/session · mengasumsikan peran memberi akses ke data pribadi · menampilkan elemen household kepada pengguna yang tidak punya household.

## Catatan

Halaman `/household/[id]` di task ini sebagian besar berupa daftar langkah dan tautan. Isinya menyusul: pengeluaran keluarga di task 12, budget di 14, tabungan di 15, kekayaan di 19.

Membangun guard-nya lebih dulu berarti setiap halaman yang ditambahkan sesudahnya otomatis terlindungi — bukan perlu diamankan satu per satu.
