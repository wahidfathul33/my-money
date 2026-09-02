# Todo — 10 Household Core

## Guard Otorisasi

- [ ] `src/lib/auth/require-household.ts`
- [ ] `requireHouseholdMember(tx, userId, householdId, requireOwner = false)`
- [ ] Menyaring `status = 'active'`
- [ ] Melempar `NotFoundError` (bukan `ForbiddenError`) bila bukan anggota
- [ ] Melempar `ForbiddenError` bila `requireOwner` dan peran bukan `owner`
- [ ] Unit test keempat kombinasi: {owner, member} × {requireOwner true, false}

## Service

- [ ] `createHousehold` — satu transaction: INSERT household + member (owner, active)
- [ ] `updateHousehold` — nama, zona waktu; hanya `owner`
- [ ] `archiveHousehold` — hanya `owner`
- [ ] `listUserHouseholds(userId)` — hanya keanggotaan aktif

## Server Action

- [ ] `createHouseholdAction`, `updateHouseholdAction`, `archiveHouseholdAction`
- [ ] Zod: nama 1–60 karakter, zona waktu IANA valid
- [ ] `revalidatePath('/household')`

## Rute

- [ ] `/household/page.tsx` — daftar; redirect bila hanya satu
- [ ] `/household/new/page.tsx` — form buat
- [ ] `/household/[householdId]/layout.tsx` — **guard keanggotaan**, nav household
- [ ] `/household/[householdId]/page.tsx` — ringkasan (sebagian besar masih daftar langkah)
- [ ] `/household/[householdId]/settings/page.tsx` — nama, zona waktu, arsipkan
- [ ] `not-found.tsx` untuk konteks household

## Context Switcher

- [ ] `ContextSwitcher` — Personal + daftar household + "Buat keluarga baru"
- [ ] **Tersembunyi sepenuhnya bila user belum punya household**
- [ ] Di header (mobile), di atas sidebar (desktop)
- [ ] Berpindah = navigasi biasa, tanpa state global
- [ ] Slot lencana (diisi task 11 & 13)

## Nav Household

- [ ] Sidebar desktop berganti isi saat konteks household aktif
- [ ] Menu "Lainnya" di mobile: entri Keluarga menjadi aktif
- [ ] Back dari `/household/[id]/...` → `/household/[id]` → `/`

## Ringkasan Kosong

- [ ] `SetupSteps` — 3 langkah dengan progres, sesuai [docs/10 §2.1](../../docs/10-ux-states.md#21-ringkasan-keluarga-yang-baru-dibuat)
- [ ] Langkah "Undang anggota" nonaktif sampai task 11
- [ ] Langkah "Tandai pengeluaran" & "Bagikan" nonaktif sampai task 12
- [ ] Blok hilang setelah ketiganya tuntas

## Test

- [ ] Unit: keempat kombinasi peran × `requireOwner`
- [ ] Integration: buat household → pembuat menjadi owner aktif
- [ ] Integration: `hm_single_owner_idx` menolak owner aktif kedua
- [ ] Integration: `requireHouseholdMember` menolak anggota `removed`
- [ ] Integration: `member` ditolak saat `requireOwner`
- [ ] **Integration: anggota household A mendapat `NotFoundError` untuk household B**
- [ ] Integration: non-anggota tidak dapat mengubah nama household
- [ ] E2E: buat household → switcher muncul → berpindah konteks → URL berubah
- [ ] E2E: akun tanpa household → **tidak ada elemen household terlihat di mana pun**
- [ ] E2E: akses `/household/<uuid-acak>` → halaman 404

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Periksa manual dengan dua akun: akun B tidak melihat household akun A
- [ ] Periksa manual: akun tanpa household — aplikasi terasa persis seperti sebelum task ini
