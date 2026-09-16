# Todo — 10 Household Core

## Guard Otorisasi

- [x] `src/lib/auth/require-household.ts`
- [x] `requireHouseholdMember(tx, userId, householdId, requireOwner = false)`
- [x] Menyaring `status = 'active'`
- [x] Melempar `NotFoundError` (bukan `ForbiddenError`) bila bukan anggota
- [x] Melempar `ForbiddenError` bila `requireOwner` dan peran bukan `owner`
- [x] Unit test keempat kombinasi: {owner, member} × {requireOwner true, false}

## Service

- [x] `createHousehold` — satu transaction: INSERT household + member (owner, active)
- [x] `updateHousehold` — nama, zona waktu; hanya `owner`
- [x] `archiveHousehold` — hanya `owner`
- [x] `listUserHouseholds(userId)` — hanya keanggotaan aktif

## Server Action

- [x] `createHouseholdAction`, `updateHouseholdAction`, `archiveHouseholdAction`
- [x] Zod: nama 1–60 karakter, zona waktu IANA valid
- [x] `revalidatePath('/household')`

## Rute

- [x] `/household/page.tsx` — daftar; redirect bila hanya satu
- [x] `/household/new/page.tsx` — form buat
- [x] `/household/[householdId]/layout.tsx` — **guard keanggotaan**, nav household
- [x] `/household/[householdId]/page.tsx` — ringkasan (sebagian besar masih daftar langkah)
- [x] `/household/[householdId]/settings/page.tsx` — nama, zona waktu, arsipkan
- [x] `not-found.tsx` untuk konteks household

## Context Switcher

- [x] `ContextSwitcher` — Personal + daftar household + "Buat keluarga baru"
- [x] **Tersembunyi sepenuhnya bila user belum punya household**
- [x] Di header (mobile), di atas sidebar (desktop)
- [x] Berpindah = navigasi biasa, tanpa state global
- [x] Slot lencana (diisi task 11 & 13)

## Nav Household

- [x] Sidebar desktop berganti isi saat konteks household aktif
- [x] Menu "Lainnya" di mobile: entri Keluarga menjadi aktif
- [x] Back dari `/household/[id]/...` → `/household/[id]` → `/`

## Ringkasan Kosong

- [x] `SetupSteps` — 3 langkah dengan progres, sesuai [docs/10 §2.1](../../docs/10-ux-states.md#21-ringkasan-keluarga-yang-baru-dibuat)
- [x] Langkah "Undang anggota" nonaktif sampai task 11
- [x] Langkah "Tandai pengeluaran" & "Bagikan" nonaktif sampai task 12
- [x] Blok hilang setelah ketiganya tuntas

## Test

- [x] Unit: keempat kombinasi peran × `requireOwner`
- [x] Integration: buat household → pembuat menjadi owner aktif
- [x] Integration: `hm_single_owner_idx` menolak owner aktif kedua
- [x] Integration: `requireHouseholdMember` menolak anggota `removed`
- [x] Integration: `member` ditolak saat `requireOwner`
- [x] **Integration: anggota household A mendapat `NotFoundError` untuk household B**
- [x] Integration: non-anggota tidak dapat mengubah nama household
- [x] E2E: buat household → switcher muncul → berpindah konteks → URL berubah
- [x] E2E: akun tanpa household → **tidak ada elemen household terlihat di mana pun**
- [x] E2E: akses `/household/<uuid-acak>` → halaman 404

## Verifikasi Akhir

- [x] `npm run verify` hijau
- [x] Periksa manual dengan dua akun: akun B tidak melihat household akun A
- [x] Periksa manual: akun tanpa household — aplikasi terasa persis seperti sebelum task ini
