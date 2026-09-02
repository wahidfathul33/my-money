# Task 11 — Household Membership

**Fase:** F2 · **Bergantung pada:** 10 · **Dokumen:** [03-domain §4.2–4.4](../../docs/03-domain-model.md#42-dua-peran), [12-security §5](../../docs/12-security-and-auth.md#5-ancaman-khusus-household)

## Objektif

Undangan, peran, dan keluar/keluarkan — sehingga beberapa orang benar-benar dapat berada dalam satu household.

Ini task pertama yang melibatkan **dua pengguna nyata**, dan karenanya task pertama di mana kesalahan otorisasi berdampak pada orang lain, bukan hanya pada diri sendiri.

## Ruang Lingkup

**Termasuk:** kirim/cabut undangan, terima undangan (termasuk untuk yang belum punya akun), keluarkan anggota, keluar sendiri, alih kepemilikan, email undangan, halaman Anggota.

**Tidak termasuk:** berbagi data (task 12). Bergabung ke household di task ini **tidak membagikan apa pun** — itu justru yang harus dibuktikan.

## Keamanan Undangan

| Aspek | Aturan |
|-------|--------|
| Token | Dibuat acak kriptografis; **hanya hash SHA-256 yang disimpan** |
| Sekali pakai | Transisi ke `accepted` dijaga `WHERE status = 'pending'` di dalam transaction yang sama dengan pembuatan keanggotaan |
| Kedaluwarsa | 7 hari |
| Pencocokan | Hanya oleh user dengan **email terverifikasi** yang cocok |
| Duplikat | `hi_pending_uniq` menolak dua undangan aktif ke email yang sama |
| Sudah anggota | Ditolak saat pembuatan |
| Rate limit | 10/hari per household, 3/jam per user, 10 percobaan token/jam per IP |

**Pesan error tidak membedakan** undangan kedaluwarsa, sudah dipakai, atau tidak pernah ada. Pesan yang lebih spesifik mengonfirmasi bahwa sebuah token pernah sah.

**Email undangan tidak memuat data finansial apa pun** — hanya nama household dan nama pengundang. Email transit lewat pihak ketiga dan sering tersimpan tanpa enkripsi di sisi penerima.

## Pencabutan Saat Keluar

Satu transaction, urutan di [12-security §5](../../docs/12-security-and-auth.md#pencabutan-saat-keluar):

1. `status` → `removed`
2. `share_wealth` → false untuk keanggotaan ini
3. Terapkan pilihan user atas tag transaksi: pertahankan atau lepas

Hanya tiga langkah. Tanpa ACL dan tanpa transfer menggantung, tidak ada izin untuk dicabut dan tidak ada operasi setengah jalan untuk dibatalkan.

## Kriteria Penerimaan

- [ ] Undangan menyimpan **hash** token; token asli hanya ada di email.
- [ ] Token tidak dapat dipakai dua kali — diverifikasi test dengan dua percobaan berurutan.
- [ ] Undangan kedaluwarsa setelah 7 hari; cron menandainya `expired`.
- [ ] Undangan dapat dicabut oleh `owner`.
- [ ] Mengundang email yang sudah menjadi anggota aktif ditolak.
- [ ] Alur untuk penerima **tanpa akun**: daftar → verifikasi email → undangan tercocokkan otomatis.
- [ ] Layar konfirmasi undangan menyatakan: *"Bergabung tidak membagikan data keuangan Anda."*
- [ ] Matriks peran dari [12 §2.2](../../docs/12-security-and-auth.md#22-peran-household) ditegakkan **per action**, bukan hanya disembunyikan di UI.
- [ ] `member` tidak dapat mengundang, mencabut undangan, mengeluarkan anggota, maupun mengubah household — diverifikasi test.
- [ ] Undangan selalu membuat anggota berperan `member`; tidak ada parameter peran.
- [ ] Keluar sebagai owner terakhir ditolak (`LAST_OWNER`) sampai kepemilikan dialihkan.
- [ ] Dialog keluar menawarkan pilihan nasib tag transaksi.
- [ ] Anggota yang dikeluarkan **langsung** kehilangan akses pada permintaan berikutnya.
- [ ] **Bergabung tidak membagikan apa pun** — diverifikasi test.
- [ ] Pesan error undangan seragam untuk semua penyebab kegagalan.

## Verifikasi

```bash
npm run test        # integration: token sekali pakai, peran, pencabutan, privasi default
npm run test:e2e    # dua konteks browser: undang → terima → tampil di daftar anggota
# preview: kirim undangan sungguhan ke inbox uji, klik tautan
```

## Berkas yang Disentuh

Baru: `src/features/household/{invitations,members}.ts` · `src/features/household/components/{member-list,invite-sheet,owner-menu,leave-dialog}.tsx` · `src/lib/services/{invitations,memberships}.ts` · `src/lib/email/{invitation,templates}.ts` · `src/app/invite/[token]/page.tsx` · `src/app/(app)/household/[householdId]/members/page.tsx` · `src/app/api/cron/expire-invitations/route.ts` · test.

## Batasan

**Selalu:** simpan hash token, bukan token · transisi status dijaga `WHERE status = 'pending'` · peran diperiksa per action · pencabutan dalam satu transaction.
**Tanya dulu:** mengubah masa berlaku undangan · menambah cara bergabung selain undangan email.
**Jangan:** menyimpan token asli · membedakan pesan error undangan · memuat data finansial di email · mengandalkan UI untuk menegakkan peran · membiarkan household tanpa owner aktif · menambah peran ketiga.

## Catatan

**E2E task ini butuh dua konteks browser.** Playwright menanganinya lewat dua `browserContext` dengan `storageState` berbeda — contoh di [14-testing §7](../../docs/14-testing-strategy.md#7-e2e--alur-kritis). Lebih lambat, tetapi tidak ada cara lain menguji alur yang melibatkan dua orang.

Cron `expire-invitations` dibuat di sini. Ia tidak menulis apa pun yang bersifat finansial — hanya mengubah status undangan — sehingga menjalankannya berulang tidak dapat merusak saldo siapa pun.
