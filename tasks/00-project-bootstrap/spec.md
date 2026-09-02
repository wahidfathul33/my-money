# Task 00 — Project Bootstrap

**Fase:** F0 · **Bergantung pada:** — · **Dokumen:** [11-tech-architecture](../../docs/11-tech-architecture.md), [13-deployment-vercel](../../docs/13-deployment-vercel.md)

## Objektif

Menyiapkan repositori yang dapat di-build, diuji, dan di-deploy, sehingga setiap task berikutnya punya jalur verifikasi yang sama sejak hari pertama.

Task ini tidak menghasilkan fitur. Ia menghasilkan **kepastian bahwa perubahan apa pun dapat diverifikasi otomatis** — tanpa itu, setiap task sesudahnya menanggung biaya menyiapkan verifikasinya sendiri.

## Ruang Lingkup

**Termasuk:** inisialisasi Next.js, TypeScript ketat, Tailwind v4, ESLint + Prettier, Vitest, Playwright, struktur folder, `.env.example`, GitHub Actions, deploy Vercel pertama.

**Tidak termasuk:** database (task 03), auth (task 04), komponen UI (task 01).

## Tech Stack

Sesuai [11-tech-architecture §1](../../docs/11-tech-architecture.md#1-tech-stack). Versi dipin di `package.json` saat bootstrap; jangan memakai rentang longgar (`^`) untuk framework dan ORM.

## Perintah

```bash
npm run dev              # next dev
npm run build            # next build
npm run lint             # eslint . --max-warnings=0
npm run typecheck        # tsc --noEmit
npm run test             # vitest run
npm run test:e2e         # playwright test
npm run verify           # typecheck && lint && test
```

## Struktur yang Dibuat

Kerangka kosong sesuai [11-tech-architecture §2](../../docs/11-tech-architecture.md#2-struktur-folder). Folder dibuat dengan `.gitkeep` bila belum ada isinya — struktur yang terlihat sejak awal mengurangi kemungkinan berkas mendarat di tempat yang salah.

## Konfigurasi Kunci

**TypeScript** — `strict: true` **dan** `noUncheckedIndexedAccess: true`. Yang kedua sering dilewatkan padahal ia yang menangkap akses array di luar batas, dan kode ini akan banyak memetakan hasil query.

**ESLint** — `--max-warnings=0`. Warning yang dibiarkan menumpuk sampai tidak ada yang membacanya.

Aturan `no-restricted-imports` untuk batas modul di [11-tech-architecture §3](../../docs/11-tech-architecture.md#3-aturan-batas) ditambahkan di task yang memperkenalkan modulnya — bukan di sini, karena modulnya belum ada.

**Vercel** — region `sin1`. Menempatkan compute jauh dari Neon menambah latensi pada setiap query.

## Kriteria Penerimaan

- [ ] `npm run verify` hijau di lokal dan di CI.
- [ ] `npm run build` berhasil.
- [ ] Halaman placeholder tampil di URL preview Vercel.
- [ ] GitHub Actions berjalan pada setiap PR: typecheck, lint, test.
- [ ] `.env.example` berisi seluruh nama variabel dari [11-tech §8](../../docs/11-tech-architecture.md#8-environment-variable), **tanpa nilai**.
- [ ] `.gitignore` mencakup `.env*` (kecuali `.env.example`), `node_modules`, `.next`, `coverage`, `playwright-report`.
- [ ] Satu test contoh lulus di Vitest, satu di Playwright.
- [ ] `README.md` memuat cara menjalankan lokal dalam ≤ 5 perintah.

## Verifikasi

```bash
npm run verify && npm run build
git push   # → cek GitHub Actions hijau, cek preview URL tampil
```

## Berkas yang Disentuh

Semuanya baru: `package.json` · `tsconfig.json` · `next.config.ts` · `eslint.config.mjs` · `.prettierrc` · `vitest.config.ts` · `playwright.config.ts` · `vercel.json` · `.env.example` · `.gitignore` · `.github/workflows/ci.yml` · `README.md` · kerangka `src/`

## Batasan

**Selalu:** pin versi dependensi utama · commit lockfile · jalankan `verify` sebelum push.
**Tanya dulu:** menambah dependensi di luar stack yang tercantum di docs.
**Jangan:** commit `.env` · menonaktifkan aturan lint untuk melewati error · memakai `any` untuk mempercepat setup.

## Catatan

Versi Next.js dan Tailwind **diverifikasi saat bootstrap**, bukan diasumsikan dari dokumen. Jalankan `npm view next version` dan pilih rilis stabil terbaru, lalu perbarui [11-tech-architecture](../../docs/11-tech-architecture.md#1-tech-stack) dengan versi yang benar-benar dipakai.
