# Todo — 11 Household Membership

## Token

- [ ] `generateInvitationToken()` — acak kriptografis, 32 byte
- [ ] `hashToken(token)` — SHA-256
- [ ] Hanya hash yang disimpan; token asli hanya dikembalikan untuk email
- [ ] Unit test: hash deterministik, token tidak dapat direkonstruksi dari hash

## Service — Undangan

- [ ] `createInvitation` — hanya `owner`; peran hasil selalu `member`; tolak bila sudah anggota; tolak bila ada pending
- [ ] `revokeInvitation` — hanya `owner`
- [ ] `acceptInvitation(token, userId)` — satu transaction:
  - [ ] cari berdasarkan hash, status `pending`, belum kedaluwarsa
  - [ ] cocokkan email terverifikasi user
  - [ ] `UPDATE ... WHERE status = 'pending'` sebagai penjaga
  - [ ] UPSERT `household_members` (active)
- [ ] `expireInvitations()` — untuk cron
- [ ] `listPendingInvitations(householdId)`

## Service — Keanggotaan

- [ ] `removeMember` — hanya `owner`; owner tidak dapat mengeluarkan dirinya sendiri
- [ ] `leaveHousehold(userId, householdId, keepTransactionTags)` — tolak bila owner terakhir
- [ ] `transferOwnership` — hanya `owner`, satu transaction (turunkan lama, naikkan baru)
- [ ] **`revokeSharingFor(tx, userId, householdId)`** — dipanggil saat keluar/dikeluarkan:
  - [ ] `share_wealth` → false
  - [ ] terapkan pilihan tag transaksi

## Email

- [ ] `src/lib/email/client.ts` — Resend
- [ ] Template undangan: nama household, nama pengundang, tombol, masa berlaku
- [ ] **Tanpa data finansial apa pun**
- [ ] `APP_URL` sebagai basis tautan
- [ ] Verifikasi domain SPF + DKIM
- [ ] Preview: arahkan ke inbox uji

## Server Action

- [ ] `inviteMemberAction`, `revokeInvitationAction`, `acceptInvitationAction`
- [ ] `removeMemberAction`, `leaveHouseholdAction`, `transferOwnershipAction`
- [ ] Setiap action memanggil `requireHouseholdMember` dengan `requireOwner` yang benar
- [ ] Kode error: `INVITATION_INVALID`, `ALREADY_MEMBER`, `LAST_OWNER`, `OWNER_ONLY`
- [ ] **Pesan `INVITATION_INVALID` seragam untuk semua penyebab**

## Rate Limit

- [ ] Undangan: 10/hari per household, 3/jam per user
- [ ] Percobaan token: 10/jam per IP
- [ ] Fail closed untuk keduanya

## UI

- [ ] `/household/[id]/members` — bagian Aktif & Menunggu
- [ ] `MemberAvatar` — inisial + warna deterministik (bukan hijau/merah)
- [ ] `RoleBadge`
- [ ] Menu `⋮` hanya bagi `owner`: "Jadikan pemilik" dan "Keluarkan"
- [ ] Sheet undang: email saja (peran hasil selalu `member`)
- [ ] Baris undangan: sisa waktu, Kirim ulang, Cabut
- [ ] Dialog keluar dengan pilihan nasib tag — sesuai [docs/10 §5.3](../../docs/10-ux-states.md#53-dialog-keluar-dari-household)
- [ ] Dialog keluarkan anggota, menjelaskan efeknya
- [ ] **Halaman ini tidak menampilkan angka finansial apa pun**

## Halaman Undangan

- [ ] `/invite/[token]` — dapat diakses tanpa sesi
- [ ] Belum punya akun → daftar → verifikasi → cocokkan otomatis
- [ ] Sudah punya akun → login → layar konfirmasi
- [ ] Layar konfirmasi: *"Bergabung tidak membagikan data keuangan Anda."*
- [ ] Undangan tidak berlaku → halaman khusus, pesan seragam

## Cron

- [ ] `/api/cron/expire-invitations` — bearer `CRON_SECRET`
- [ ] Kedaluwarsakan undangan > 7 hari
- [ ] Idempoten: dijaga `WHERE status = 'pending'`
- [ ] **Tidak menulis ledger entry apa pun**
- [ ] Tambahkan ke `vercel.json`

## Test

- [ ] Integration: token sekali pakai — percobaan kedua gagal
- [ ] Integration: token kedaluwarsa ditolak
- [ ] Integration: undangan ke anggota aktif ditolak
- [ ] Integration: `hi_pending_uniq` menolak pending duplikat
- [ ] Integration: email tidak cocok ditolak
- [ ] Integration: **`member` ditolak pada setiap aksi khusus `owner`**
- [ ] Integration: `member` tidak dapat mengundang maupun mengeluarkan
- [ ] Integration: `owner` tidak dapat mengeluarkan dirinya sendiri
- [ ] Integration: keluar sebagai owner terakhir → `LAST_OWNER`
- [ ] Integration: alih kepemilikan menyisakan tepat satu owner
- [ ] **Integration: anggota dikeluarkan langsung kehilangan akses**
- [ ] **Integration: bergabung tidak membagikan apa pun**
- [ ] Integration: `revokeSharingFor` mematikan `share_wealth`
- [ ] E2E (dua konteks): undang → terima → tampil di daftar anggota
- [ ] E2E: keluarkan anggota → akun itu tidak lagi melihat household

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Kirim undangan sungguhan ke inbox uji di preview, klik tautan
- [ ] Periksa: token tidak muncul di log mana pun
