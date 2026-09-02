# Task 04 — Authentication

**Fase:** F0 · **Bergantung pada:** 03 · **Dokumen:** [12-security-and-auth](../../docs/12-security-and-auth.md)

## Objektif

Memasang autentikasi dan **pola scoping otorisasi yang akan diikuti setiap query sesudahnya**.

Bagian kedua itu yang lebih penting. Login relatif mudah; yang sulit adalah memastikan tidak ada satu pun dari ratusan query di masa depan yang lupa menyaring pemiliknya. Task ini menyediakan helper dan test-nya sehingga hal yang benar juga menjadi hal yang paling mudah dilakukan.

## Ruang Lingkup

**Termasuk:** Auth.js v5, Google OAuth, magic link email, database session, middleware, `requireUser()`, helper `ownedBy`, seed per-user, halaman signin, onboarding dompet pertama.

**Tidak termasuk:** household & `requireHouseholdMember` (task 10) · rate limiting penuh (task 23; login saja di sini).

## Konfigurasi

| Aspek | Pilihan |
|-------|---------|
| Provider | Google OAuth (utama), magic link email (cadangan) |
| Sesi | **Database session**, bukan JWT |
| Durasi | 30 hari, bergulir |
| Cookie | `httpOnly`, `secure`, `sameSite: 'lax'`, prefix `__Secure-` |

**Kenapa database session:** JWT tidak dapat dicabut sebelum kedaluwarsa. Untuk aplikasi keuangan, "keluarkan saya dari semua perangkat" harus bekerja seketika — dan nanti, mengeluarkan anggota dari household juga harus langsung menutup aksesnya.

## Seed Pengguna Baru

Saat login pertama, dalam **satu transaction**:
1. Kategori bawaan dari katalog kanonis di [03-domain §7](../../docs/03-domain-model.md#7-kategori), lengkap dengan `system_key`.
2. Dompet "Tunai" bertipe `cash`, saldo 0.
3. `users.default_wallet_id` menunjuk dompet itu.

Seed ini per-user, bukan global, sehingga dilakukan kode aplikasi — bukan SQL seed. Memaksa orang membuat kategori sebelum bisa mencatat transaksi pertama adalah cara paling efektif kehilangan mereka.

## Pola Otorisasi

```ts
// Selalu dipanggil pertama di setiap Server Action & route handler
const user = await requireUser()

// Setiap query menyaring pemiliknya
await dbRead.select().from(dompet).where(ownedBy(dompet, user.id))
```

`ownedBy` menerima `userId` sebagai parameter wajib, sehingga query yang tidak di-scope tidak dapat ditulis tanpa terlihat jelas menyimpang saat review.

## Kriteria Penerimaan

- [ ] Login Google berfungsi di lokal dan di preview Vercel.
- [ ] Magic link email berfungsi (dipakai untuk pengujian di preview, di mana redirect URI Google merepotkan).
- [ ] Sesi bertahan setelah refresh dan restart browser.
- [ ] Logout mencabut sesi di database — bukan sekadar menghapus cookie.
- [ ] Middleware mengalihkan permintaan tanpa sesi ke `/signin`; `/api/auth`, `/api/cron`, `/signin`, `/invite` dikecualikan.
- [ ] `requireUser()` melempar `UnauthenticatedError` tanpa sesi.
- [ ] Login pertama membuat kategori bawaan + dompet "Tunai" dalam satu transaction.
- [ ] Login kedua **tidak** menduplikasi seed.
- [ ] Onboarding: user baru diarahkan membuat dompet pertama, lalu mendarat di dashboard fungsional.
- [ ] **Test isolasi:** user B tidak dapat membaca maupun mengubah data user A — untuk setiap entitas yang sudah ada.
- [ ] Rate limit login: 5 percobaan / 15 menit per IP.
- [ ] Header keamanan dari [12 §12](../../docs/12-security-and-auth.md#12-header-keamanan) terpasang dan terverifikasi.

## Verifikasi

```bash
npm run test         # unit requireUser + integration seed + test isolasi
npm run test:e2e     # alur login → onboarding → dashboard
# preview: login Google, refresh, logout, cek sesi tercabut di DB
curl -I https://<preview-url>   # periksa header keamanan
```

## Berkas yang Disentuh

Baru: `src/lib/auth/{index,require-user,options}.ts` · `src/lib/db/scoped.ts` · `src/lib/db/seed.ts` · `src/app/api/auth/[...nextauth]/route.ts` · `src/app/(auth)/signin/page.tsx` · `src/app/onboarding/page.tsx` · `src/middleware.ts` · test terkait.
Diubah: `next.config.ts` (header) · `src/app/(app)/layout.tsx` (guard sesi) · `src/lib/env.ts`.

## Batasan

**Selalu:** `requireUser()` sebagai baris pertama setiap action · setiap query menyaring pemilik · seed dalam satu transaction.
**Tanya dulu:** menambah provider auth · mengubah durasi sesi.
**Jangan:** sesi JWT · rahasia dengan prefix `NEXT_PUBLIC_` · mencatat email atau token di log · melewati `requireUser` "karena middleware sudah menjaga" — middleware tidak melindungi Server Action.

## Catatan

**Redirect URI Google di preview.** URL preview Vercel berubah tiap deployment, sementara Google menuntut daftar redirect URI yang tetap. Tetapkan satu domain preview stabil dan arahkan alias PR ke sana, atau pakai magic link untuk pengujian di preview. Ini kerepotan kecil yang mudah menyita waktu bila baru ditemukan saat mencoba login di preview.

Test isolasi yang ditulis di task ini menjadi **template** untuk seluruh task berikutnya. Setiap modul baru wajib punya padanannya.
