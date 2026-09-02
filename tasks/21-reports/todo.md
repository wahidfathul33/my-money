# Todo — 21 Reports & Analytics

## Query — Pribadi

- [ ] `getIncomeVsExpense(userId, months)` — 6 bulan terakhir
- [ ] `getExpenseByCategory(userId, period)` — terurut menurun, ekor digabung "Lainnya"
- [ ] `getTopCategories(userId, period, 3)` — dengan perbandingan bulan lalu
- [ ] `getCashFlow(userId, period)` — saldo kumulatif harian
- [ ] `getSavingsGrowth(userId, months)` — Σ kontribusi non-void
- [ ] Semua mengecualikan transfer, kontribusi savings, dan void dari income/expense
- [ ] Batas periode memakai zona waktu user

## Query — Household

- [ ] `getHouseholdSummary(householdId, period)` — income, expense, per kategori (`system_key` + kustom per pemilik), per anggota
- [ ] `getHouseholdTrend(householdId, months)`
- [ ] `requireHouseholdMember` pada semuanya
- [ ] Batas periode memakai zona waktu **household**

## Route Handler

- [ ] `GET /api/reports/summary`
- [ ] `GET /api/households/[id]/summary`
- [ ] Rate limit standar

## Komponen Chart

- [ ] `src/components/charts/*` — pembungkus Recharts
- [ ] `dynamic()` import dengan `ssr: false`
- [ ] `GroupedBarChart` — income vs expense
- [ ] `HorizontalBarChart` — per kategori (bukan pie)
- [ ] `LineChart` — arus kas, pertumbuhan tabungan
- [ ] `StackedBar` — komposisi
- [ ] Maks 6 seri; ekor digabung
- [ ] Label sumbu dipersingkat, tidak dirotasi
- [ ] Tooltip dapat disentuh, bukan hanya hover
- [ ] **Setiap chart disertai `<DataTable>` di bawahnya**

## Halaman

- [ ] `/reports` — pemilih periode + 5 bagian
- [ ] Bagian household di `/household/[id]` (tautan ke rincian)
- [ ] Catatan "Didominasi {kategori}" bila > 80%
- [ ] Empty state: data < 7 hari
- [ ] Skeleton chart seukuran chart akhir

## Ekspor CSV

- [ ] `exportDataAction` — transaksi, dompet, aset, hutang, piutang milik user
- [ ] **Tidak menyertakan data anggota household lain**
- [ ] Format: header bahasa Indonesia, nominal sebagai angka desimal, tanggal ISO
- [ ] Rate limit 3/jam per user
- [ ] Unduhan lewat blob, bukan disimpan di server
- [ ] Test: isi CSV cocok dengan data di aplikasi
- [ ] Test: data anggota lain tidak ikut

## Performa

- [ ] Verifikasi Recharts **tidak** masuk bundle rute lain (`npm run build` + analisis)
- [ ] JS rute laporan < 280 KB gzip
- [ ] Lighthouse CI pada `/reports`

## Test

- [ ] Integration: agregasi income/expense benar
- [ ] Integration: transfer dikecualikan
- [ ] Integration: kontribusi savings dikecualikan
- [ ] Integration: void dikecualikan
- [ ] Integration: pertumbuhan tabungan cocok persis dengan angka net worth
- [ ] Integration: per kategori menggabungkan ekor menjadi "Lainnya"
- [ ] Integration: household mengelompokkan lewat `system_key` lintas anggota (eksak)
- [ ] Integration: kategori kustom dua anggota tampil sebagai dua baris terpisah dengan nama pemilik
- [ ] Integration: batas periode zona waktu benar (pribadi & household)
- [ ] **Integration: isolasi lintas-user & lintas-household**
- [ ] **E2E: tanpa horizontal overflow pada seluruh chart di 360px**
- [ ] E2E: ekspor CSV, verifikasi isi
- [ ] E2E: axe nol pelanggaran

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Bundle rute laporan dalam anggaran
- [ ] Periksa manual di 360px: seluruh chart terbaca, tidak ada yang terpotong
