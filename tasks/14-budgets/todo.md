# Todo — 14 Budgets

## Logika Murni

- [x] `lib/finance/budget.ts` — `calculateBudgetStatus(amount, spent)` → safe/warning/over + persentase
- [x] Unit test ambang: 79,9% · 80% · 99,9% · 100% · 150%
- [x] Unit test: `amount = 0` tidak menyebabkan pembagian nol

## Service

- [x] `upsertPersonalBudget` — verifikasi kepemilikan kategori
- [x] `upsertHouseholdBudget` — `requireHouseholdMember` (peran apa pun); validasi `category_key` ada di katalog
- [x] `deleteBudget` — cek cakupan & peran
- [x] `materializeRecurringBudgets(period)` — untuk cron, idempoten

## Query

- [x] `getPersonalBudgets(userId, period)` — dengan terpakai
- [x] `getHouseholdBudgets(householdId, period)` — cocokkan lewat `categories.system_key`, dengan rincian per anggota
- [x] `calculateSpent` — **mengecualikan** `type = 'transfer'`, savings, pembayaran hutang, void
- [x] Termasuk sub-kategori dalam perhitungan
- [x] Batas periode: zona waktu user (pribadi), zona waktu household (household)

## Server Action

- [x] `upsertBudgetAction`, `deleteBudgetAction`
- [x] Zod: nominal > 0, periode valid, cakupan eksklusif
- [x] `revalidatePath('/budgets')`, `'/'`, `'/household/[id]/budgets'`

## UI

- [x] `/budgets` — budget pribadi, diurut persentase terpakai menurun
- [x] `/household/[id]/budgets` — budget household + rincian per anggota
- [x] `BudgetBar` — progress dengan warna ambang
- [x] Ringkasan header: total dianggarkan, terpakai, sisa
- [x] Sheet buat/edit dengan toggle "Ulangi setiap bulan" (default aktif)
- [x] `MemberBreakdown` — siapa menghabiskan berapa dari anggaran bersama
- [x] Empty state
- [x] Kartu budget di dashboard: **hanya yang ≥ 80%**
- [x] Pemilih kategori budget household hanya menampilkan kategori bawaan

## Cron

- [x] `/api/cron/budget-rollover` — bearer `CRON_SECRET`
- [x] Berjalan **harian**, memeriksa apakah tanggal 1 di zona waktu terkait
- [x] Memateralisasi budget berulang untuk periode baru
- [x] Idempoten lewat unique index
- [x] Test: panggil dua kali → satu instance

## Test

- [x] Unit: ambang status
- [x] Integration: terpakai dihitung benar, termasuk sub-kategori
- [x] **Integration: transfer tidak terhitung**
- [x] **Integration: kontribusi savings tidak terhitung**
- [x] **Integration: pembayaran hutang tidak terhitung**
- [x] Integration: transaksi ter-void dikecualikan
- [x] Integration: batas periode memakai zona waktu yang benar (uji 31 & 1 pukul 23:30 WIB)
- [x] Integration: budget household menjumlahkan transaksi bertanda dari semua anggota
- [x] **Integration: cocok eksak lewat `system_key` lintas anggota, meski namanya diganti salah satu anggota**
- [x] Integration: `category_key` di luar katalog ditolak
- [x] Integration: kategori kustom tidak dapat dijadikan budget household
- [x] Integration: `CHECK budget_scope_exclusive` menolak cakupan ganda
- [x] Integration: unique index menolak duplikat kategori+periode
- [x] **Integration: isolasi lintas-user & lintas-household**
- [x] E2E: buat budget → catat pengeluaran → progres bergerak
- [x] E2E: lewati 100% → status `over` + warna danger

## Verifikasi Akhir

- [x] `npm run verify` hijau
- [x] Periksa manual: satu transaksi bertanda muncul di budget pribadi **dan** household, dengan angka yang benar di keduanya
