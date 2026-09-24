# 12 — Deployment (Vercel + Neon)

## 1. Topologi

```
GitHub repo
    │
    ├── push ke branch  ──► Vercel Preview Deployment
    │                        └── Neon branch database (per-PR)
    │
    └── merge ke main   ──► Vercel Production Deployment
                             └── Neon primary database
```

| Environment | Vercel | Neon |
|-------------|--------|------|
| Development | lokal (`next dev`) | Neon branch `dev` (dibagi) atau Postgres lokal |
| Preview | Deployment per-PR | Neon branch per-PR, dibuat otomatis |
| Production | `main` | Neon primary, dengan PITR |

**Neon branching** adalah alasan utama memilih Neon di sini. Setiap PR memperoleh salinan database sungguhan (copy-on-write, dibuat dalam hitungan detik), sehingga migrasi diuji terhadap struktur data nyata sebelum menyentuh produksi.

## 2. Konfigurasi Vercel

```json
// vercel.json
{
  "framework": "nextjs",
  "regions": ["sin1"],
  "crons": [
    { "path": "/api/cron/budget-rollover",    "schedule": "5 17 * * *" },
    { "path": "/api/cron/deposit-maturity",   "schedule": "0 18 * * *" },
    { "path": "/api/cron/gold-price",         "schedule": "0 19 * * *" },
    { "path": "/api/cron/reconcile",          "schedule": "0 20 * * *" },
    { "path": "/api/cron/expire-invitations", "schedule": "0 16 * * *" },
    { "path": "/api/cron/net-worth-snapshot", "schedule": "55 16 * * *" }
  ]
}
```

**Runtime Node.js 24.** Versinya tidak diletakkan di `vercel.json` (field itu tidak ada) melainkan di `engines.node` pada `package.json` — `>=24.0.0`. Vercel memetakan rentang semver ke versi mayor tertinggi yang tersedia, dan 24.x saat ini adalah yang tertinggi sekaligus default, jadi rentang ini mengunci deployment ke 24.x tanpa ikut menolak Node yang lebih baru di mesin lokal. Nilai di `package.json` menimpa pilihan **Settings → Build and Deployment → Node.js Version** di dashboard, sehingga repo ini adalah satu-satunya sumber kebenaran; tidak perlu menyentuh dashboard. `.nvmrc` (`24`) dan `node-version: 24` di CI (§6) menjaga mesin lokal dan runner GitHub tetap sejalan dengan runtime produksi. Node 20 dideprekasi Vercel per 1 Oktober 2026.

**Region `sin1` (Singapura)** — terdekat dengan pengguna Indonesia dan dengan region Neon. Menempatkan compute jauh dari database menambah latensi pada setiap query, dan halaman dashboard melakukan beberapa.

**Jadwal cron dalam UTC.** Vercel Cron hanya menerima UTC. Konversi ke WIB (UTC+7):

| Endpoint | UTC | WIB |
|----------|-----|-----|
| `budget-rollover` | `5 17 * * *` | 00:05 hari berikutnya |
| `net-worth-snapshot` | `55 16 * * *` | 23:55 |
| `deposit-maturity` | `0 18 * * *` | 01:00 |
| `gold-price` | `0 19 * * *` | 02:00 |
| `reconcile` | `0 20 * * *` | 03:00 |
| `expire-invitations` | `0 16 * * *` | 23:00 |

**Seluruh cron berjalan harian** — akun Vercel Hobby/gratis hanya mengizinkan kadensi harian; jadwal per jam memerlukan paket Pro. `expire-invitations` awalnya dirancang berjalan setiap jam (task 11's implementasi — src/app/api/cron/expire-invitations/route.ts — supaya undangan kedaluwarsa tak lama setelah batas 7 harinya lewat) tetapi diturunkan ke harian di task 23 untuk tetap pada paket gratis. Ini aman: `acceptInvitation` (src/lib/services/invitations.ts) memeriksa `expiresAt > now` secara real-time pada setiap percobaan terima, terlepas dari kapan cron ini terakhir berjalan — cron ini murni housekeeping (mengubah status undangan untuk tampilan, bukan pemeriksa keabsahan), jadi kadensi yang lebih jarang hanya membuat undangan yang sudah lewat tampil "Menunggu" hingga ~24 jam lebih lama, bukan celah keamanan. Ia tidak menulis apa pun yang bersifat finansial. Urutannya terhadap `reconcile` tidak berpengaruh, dan menjalankannya berulang tidak dapat merusak saldo siapa pun.

Bila nanti pindah ke paket Pro (atau memakai trigger cron eksternal gratis seperti GitHub Actions terjadwal yang memanggil rute ini dengan header `Authorization: Bearer $CRON_SECRET`), jadwal ini bisa dikembalikan ke `0 * * * *` tanpa perubahan kode apa pun.

> Kesalahan zona waktu di sini menghasilkan snapshot yang ditulis pada hari yang salah, dan grafik net worth yang bergeser satu hari. Konversi ini diverifikasi test.

**Catatan tentang `budget-rollover`:** ia berjalan harian dan memeriksa apakah hari itu tanggal 1 di zona waktu user, bukan dijadwalkan bulanan. Cron bulanan dalam UTC akan menembak pada tanggal yang salah bagi pengguna WIB.

## 3. Environment Variable

Diatur di dashboard Vercel, terpisah per environment.

| Variabel | Prod | Preview | Dev | Catatan |
|----------|:----:|:-------:|:---:|---------|
| `DATABASE_URL` | ✓ | ✓ (branch) | ✓ | Connection string pooled Neon |
| `DATABASE_URL_UNPOOLED` | ✓ | ✓ | ✓ | Direct, untuk migrasi |
| `AUTH_SECRET` | ✓ | ✓ | ✓ | Berbeda per environment |
| `AUTH_URL` | ✓ | auto | ✓ | |
| `GOOGLE_CLIENT_ID` | ✓ | ✓ | ✓ | |
| `GOOGLE_CLIENT_SECRET` | ✓ | ✓ | ✓ | |
| `CRON_SECRET` | ✓ | ✓ | — | |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | ✓ | ✓ | ✓ | Transport email undangan & magic link |
| `RESEND_API_KEY` | opsional | opsional | opsional | Disiapkan, belum dipakai — lihat `src/lib/env.ts` |
| `EMAIL_FROM` | ✓ | ✓ | ✓ | Domain terverifikasi (SPF + DKIM) |
| `APP_URL` | ✓ | auto | ✓ | Basis tautan undangan |
| `GOLD_PRICE_PROVIDER` | ✓ | ✓ | ✓ | `manual` \| `external` |
| `GOLD_PRICE_API_URL` | opsional | opsional | opsional | |
| `GOLD_PRICE_API_KEY` | opsional | opsional | opsional | |

`.env.example` di-commit dan hanya memuat nama variabel beserta komentar. Tidak pernah ada nilainya.

**Redirect URI OAuth Google** harus mendaftarkan domain produksi **dan** pola preview Vercel. Preview deployment punya URL yang berubah-ubah; solusinya adalah menetapkan satu domain preview stabil (`preview.domain.com`) dan mengarahkan alias PR ke sana, atau memakai magic-link email untuk pengujian di preview.

**Email undangan di preview.** `APP_URL` di preview harus menunjuk ke deployment preview itu sendiri, bukan ke produksi. Kalau tidak, undangan yang dibuat saat menguji preview akan mengirim tautan ke produksi, dan token yang dicarinya tidak ada di database produksi — kegagalan yang membingungkan karena semuanya tampak berfungsi sampai tautannya diklik.

Di lingkungan preview, pengiriman email sebaiknya diarahkan ke inbox uji (mis. akun SMTP terpisah) daripada ke alamat sungguhan.

## 4. Pipeline Build

```jsonc
// package.json
{
  "scripts": {
    "dev":            "next dev",
    "build":          "npm run db:migrate && next build",
    "start":          "next start",
    "lint":           "eslint . --max-warnings=0",
    "lint:fix":       "eslint . --fix",
    "typecheck":      "tsc --noEmit",
    "format":         "prettier --write .",
    "format:check":   "prettier --check .",
    "test":           "vitest run",
    "test:watch":     "vitest",
    "test:coverage":  "vitest run --coverage",
    "test:e2e":       "playwright test",
    "db:generate":    "drizzle-kit generate",
    "db:migrate":     "drizzle-kit migrate",
    "db:studio":      "drizzle-kit studio",
    "verify":         "npm run typecheck && npm run lint && npm run test"
  }
}
```

**Migrasi berjalan di build step**, sebelum `next build`. Kalau migrasi gagal, build gagal dan deployment tidak pernah terjadi — versi lama tetap melayani trafik.

Migrasi memakai `DATABASE_URL_UNPOOLED` (koneksi langsung). Menjalankan DDL lewat connection pooler dapat menemui perilaku tak terduga saat statement mengambil lock.

## 5. Urutan Deploy & Kompatibilitas

Vercel mengganti versi secara atomik, tetapi **migrasi berjalan sebelum kode baru aktif**. Dalam jendela itu, kode lama berjalan di atas skema baru.

**Konsekuensi:** setiap migrasi harus kompatibel dengan versi kode yang sedang berjalan.

| Perubahan | Aman? | Cara benar |
|-----------|:-----:|------------|
| Tambah kolom nullable | ✓ | Langsung |
| Tambah kolom NOT NULL dengan default | ✓ | Langsung |
| Tambah tabel | ✓ | Langsung |
| Tambah index | ✓ | `CREATE INDEX CONCURRENTLY` |
| Hapus kolom | ✗ | Dua rilis: hentikan pemakaian → deploy → hapus |
| Ganti nama kolom | ✗ | Tambah baru → salin → alihkan pemakaian → hapus lama |
| Perketat constraint | ✗ | `ADD … NOT VALID` → backfill → `VALIDATE CONSTRAINT` |
| Ubah tipe kolom | ✗ | Kolom baru + backfill + alihkan |

## 6. GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:coverage
      - uses: actions/upload-artifact@v4
        with: { name: coverage, path: coverage/ }

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}

  lighthouse:
    runs-on: ubuntu-latest
    needs: verify
    steps:
      - uses: actions/checkout@v4
      - uses: treosh/lighthouse-ci-action@v11
        with:
          urls: ${{ steps.vercel.outputs.preview-url }}
          budgetPath: ./lighthouse-budget.json
```

```json
// lighthouse-budget.json
[{
  "path": "/*",
  "timings": [
    { "metric": "largest-contentful-paint", "budget": 2500 },
    { "metric": "cumulative-layout-shift",  "budget": 0.1 }
  ],
  "resourceSizes": [
    { "resourceType": "script", "budget": 180 },
    { "resourceType": "total",  "budget": 500 }
  ]
}]
```

## 7. Neon: Operasional

**Pooling.** Aplikasi memakai connection string **pooled** (`-pooler` di hostname) untuk runtime, dan **unpooled** untuk migrasi. Fungsi serverless dapat menghasilkan banyak koneksi bersamaan; tanpa pooling, batas koneksi tercapai di bawah beban ringan.

**Autoscaling & suspend.** Neon menghentikan compute saat idle. Request pertama setelah idle mengalami cold start ~500ms. Untuk MVP ini dapat diterima. Kalau mengganggu, `min_cu` dinaikkan agar compute tetap hidup — dengan biaya lebih tinggi.

**Backup.** Point-in-time recovery bawaan Neon. Retensi diatur **minimal 7 hari** di produksi. Untuk data finansial, kemampuan memulihkan ke titik waktu sebelum penulisan yang salah lebih berharga daripada penghematan biaya retensi.

**Pemulihan bencana:** prosedur pemulihan didokumentasikan dan **diuji sekali sebelum peluncuran**. Backup yang belum pernah dipulihkan bukan backup.

## 8. PWA

```ts
// src/app/manifest.ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyMoney — Keuangan Pribadi',
    short_name: 'MyMoney',
    description: 'Kelola pemasukan, pengeluaran, aset, dan kekayaan bersih Anda.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#0d9488',
    icons: [
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

**Service worker** — cakupan MVP sengaja dibatasi:
- Cache shell aplikasi dan aset statis (cache-first).
- Data dinamis: network-first dengan fallback ke cache, disertai banner "data per {waktu}".
- **Tanpa antrean tulis offline.** Alasannya di [10-ux-states.md](10-ux-states.md#7-offline--pwa).

## 9. Monitoring

| Kebutuhan | Alat |
|-----------|------|
| Error runtime | Sentry (dengan scrubbing data finansial) |
| Web Vitals | Vercel Analytics + Speed Insights |
| Kesehatan cron | Log eksekusi Vercel + alert saat gagal |
| Selisih rekonsiliasi | Alert dari `/api/cron/reconcile` |
| Performa DB | Dashboard Neon |
| Uptime | Health check eksternal ke `/api/health` |

**Alert yang membangunkan orang:**
1. Rekonsiliasi menemukan selisih saldo.
2. Tingkat error > 1% dalam 5 menit.
3. Cron gagal dua kali berturut-turut.
4. Migrasi database gagal di produksi.

Selain itu tidak. Alert yang terlalu sering diabaikan, dan yang penting ikut terabaikan.

## 10. Runbook

**Rollback:** promosikan deployment sebelumnya di dashboard Vercel — seketika. **Catatan penting:** ini me-rollback kode, bukan migrasi database. Karena itu setiap migrasi harus kompatibel-mundur dengan rilis sebelumnya (§5).

**Selisih rekonsiliasi:**
1. Jalankan query invarian di [05-financial-integrity.md](05-financial-integrity.md#job-rekonsiliasi) untuk dompet terdampak.
2. Telusuri ledger entry di sekitar waktu selisih muncul.
3. Cari operasi yang tidak dibungkus transaction.
4. Perbaiki penyebabnya lebih dulu, baru datanya.
5. Koreksi data lewat `adjustment` entry dengan catatan, **tidak pernah** dengan `UPDATE` langsung.

**Kegagalan cron:** cron bersifat idempoten; picu ulang secara manual dengan `curl` + `CRON_SECRET`. Snapshot yang terlewat untuk suatu hari dapat diisi ulang lewat backfill terbatas.

**Kebocoran rahasia:** rotasi di Vercel → redeploy → cabut kredensial lama di penyedia → tinjau log akses.
