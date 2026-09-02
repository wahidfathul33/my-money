# Todo — 04 Authentication

## Persiapan

- [ ] Buat OAuth client di Google Cloud Console
- [ ] Daftarkan redirect URI: lokal, domain preview stabil, produksi
- [ ] Buat akun Resend, verifikasi domain (SPF + DKIM)
- [ ] Set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`

## Auth.js

- [ ] Pasang `next-auth@5` + `@auth/drizzle-adapter`
- [ ] `src/lib/auth/options.ts` — provider Google + Resend, `strategy: 'database'`
- [ ] Konfigurasi cookie: `httpOnly`, `secure`, `sameSite: 'lax'`, prefix `__Secure-`
- [ ] Sesi 30 hari, bergulir
- [ ] `src/app/api/auth/[...nextauth]/route.ts`
- [ ] Verifikasi tabel Auth.js sudah ada dari task 03

## Middleware

- [ ] `src/middleware.ts` dengan matcher yang mengecualikan `api/auth`, `api/cron`, `signin`, `invite`, `_next`
- [ ] Redirect tanpa sesi → `/signin?callbackUrl=…`
- [ ] Verifikasi: akses `/wallets` tanpa login → dialihkan

## Helper Otorisasi

- [ ] `src/lib/auth/require-user.ts` — `requireUser()`
- [ ] `src/lib/db/scoped.ts` — `ownedBy(table, userId)`
- [ ] `src/lib/api/errors.ts` — `UnauthenticatedError`, `ForbiddenError`, `NotFoundError`, `ValidationError`
- [ ] Unit test `requireUser` tanpa sesi → melempar

## Seed Pengguna Baru

- [ ] `src/lib/db/seed.ts` — `seedNewUser(tx, userId)`
- [ ] 10 kategori expense + 6 income, `is_system = true`
- [ ] Dompet "Tunai" bertipe `cash`, saldo 0
- [ ] Set `users.default_wallet_id`
- [ ] Semuanya dalam satu transaction
- [ ] Dipicu event `createUser` Auth.js
- [ ] Integration test: seed berjalan sekali; login kedua tidak menduplikasi

## Halaman

- [ ] `/signin` — tombol Google + form email, state loading & error
- [ ] `/onboarding` — langkah 1 wajib (buat dompet), 2 & 3 opsional
- [ ] Redirect ke `/onboarding` bila `users.onboarded_at` null
- [ ] Set `onboarded_at` setelah langkah 1

## Guard Sesi

- [ ] `app/(app)/layout.tsx` memanggil `auth()` dan mengalihkan bila tidak ada sesi
- [ ] Sesi tersedia di Server Component tanpa prop drilling

## Keamanan

- [ ] Header dari [docs/12 §12](../../docs/12-security-and-auth.md#12-header-keamanan) di `next.config.ts`
- [ ] Rate limit login: 5 / 15 menit per IP
- [ ] Verifikasi: `curl -I` menampilkan seluruh header
- [ ] Verifikasi: tidak ada email/token di log

## Test

- [ ] Unit: `requireUser` dengan & tanpa sesi
- [ ] Integration: seed berjalan sekali saja
- [ ] **Integration: user B tidak dapat membaca data user A** (template untuk task berikutnya)
- [ ] **Integration: user B tidak dapat mengubah data user A**
- [ ] E2E: login → onboarding → dashboard
- [ ] E2E: logout → sesi tercabut → akses rute terlindungi dialihkan
- [ ] E2E: sesi bertahan setelah reload

## Verifikasi Akhir

- [ ] Login Google berfungsi di preview
- [ ] Magic link berfungsi di preview
- [ ] `npm run verify` hijau
- [ ] `npm run test:e2e` hijau
- [ ] Periksa manual: logout benar-benar menghapus baris sesi di database
