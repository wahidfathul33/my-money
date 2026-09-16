# Todo — 04 Authentication

## Persiapan

- [x] Buat OAuth client di Google Cloud Console
- [x] Daftarkan redirect URI: lokal
- [ ] Daftarkan redirect URI: domain preview stabil, produksi
- [x] Buat akun Resend, verifikasi domain (SPF + DKIM)
- [x] Set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`

## Auth.js

- [x] Pasang `next-auth@5` + `@auth/drizzle-adapter`
- [x] `src/lib/auth/options.ts` — provider Google + Resend, `strategy: 'database'`
- [x] Konfigurasi cookie: `httpOnly`, `secure`, `sameSite: 'lax'`, prefix `__Secure-`
- [x] Sesi 30 hari, bergulir
- [x] `src/app/api/auth/[...nextauth]/route.ts`
- [x] Verifikasi tabel Auth.js sudah ada dari task 03

## Middleware

- [x] `src/middleware.ts` dengan matcher yang mengecualikan `api/auth`, `api/cron`, `signin`, `invite`, `_next`
- [x] Redirect tanpa sesi → `/signin?callbackUrl=…`
- [x] Verifikasi: akses `/wallets` tanpa login → dialihkan

## Helper Otorisasi

- [x] `src/lib/auth/require-user.ts` — `requireUser()`
- [x] `src/lib/db/scoped.ts` — `ownedBy(table, userId)`
- [x] `src/lib/api/errors.ts` — `UnauthenticatedError`, `ForbiddenError`, `NotFoundError`, `ValidationError`
- [x] Unit test `requireUser` tanpa sesi → melempar

## Seed Pengguna Baru

- [x] `src/lib/db/seed.ts` — `seedNewUser(tx, userId)`
- [x] 10 kategori expense + 6 income, `is_system = true`
- [x] Dompet "Tunai" bertipe `cash`, saldo 0
- [x] Set `users.default_wallet_id`
- [x] Semuanya dalam satu transaction
- [x] Dipicu event `createUser` Auth.js
- [x] Integration test: seed berjalan sekali; login kedua tidak menduplikasi

## Halaman

- [x] `/signin` — tombol Google + form email, state loading & error
- [x] `/onboarding` — langkah 1 wajib (buat dompet), 2 & 3 opsional
- [x] Redirect ke `/onboarding` bila `users.onboarded_at` null
- [x] Set `onboarded_at` setelah langkah 1

## Guard Sesi

- [x] `app/(app)/layout.tsx` memanggil `auth()` dan mengalihkan bila tidak ada sesi
- [x] Sesi tersedia di Server Component tanpa prop drilling

## Keamanan

- [x] Header dari [docs/12 §12](../../docs/12-security-and-auth.md#12-header-keamanan) di `next.config.ts`
- [x] Rate limit login: 5 / 15 menit per IP
- [x] Verifikasi: `curl -I` menampilkan seluruh header
- [x] Verifikasi: tidak ada email/token di log

## Test

- [x] Unit: `requireUser` dengan & tanpa sesi
- [x] Integration: seed berjalan sekali saja
- [x] **Integration: user B tidak dapat membaca data user A** (template untuk task berikutnya)
- [x] **Integration: user B tidak dapat mengubah data user A**
- [x] E2E: login → onboarding → dashboard
- [x] E2E: logout → sesi tercabut → akses rute terlindungi dialihkan
- [x] E2E: sesi bertahan setelah reload

## Verifikasi Akhir

- [ ] Login Google berfungsi di preview
- [ ] Magic link berfungsi di preview
- [x] `npm run verify` hijau
- [x] `npm run test:e2e` hijau
- [x] Periksa manual: logout benar-benar menghapus baris sesi di database
