# Todo — 21 Reports & Analytics

## Query — Pribadi

- [x] `getIncomeVsExpense(userId, months)` — 6 bulan terakhir
- [x] `getExpenseByCategory(userId, period)` — terurut menurun, ekor digabung "Lainnya"
- [x] `getTopCategories(userId, period, 3)` — dengan perbandingan bulan lalu
- [x] `getCashFlow(userId, period)` — saldo kumulatif harian
- [x] `getSavingsGrowth(userId, months)` — Σ kontribusi non-void
- [x] Semua mengecualikan transfer, kontribusi savings, dan void dari income/expense
- [x] Batas periode memakai zona waktu user

## Query — Household

- [x] `getHouseholdSummary(householdId, period)` — income, expense, per kategori (`system_key` + kustom per pemilik), per anggota
- [x] `getHouseholdTrend(householdId, months)`
- [x] `requireHouseholdMember` pada semuanya (route handler calls `requireHouseholdAccess`; queries themselves follow the existing src/features/household/** convention of not re-checking membership once the caller is verified)
- [x] Batas periode memakai zona waktu **household**

## Route Handler

- [x] `GET /api/reports/summary`
- [x] `GET /api/households/[id]/summary`
- [x] Rate limit standar

## Komponen Chart

- [x] `src/components/charts/*` — pembungkus Recharts
- [x] `dynamic()` import dengan `ssr: false`
- [x] `GroupedBarChart` — income vs expense
- [x] `HorizontalBarChart` — per kategori (bukan pie)
- [x] `LineChart` — arus kas, pertumbuhan tabungan
- [x] `StackedBar` — komposisi
- [x] Maks 6 seri; ekor digabung
- [x] Label sumbu dipersingkat, tidak dirotasi
- [x] Tooltip dapat disentuh, bukan hanya hover (Recharts default Tooltip — no separate touch-only interaction added; not independently e2e-verified beyond that default)
- [x] **Setiap chart disertai `<DataTable>` di bawahnya**

## Halaman

- [x] `/reports` — pemilih periode + 5 bagian
- [x] Bagian household di `/household/[id]` (tautan ke rincian) → `/household/[id]/reports`
- [x] Catatan "Didominasi {kategori}" bila > 80%
- [x] Empty state: data < 7 hari
- [x] Skeleton chart seukuran chart akhir

## Ekspor CSV

- [x] `exportDataAction` — transaksi, dompet, aset, hutang, piutang milik user
- [x] **Tidak menyertakan data anggota household lain**
- [x] Format: header bahasa Indonesia, nominal sebagai angka desimal, tanggal ISO
- [x] Rate limit 3/jam per user
- [x] Unduhan lewat blob, bukan disimpan di server (action returns CSV text only; no server-side file write)
- [x] Test: isi CSV cocok dengan data di aplikasi
- [x] Test: data anggota lain tidak ikut

## Performa

- [x] Verifikasi Recharts **tidak** masuk bundle rute lain (`npm run build` + analisis — direct gzip measurement of the 3 recharts-containing chunks, plus a real e2e network-capture test in e2e/reports.spec.ts proving no non-report route ever loads a chunk containing recharts source)
- [x] JS rute laporan < 280 KB gzip (the 3 chunks containing recharts source total ~109 KB gzip)
- [x] Lighthouse CI pada `/reports` (added to .github/workflows/ci.yml's urls list + a 280KB path-specific script budget in lighthouse-budget.json)

## Test

- [x] Integration: agregasi income/expense benar
- [x] Integration: transfer dikecualikan
- [x] Integration: kontribusi savings dikecualikan
- [x] Integration: void dikecualikan
- [x] Integration: pertumbuhan tabungan cocok persis dengan angka net worth
- [x] Integration: per kategori menggabungkan ekor menjadi "Lainnya" (unit-tested in report-aggregation.test.ts; exercised live in e2e/reports.spec.ts's "Lainnya" tick assertion)
- [x] Integration: household mengelompokkan lewat `system_key` lintas anggota (eksak)
- [x] Integration: kategori kustom dua anggota tampil sebagai dua baris terpisah dengan nama pemilik
- [x] Integration: batas periode zona waktu benar (pribadi & household)
- [x] **Integration: isolasi lintas-user & lintas-household**
- [x] **E2E: tanpa horizontal overflow pada seluruh chart di 360px**
- [ ] E2E: ekspor CSV, verifikasi isi — NOT built as an e2e test: there is no UI entry point in this task's scope (task 22 owns the `/settings/data` page with the actual "Ekspor CSV" button per the task briefing's file-ownership split). Covered instead by src/features/settings/__tests__/export.integration.test.ts (content-match + cross-user isolation against the real DB). Should become a real e2e test once task 22's button ships.
- [x] E2E: axe nol pelanggaran

## Verifikasi Akhir

- [x] `npm run verify` hijau — dikonfirmasi oleh coordinator: 81/81 file test, 994/994 test lulus, typecheck & lint bersih.
- [x] Bundle rute laporan dalam anggaran
- [x] Periksa manual di 360px: seluruh chart terbaca, tidak ada yang terpotong (verified via e2e, not a manual visual pass by a human)
