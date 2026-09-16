# Todo — 00 Project Bootstrap

## Inisialisasi

- [x] Cek versi stabil terbaru: `npm view next version`, `npm view tailwindcss version`
- [x] `npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir --import-alias "@/*"`
- [x] Pin versi eksak di `package.json` (buang `^` untuk next, react, tailwindcss, drizzle-orm)
- [x] Perbarui [docs/11-tech-architecture.md](../../docs/11-tech-architecture.md#1-tech-stack) dengan versi yang dipakai

## TypeScript

- [x] `strict: true`
- [x] `noUncheckedIndexedAccess: true`
- [x] `paths` alias `@/*` → `src/*`
- [x] Skrip `typecheck`

## Lint & Format

- [x] ESLint flat config + `eslint-config-next`
- [x] Prettier + `prettier-plugin-tailwindcss`
- [x] Skrip `lint` dengan `--max-warnings=0`
- [x] Verifikasi: tambahkan variabel tak terpakai → `npm run lint` gagal

## Test

- [x] `vitest.config.ts` dengan alias path yang sama
- [x] Test contoh: `src/lib/__tests__/smoke.test.ts`
- [x] `playwright.config.ts` — proyek Pixel 5 (mobile) + Desktop Chrome
- [x] E2E contoh: halaman utama memuat
- [x] Skrip `test`, `test:watch`, `test:coverage`, `test:e2e`

## Struktur

- [x] Buat kerangka folder sesuai [docs/11 §2](../../docs/11-tech-architecture.md#2-struktur-folder)
- [x] `.gitkeep` pada folder yang masih kosong

## Environment

- [x] `.env.example` — seluruh nama variabel, tanpa nilai, dengan komentar singkat
- [x] `.gitignore` — `.env*`, `!.env.example`, `node_modules`, `.next`, `coverage`, `playwright-report`

## CI

- [x] `.github/workflows/ci.yml` — job `verify` (typecheck, lint, test) pada PR
- [x] Cache npm aktif
- [x] Unggah artefak coverage

## Vercel

- [ ] Hubungkan repo ke proyek Vercel
- [x] `vercel.json` — `framework: nextjs`, `regions: ["sin1"]`
- [ ] Deploy pertama berhasil
- [ ] Preview deployment terbentuk otomatis dari PR

## Dokumentasi

- [x] `README.md` — jalankan lokal dalam ≤ 5 perintah
- [x] Tautan ke [docs/README.md](../../docs/README.md)

## Verifikasi Akhir

- [x] `npm run verify` hijau
- [x] `npm run build` berhasil
- [x] `npm run test:e2e` hijau
- [ ] CI hijau di PR
- [ ] Preview URL tampil
