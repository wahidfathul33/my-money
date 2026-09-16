# Todo — 11 Household Membership

## Token

- [x] `generateInvitationToken()` — acak kriptografis, 32 byte
- [x] `hashToken(token)` — SHA-256
- [x] Hanya hash yang disimpan; token asli hanya dikembalikan untuk email
- [x] Unit test: hash deterministik, token tidak dapat direkonstruksi dari hash

## Service — Undangan

- [x] `createInvitation` — hanya `owner`; peran hasil selalu `member`; tolak bila sudah anggota; tolak bila ada pending
- [x] `revokeInvitation` — hanya `owner`
- [x] `acceptInvitation(token, userId)` — satu transaction:
  - [ ] cari berdasarkan hash, status `pending`, belum kedaluwarsa
  - [ ] cocokkan email terverifikasi user
  - [ ] `UPDATE ... WHERE status = 'pending'` sebagai penjaga
  - [ ] UPSERT `household_members` (active)
- [x] `expireInvitations()` — untuk cron
- [x] `listPendingInvitations(householdId)`

## Service — Keanggotaan

- [x] `removeMember` — hanya `owner`; owner tidak dapat mengeluarkan dirinya sendiri
- [x] `leaveHousehold(userId, householdId, keepTransactionTags)` — tolak bila owner terakhir
- [x] `transferOwnership` — hanya `owner`, satu transaction (turunkan lama, naikkan baru)
- [x] **`revokeSharingFor(tx, userId, householdId)`** — dipanggil saat keluar/dikeluarkan:
  - [ ] `share_wealth` → false
  - [ ] terapkan pilihan tag transaksi

## Email

- [x] `src/lib/email/client.ts` — Resend
- [x] Template undangan: nama household, nama pengundang, tombol, masa berlaku
- [x] **Tanpa data finansial apa pun**
- [x] `APP_URL` sebagai basis tautan
- [x] Verifikasi domain SPF + DKIM
- [x] Preview: arahkan ke inbox uji

## Server Action

- [x] `inviteMemberAction`, `revokeInvitationAction`, `acceptInvitationAction`
- [x] `removeMemberAction`, `leaveHouseholdAction`, `transferOwnershipAction`
- [x] Setiap action memanggil `requireHouseholdMember` dengan `requireOwner` yang benar
- [x] Kode error: `INVITATION_INVALID`, `ALREADY_MEMBER`, `LAST_OWNER`, `OWNER_ONLY`
- [x] **Pesan `INVITATION_INVALID` seragam untuk semua penyebab**

## Rate Limit

- [x] Undangan: 10/hari per household, 3/jam per user
- [x] Percobaan token: 10/jam per IP
- [x] Fail closed untuk keduanya

## UI

- [x] `/household/[id]/members` — bagian Aktif & Menunggu
- [x] `MemberAvatar` — inisial + warna deterministik (bukan hijau/merah)
- [x] `RoleBadge`
- [x] Menu `⋮` hanya bagi `owner`: "Jadikan pemilik" dan "Keluarkan"
- [x] Sheet undang: email saja (peran hasil selalu `member`)
- [x] Baris undangan: sisa waktu, Kirim ulang, Cabut
- [x] Dialog keluar dengan pilihan nasib tag — sesuai [docs/10 §5.3](../../docs/10-ux-states.md#53-dialog-keluar-dari-household)
- [x] Dialog keluarkan anggota, menjelaskan efeknya
- [x] **Halaman ini tidak menampilkan angka finansial apa pun**

## Halaman Undangan

- [x] `/invite/[token]` — dapat diakses tanpa sesi
- [x] Belum punya akun → daftar → verifikasi → cocokkan otomatis
- [x] Sudah punya akun → login → layar konfirmasi
- [x] Layar konfirmasi: *"Bergabung tidak membagikan data keuangan Anda."*
- [x] Undangan tidak berlaku → halaman khusus, pesan seragam

## Cron

- [x] `/api/cron/expire-invitations` — bearer `CRON_SECRET`
- [x] Kedaluwarsakan undangan > 7 hari
- [x] Idempoten: dijaga `WHERE status = 'pending'`
- [x] **Tidak menulis ledger entry apa pun**
- [x] Tambahkan ke `vercel.json`

## Test

- [x] Integration: token sekali pakai — percobaan kedua gagal
- [x] Integration: token kedaluwarsa ditolak
- [x] Integration: undangan ke anggota aktif ditolak
- [x] Integration: `hi_pending_uniq` menolak pending duplikat
- [x] Integration: email tidak cocok ditolak
- [x] Integration: **`member` ditolak pada setiap aksi khusus `owner`**
- [x] Integration: `member` tidak dapat mengundang maupun mengeluarkan
- [x] Integration: `owner` tidak dapat mengeluarkan dirinya sendiri
- [x] Integration: keluar sebagai owner terakhir → `LAST_OWNER`
- [x] Integration: alih kepemilikan menyisakan tepat satu owner
- [x] **Integration: anggota dikeluarkan langsung kehilangan akses**
- [x] **Integration: bergabung tidak membagikan apa pun**
- [x] Integration: `revokeSharingFor` mematikan `share_wealth`
- [x] E2E (dua konteks): undang → terima → tampil di daftar anggota
- [x] E2E: keluarkan anggota → akun itu tidak lagi melihat household

## Verifikasi Akhir

- [x] `npm run verify` hijau
- [ ] Kirim undangan sungguhan ke inbox uji di preview, klik tautan
- [x] Periksa: token tidak muncul di log mana pun
