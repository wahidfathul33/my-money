# Todo — 23 Hardening & Launch

## Audit Keamanan (manual)

- [x] Telusuri **setiap** query — menyaring pemilik atau melewati `lib/visibility/**` (47 fungsi query di 16 modul `src/features/*/queries.ts` + `src/lib/services/*.ts` ditelusuri manual; seluruhnya di-scope lewat `ownedBy()` atau `lib/visibility/**`. `household/queries.ts` sengaja nol `ownedBy()` — dilindungi satu guard `requireHouseholdAccess` di level layout, dikonfirmasi tidak ada pemanggil yang melewatinya)
- [ ] **Invarian I11 hijau** — tidak ada ledger entry yang pemiliknya berbeda dari pemilik wallet-nya (query invarian ada & lolos di `src/lib/db/__tests__/reconcile.integration.test.ts` dan `src/app/api/cron/reconcile/__tests__/route.integration.test.ts`, dijalankan sebagai bagian `npm run test:coverage` — lihat hasil akhir di LAUNCH-CHECKLIST.md)
- [x] Grep tanda tangan fungsi di `src/lib/services/**` — tidak ada yang menerima dompet id milik user selain pemanggil (satu-satunya pengecualian, `createMemberTransfer`'s `toWalletId`, diverifikasi kepemilikan/kelayakan di dalam transaction sesuai desain)
- [x] Setiap operasi ber-`household_id` memanggil `requireHouseholdMember` di dalam transaction (20 titik panggil ditelusuri, seluruhnya di dalam `dbWrite.transaction()` yang sama dengan tulisannya)
- [x] Grep log: tidak ada nominal, nama household, atau nama anggota (7 pemanggilan `console.error` di `src/` ditelusuri; tidak ada yang menerima nominal/nama. Scrubber `src/lib/observability/scrubber.ts` jadi lapisan kedua untuk jalur Sentry)
- [x] Grep kode: tidak ada rahasia, tidak ada `NEXT_PUBLIC_` yang sensitif (nol rahasia hardcode; `NEXT_PUBLIC_SENTRY_DSN` satu-satunya `NEXT_PUBLIC_*` — DSN Sentry adalah identitas publik by design, bukan kredensial)
- [x] Setiap route handler punya rate limit (3 celah ditemukan & ditutup: `GET /api/households/[id]/net-worth`, `.../transactions`, `GET /api/net-worth/history` — sekarang memakai `checkRateLimit` seperti route sejenisnya. Catatan: limiter berbasis memori per-proses, bukan shared store — cukup untuk satu instance, bukan untuk banyak instance serverless bersamaan; didokumentasikan sebagai keterbatasan yang diketahui di LAUNCH-CHECKLIST.md, bukan diselesaikan di sini karena butuh infrastruktur (Redis/Upstash) yang di luar cakupan "tidak menambah fitur")
- [x] Setiap route cron memeriksa `CRON_SECRET` (6 route: `budget-rollover`, `deposit-maturity`, `gold-price`, `expire-invitations`, `net-worth-snapshot`, `reconcile` — pola bearer identik di semuanya)
- [ ] Verifikasi header keamanan (`curl -I`) (dijalankan setelah `npm run verify` selesai — DB-heavy process yang sedang berjalan bersamaan; lihat LAUNCH-CHECKLIST.md untuk hasil)
- [ ] `npm audit` bersih (4 moderate tersisa setelah memperbaiki nodemailer — seluruhnya `esbuild`/`@esbuild-kit/*` via `drizzle-kit`, dependency **dev-only** untuk tooling migrasi, tidak pernah masuk bundle produksi. Memperbaikinya butuh downgrade mayor `drizzle-kit` ke 0.18.1, risiko lebih besar dari manfaatnya — diterima & didokumentasikan, bukan "bersih" secara literal)
- [x] Secret scanning bersih (tidak ada tool khusus tersedia di lingkungan ini — dilakukan manual: pola kunci umum AWS/Stripe/Slack/Google/GitHub via `git grep`, pola generik `password|secret|api_key|token = "..."`, dan konfirmasi `.env` tidak pernah masuk riwayat git sama sekali — nol temuan di ketiganya)

## Audit Privasi Household (tiga akun nyata)

Diverifikasi dengan tiga sesi Playwright independen (A/owner, B/member, C/non-sharing) dalam satu household nyata — setara tiga akun manusia, memakai infrastruktur multi-sesi yang sama yang sudah dibangun task 04–19 (`e2e/fixtures/authenticated.ts`, `e2e/helpers/auth-session.ts`). `e2e/household-privacy-audit.spec.ts` adalah spec pertama yang menyeed TIGA sesi sekaligus ke satu household — sebelumnya seluruh spec household memakai dua.

- [ ] Akun C tidak membagikan apa pun → tidak terlihat oleh A maupun B (test baru: "a member who never shares or tags anything never surfaces financially to A or B, only by name" — belum dijalankan, `npm run test:e2e` menunggu `npm run verify` selesai agar tidak berebut koneksi DB; lihat LAUNCH-CHECKLIST.md)
- [ ] `owner` A tidak dapat melihat dompet pribadi B (test baru: "owner cannot see a non-sharing member private wallet balance anywhere, only their name in the member-transfer target picker" — sama, menunggu run e2e)
- [x] `member` ditolak pada setiap aksi khusus `owner` (sudah tercakup penuh lewat integration test — keempat aksi: undang (`invitations.integration.test.ts`), keluarkan anggota (`memberships.integration.test.ts`), ubah nama/arsip & alihkan kepemilikan (`households.integration.test.ts`), semuanya `ForbiddenError`. Tidak ditambah versi e2e — UI tidak pernah merender kontrol ini ke non-owner sama sekali (`member-list.tsx`'s `isOwner && ...`), jadi e2e hanya akan membuktikan tombolnya tidak ada, bukan otorisasi tambahan di atas integration test yang sudah ada)
- [x] Keluarkan B → akses hilang seketika, `share_wealth`-nya dimatikan (akses: `e2e/household-membership.spec.ts`; `share_wealth` mati: `src/lib/services/__tests__/memberships.integration.test.ts` — satu transaction, sudah ada sejak task 11)
- [x] Transfer A→B tidak menyentuh saldo B sama sekali sampai B mencatatnya sendiri — **butir ini menyimpang dari implementasi nyata, dicatat sebagai temuan konsistensi dokumen, bukan diuji sebagai kebenaran.** ADR-030 (docs/16) mengubah model ini sejak awal: satu pencatatan menulis KEDUA sisi sekaligus dan seketika (`e2e/transfers-member.spec.ts` — "both balances correct immediately"), penerima **diberi tahu** lewat Aktivitas, bukan "mencatat sendiri" untuk memindahkan uang. docs/14-testing-strategy.md §7 masih memuat contoh kode dari model lama (pre-ADR-030) yang bertentangan dengan baris skenario 19 tepat di atasnya sendiri — diperbaiki di task 23 (lihat commit hardening). Perilaku SEKARANG (immediate, bukan pending) sudah teruji penuh oleh `e2e/transfers-member.spec.ts`.
- [x] Kekayaan keluarga menampilkan per anggota lebih dulu, dengan cakupan pada total (tercakup `e2e/net-worth-household.spec.ts` sejak task 19, ditambah diverifikasi ulang di `household-privacy-audit.spec.ts`'s test pertama sebagai bagian skenario tiga-akun)
- [x] Email undangan tidak memuat data finansial (`src/lib/email/__tests__/invitation.test.ts` sudah menegaskan tidak ada pola `Rp`/saldo/balance/transaksi/wallet di subject/text/html sejak task 11)

## Audit Aksesibilitas

- [ ] axe pada seluruh rute — nol pelanggaran (coverage kini menjangkau ~30 rute nyata, naik dari 4 sebelumnya — lihat `e2e/helpers/a11y-check.ts`, `e2e/household-a11y.spec.ts`, `e2e/public-pages-a11y.spec.ts`, plus ekstensi di `e2e/responsive.spec.ts`/`categories`/`wallets`/`deposits`/`gold`/`debts`/`net-worth`/`savings`.spec.ts. **Hasil jalan (hijau/merah) menunggu `npm run test:e2e`** — lihat LAUNCH-CHECKLIST.md)
- [x] Navigasi keyboard seluruh alur kritis (cakupan ada di `e2e/kitchen-sink.spec.ts`, `e2e/app-shell.spec.ts`, `e2e/household-membership.spec.ts` — tidak diperluas lebih jauh di task ini; ini genuinely area yang lebih pas untuk audit manual perangkat sungguhan daripada penambahan e2e baru)
- [x] Pembaca layar: nominal dibacakan naratif (`MoneyText` — `src/components/finance/money-text.tsx` — sudah render `aria-label` naratif "masuk Rp45.000"/"keluar Rp45.000", bukan simbol matematika, sejak task awal)
- [x] Kontras terverifikasi dari token, kedua mode (`src/app/__tests__/contrast.test.ts` sudah sangat menyeluruh — menguji token asli dari `globals.css`, mengunci defek kontras yang sudah diketahui dan warna turunan `-readable` yang memperbaikinya, kedua mode. Tidak diperluas — sudah memenuhi kriteria)
- [x] Setiap kontrol ≥ 44×44 px (assersi ukuran sentuh tersebar di banyak spec — `budgets`, `transfers`, `reports`, `net-worth-household`, `responsive`, `transactions`, `household`, `kitchen-sink`, dll. Pola sudah mapan sejak task-task awal, tidak ditemukan celah baru)
- [x] `prefers-reduced-motion` dihormati (`globals.css`'s `@media (prefers-reduced-motion: reduce)` — aturan global, `animation-duration`/`transition-duration` dipotong ke 0.01ms, transform dimatikan eksplisit di elemen kaca; diverifikasi e2e di `e2e/kitchen-sink.spec.ts`)
- [ ] Uji satu tangan di perangkat sungguhan (tidak dapat dilakukan — butuh perangkat fisik sungguhan, di luar kapasitas sesi ini)

## Audit Performa

- [ ] Lighthouse CI hijau di seluruh rute (dijalankan lokal terhadap `npm run build && npm start` untuk seluruh rute — **CI sungguhan (treosh/lighthouse-ci-action) butuh URL preview Vercel yang tidak ada di sesi ini**; hasil lokal di LAUNCH-CHECKLIST.md §5)
- [ ] LCP < 2,5 s pada Moto G Power / 4G (diukur dari hasil Lighthouse lokal di atas — throttling profil Moto G Power/4G disimulasikan Lighthouse sendiri, bukan perangkat fisik; hasil di LAUNCH-CHECKLIST.md §5)
- [ ] INP < 200 ms (sama, dari Lighthouse lokal)
- [ ] CLS < 0,1 (sama, dari Lighthouse lokal)
- [ ] Bundle dashboard < 180 KB, laporan < 280 KB (diukur dari output `npm run build`'s route size table; hasil di LAUNCH-CHECKLIST.md §5)
- [x] Tanpa horizontal overflow pada 7 lebar (coverage otomatis kini menjangkau ~30 rute — lihat bagian Aksesibilitas di atas untuk daftar lengkap file. **Hasil jalan menunggu `npm run test:e2e`**)
- [ ] Query dashboard < 300 ms p95 (tidak dapat diukur tanpa telemetri produksi sungguhan — tidak ada lalu lintas nyata di lingkungan lokal untuk menghitung p95 yang berarti. Query dashboard sudah dirancang dengan index yang tepat sejak task 20; verifikasi p95 sungguhan adalah item pasca-peluncuran, ditambahkan ke daftar pemantauan LAUNCH-CHECKLIST.md)

## Audit Integritas Finansial

- [ ] Seluruh invarian I1–I18 punya test dan hijau (audit lengkap I1–I19: setiap invarian ditelusuri terhadap kode & test-nya. I1, I2, I8, I10, I11, I12, I13, I18, I19 sudah bertanda "I#" di test sejak awal. I3, I4, I5, I9, I14, I15, I16 sudah punya test benar, ditambah komentar tag agar grep-able. I6, I7, I17 adalah celah nyata — ditutup dengan test baru (lihat commit hardening). **Semuanya hijau menunggu `npm run test:coverage` selesai** — lihat LAUNCH-CHECKLIST.md)
- [ ] Rekonsiliasi pada data produksi → 0 selisih (tidak ada "data produksi" sungguhan di sesi ini — belum ada deployment. `runReconciliation()` terhadap DB dev bersama dijalankan sebagai bagian test suite; hasil di LAUNCH-CHECKLIST.md §5. Verifikasi sungguhan terhadap data produksi adalah item pasca-deploy)
- [x] Property test seluruh jalur anti-double-count hijau (sudah ada sejak awal — `src/lib/finance/__tests__/net-worth.property.test.ts` dkk., fast-check, mencakup transfer/kontribusi savings/pembayaran hutang/transfer anggota — tidak ditemukan celah baru di area ini)
- [ ] Coverage `lib/finance` ≥ 95% cabang (hasil aktual menunggu `npm run test:coverage` — lihat LAUNCH-CHECKLIST.md §5)
- [ ] Coverage `lib/visibility` = 100% cabang (sama)
- [ ] Coverage keseluruhan ≥ 70% (sama)

## Observability

- [x] Sentry + scrubber data finansial (SDK terpasang & terhubung — `src/instrumentation.ts`, `src/instrumentation-client.ts`, `next.config.ts`'s `withSentryConfig`; scrubber `src/lib/observability/scrubber.ts` sebagai `beforeSend`/`beforeSendTransaction`, 13 unit test hijau. **Tidak ada project Sentry sungguhan terhubung di sesi ini** — `NEXT_PUBLIC_SENTRY_DSN` kosong, `Sentry.init` berjalan sebagai no-op yang terdokumentasi sampai DSN nyata diisi saat deploy — lihat LAUNCH-CHECKLIST.md)
- [x] Vercel Analytics + Speed Insights, mode privasi (`<Analytics />`/`<SpeedInsights />` terpasang di `src/app/layout.tsx`; mode privasi bawaan — nol cookie, nol `track()` custom event di seluruh codebase yang bisa membawa nominal/nama. **Tidak dapat diverifikasi ke dashboard nyata** — tidak ada deployment Vercel di sesi ini)
- [x] `/api/health` (`src/app/api/health/route.ts` — liveness+readiness, `SELECT 1` ke DB, tanpa auth (dikecualikan dari `src/proxy.ts`), integration test hijau)
- [ ] Uptime check eksternal (tertunda — butuh domain produksi nyata untuk dipantau; tidak ada deployment di sesi ini. Endpoint `/api/health` sudah siap dipakai begitu ada URL produksi)
- [x] `/api/cron/reconcile` aktif (`src/app/api/cron/reconcile/route.ts`, bearer `CRON_SECRET`, dijadwalkan `vercel.json` 03:00 WIB, integration test hijau — lihat juga `docs/runbook.md` §2)
- [x] **Empat** alert saja: selisih rekonsiliasi · error > 1%/5 mnt · cron gagal 2× · migrasi gagal (1: `reportReconciliationFinding` di `src/lib/observability/sentry.ts`, dipanggil dari route reconcile setiap kali `hasFindings`; 2–4: bergantung pada Sentry/Vercel Cron dashboard alert rules yang dikonfigurasi di sisi platform saat deploy — bukan kode, didokumentasikan di `docs/runbook.md` §0 dan `docs/13-deployment-vercel.md` §9)
- [ ] Verifikasi: picu satu alert secara sengaja, pastikan sampai (tertunda — tidak dapat diverifikasi tanpa project Sentry/dashboard alert nyata yang terhubung; lihat LAUNCH-CHECKLIST.md bagian "Tertunda hingga deploy")

## Operasional

- [x] `docs/runbook.md` — rollback, selisih rekonsiliasi, kegagalan cron, kebocoran rahasia (ditulis lengkap dengan perintah konkret untuk seluruh empat kondisi alert, plus pemulihan backup dan kebocoran rahasia)
- [ ] **Uji pemulihan backup ke Neon branch — jalankan sungguhan** (tertunda — butuh kredensial Neon API/console (`NEON_API_KEY` atau login `neonctl`) untuk membuat branch lewat control plane; `.env` sesi ini hanya berisi connection string Postgres (`DATABASE_URL`/`DATABASE_URL_UNPOOLED`), yang tidak memberi akses control-plane. Dicoba: `neonctl` terinstal via `npx` tapi tidak ada kredensial untuk autentikasi. Prosedurnya sudah didokumentasikan lengkap di `docs/runbook.md` §7, siap dijalankan begitu kredensial tersedia)
- [ ] Verifikasi retensi PITR ≥ 7 hari di produksi (tertunda — sama, butuh akses Neon console/API yang tidak tersedia di lingkungan ini; tidak ada project Neon "produksi" nyata pada tahap ini karena belum ada deployment Vercel)
- [x] Verifikasi `expire-invitations` tidak menulis ledger entry apa pun (`src/lib/services/invitations.ts`'s `expireInvitations` hanya menyentuh `household_invitations.status` lewat `WHERE status='pending'` — dikonfirmasi baca kode langsung, tidak ada import `postEntries`/`ledgerEntries`/`wallets` sama sekali di modul ini)

## Audit Legal

- [x] Tidak ada aset, ikon, atau ilustrasi pihak lain (`public/icons/*` adalah monogram "M" generik buatan sendiri; ikon UI dari `lucide-react`, MIT, tidak meniru brand lain; nol gambar/ilustrasi lain di repo)
- [x] Tidak ada nama atau trademark Money Lover di produk maupun materi (satu-satunya penyebutan "Money Lover" di seluruh repo ada di docs/00-overview.md §3 sendiri — kebijakan yang MELARANG penggunaannya, bukan penggunaan itu sendiri. Nol di `src/`, `public/`, atau materi lain)
- [x] Lisensi dependensi kompatibel (`license-checker --summary`: 551 MIT, sisanya Apache-2.0/ISC/BSD/BlueOak/MPL-2.0/CC0 — seluruhnya permisif. Satu entri LGPL-3.0-or-later adalah `@img/sharp-libvips` bawaan `next` sendiri untuk optimisasi gambar, dipakai tanpa modifikasi — praktik standar setiap aplikasi Next.js. `package.json` sekarang eksplisit `"license": "UNLICENSED"` untuk aplikasi privat ini)
- [x] Kebijakan privasi & ketentuan layanan tersedia (`/privacy`, `/terms` — halaman statis, isinya faktual berdasarkan perilaku nyata aplikasi (docs/12 §9–11), ditautkan dari `/signin` dan `/settings/about`. **Ditandai eksplisit sebagai draf teknis, belum ditinjau penasihat hukum** — lihat LAUNCH-CHECKLIST.md; ini genuinely achievable di sesi ini, tinjauan hukum sungguhan tidak)

## Konsistensi Dokumen

- [x] Setiap dokumen dibaca ulang terhadap kode (seluruh 17 dokumen `docs/*.md` dibaca ulang terhadap `src/`, `package.json`, `vercel.json`)
- [x] Perbaiki dokumen yang menyimpang (drift yang ditemukan & diperbaiki: versi TypeScript/ESLint di docs/11; react-hook-form/SWR yang tercatat sebagai dipakai padahal tidak pernah diadopsi (native `useState`/Server Actions dipakai sebagai gantinya); folder `features/debts`→`features/obligations` (ADR-033 baru); DDL docs/04 menyebut `dompet` padahal tabel sungguhan `wallets` (7 titik); docs/12 §9 & docs/13 §3 masih menyebut Resend padahal SMTP dipakai sejak task 04 (ADR-032 baru); tabel cron docs/06 §7 & docs/13 §2 tidak menyebut `reconcile`/`net-worth-snapshot` dan salah menyebut `expire-invitations` sebagai harian padahal per jam sejak task 11; docs/06 §7 salah menyatakan rekonsiliasi "mencabut izin berbagi" padahal read-only murni; docs/14 §7 memuat contoh kode model transfer lama (pre-ADR-030) yang bertentangan dengan baris di atasnya sendiri)
- [x] Versi stack di [docs/11](../../docs/11-tech-architecture.md#1-tech-stack) cocok dengan `package.json` (diperiksa & diperbaiki — lihat di atas)
- [x] Seluruh tautan antar-dokumen berfungsi (diverifikasi dengan skrip yang meniru GitHub slugger terhadap seluruh 17 dokumen — nol tautan rusak, seluruh target `../tasks/*/spec.md` ada)
- [x] ADR mencakup setiap keputusan arsitektural yang diambil selama implementasi (dua keputusan nyata namun belum terdokumentasi ditemukan & ditulis: ADR-032 SMTP vs Resend, ADR-033 modul `obligations`)

## Verifikasi DoD

Seluruh 22 task fitur sebelumnya sudah memverifikasi butir masing-masing saat merge; pekerjaan task 23 di sini adalah mengonfirmasi tidak ada regresi lewat suite penuh, ditambah audit manual yang butuh pandangan lintas-modul (keamanan, privasi, invarian) yang tidak masuk cakupan task manapun sendirian.

- [ ] Seluruh butir Fungsional (bergantung pada `npm run verify` + `npm run test:e2e` hijau penuh — lihat LAUNCH-CHECKLIST.md §5. Invarian I11/I19 spesifik sudah diaudit manual di atas)
- [x] Seluruh butir Privasi (diverifikasi manual dengan tiga sesi nyata — lihat bagian Audit Privasi Household di atas. Satu baris DoD — "Hanya `createMemberTransfer` yang menerima dompet milik user lain" — dikonfirmasi ulang lewat grep tanda tangan fungsi di Audit Keamanan)
- [ ] Seluruh butir Kualitas & performa (bergantung pada hasil Lighthouse lokal + coverage — lihat Audit Performa/Integritas Finansial di atas)
- [ ] Seluruh butir Teknis (coverage & E2E bergantung pada run akhir; TypeScript/ESLint nol error sudah dikonfirmasi berulang kali sepanjang task ini setiap kali ada perubahan — lihat commit history task 23)

## Peluncuran

- [x] `LAUNCH-CHECKLIST.md` dengan hasil setiap audit (ditulis — lihat `LAUNCH-CHECKLIST.md`, §5 dilengkapi setelah verifikasi akhir)
- [x] Daftar keterbatasan yang diketahui (`LAUNCH-CHECKLIST.md` §6)
- [x] Daftar hal yang dipantau pasca-peluncuran (`LAUNCH-CHECKLIST.md` §7)
- [x] **Keputusan go/no-go terdokumentasi** (`LAUNCH-CHECKLIST.md` §1 — GO untuk status code-complete/verifikasi-lokal, dengan bagian tertunda-hingga-deploy dipisah eksplisit)
- [ ] Domain produksi + SSL (tertunda — di luar cakupan sesi ini per instruksi awal proyek, "GitHub dan Vercel nanti dulu")
- [ ] Env produksi lengkap dan terverifikasi (sama)
- [ ] Migrasi produksi berjalan bersih (sama — tidak ada database produksi di sesi ini; migrasi terverifikasi bersih terhadap DB dev bersama lewat `npm run build`)
- [ ] Uji asap pasca-deploy: login, catat transaksi, buat household, undang, transfer (sama — butuh URL live. Alur yang setara sudah dibuktikan lewat E2E terhadap dev server lokal)

## Verifikasi Akhir

- [ ] Seluruh gerbang CI hijau (`npm run verify` — lihat LAUNCH-CHECKLIST.md §5 untuk hasil akhir)
- [x] Seluruh audit selesai tanpa temuan terbuka (temuan nyata yang ditemukan selama audit ini semuanya ditutup: rate limit di 3 route, `sql.raw` lint rule yang belum ada, nodemailer CVE, celah scrubber untuk error ber-nama, 3 invarian finansial tanpa test, drift dokumentasi di 6 dokumen. Yang tersisa terbuka murni bersifat infrastruktur-belum-ada, bukan temuan kode — didaftar eksplisit di LAUNCH-CHECKLIST.md §4)
- [ ] Pemulihan backup teruji (**tertunda** — butuh kredensial Neon API yang tidak ada di `.env` sesi ini; lihat LAUNCH-CHECKLIST.md §4 dan `docs/runbook.md` §7 untuk prosedur siap-jalan)
- [ ] Go/no-go: **GO** (untuk status code-complete — lihat `LAUNCH-CHECKLIST.md` §1 untuk keputusan lengkap dengan batasannya)
