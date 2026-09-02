# Todo — 00 Project Bootstrap

## Inisialisasi

- [ ] Cek versi stabil terbaru: `npm view next version`, `npm view tailwindcss version`
- [ ] `npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir --import-alias "@/*"`
- [ ] Pin versi eksak di `package.json` (buang `^` untuk next, react, tailwindcss, drizzle-orm)
- [ ] Perbarui [docs/11-tech-architecture.md](../../docs/11-tech-architecture.md#1-tech-stack) dengan versi yang dipakai

## TypeScript

- [ ] `strict: true`
- [ ] `noUncheckedIndexedAccess: true`
- [ ] `paths` alias `@/*` → `src/*`
- [ ] Skrip `typecheck`

## Lint & Format

- [ ] ESLint flat config + `eslint-config-next`
- [ ] Prettier + `prettier-plugin-tailwindcss`
- [ ] Skrip `lint` dengan `--max-warnings=0`
- [ ] Verifikasi: tambahkan variabel tak terpakai → `npm run lint` gagal

## Test

- [ ] `vitest.config.ts` dengan alias path yang sama
- [ ] Test contoh: `src/lib/__tests__/smoke.test.ts`
- [ ] `playwright.config.ts` — proyek Pixel 5 (mobile) + Desktop Chrome
- [ ] E2E contoh: halaman utama memuat
- [ ] Skrip `test`, `test:watch`, `test:coverage`, `test:e2e`

## Struktur

- [ ] Buat kerangka folder sesuai [docs/11 §2](../../docs/11-tech-architecture.md#2-struktur-folder)
- [ ] `.gitkeep` pada folder yang masih kosong

## Environment

- [ ] `.env.example` — seluruh nama variabel, tanpa nilai, dengan komentar singkat
- [ ] `.gitignore` — `.env*`, `!.env.example`, `node_modules`, `.next`, `coverage`, `playwright-report`

## CI

- [ ] `.github/workflows/ci.yml` — job `verify` (typecheck, lint, test) pada PR
- [ ] Cache npm aktif
- [ ] Unggah artefak coverage

## Vercel

- [ ] Hubungkan repo ke proyek Vercel
- [ ] `vercel.json` — `framework: nextjs`, `regions: ["sin1"]`
- [ ] Deploy pertama berhasil
- [ ] Preview deployment terbentuk otomatis dari PR

## Dokumentasi

- [ ] `README.md` — jalankan lokal dalam ≤ 5 perintah
- [ ] Tautan ke [docs/README.md](../../docs/README.md)

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] `npm run build` berhasil
- [ ] `npm run test:e2e` hijau
- [ ] CI hijau di PR
- [ ] Preview URL tampil
