# Todo — 14 Budgets

## Logika Murni

- [ ] `lib/finance/budget.ts` — `calculateBudgetStatus(amount, spent)` → safe/warning/over + persentase
- [ ] Unit test ambang: 79,9% · 80% · 99,9% · 100% · 150%
- [ ] Unit test: `amount = 0` tidak menyebabkan pembagian nol

## Service

- [ ] `upsertPersonalBudget` — verifikasi kepemilikan kategori
- [ ] `upsertHouseholdBudget` — `requireHouseholdMember` (peran apa pun); validasi `category_key` ada di katalog
- [ ] `deleteBudget` — cek cakupan & peran
- [ ] `materializeRecurringBudgets(period)` — untuk cron, idempoten

## Query

- [ ] `getPersonalBudgets(userId, period)` — dengan terpakai
- [ ] `getHouseholdBudgets(householdId, period)` — cocokkan lewat `categories.system_key`, dengan rincian per anggota
- [ ] `calculateSpent` — **mengecualikan** `type = 'transfer'`, savings, pembayaran hutang, void
- [ ] Termasuk sub-kategori dalam perhitungan
- [ ] Batas periode: zona waktu user (pribadi), zona waktu household (household)

## Server Action

- [ ] `upsertBudgetAction`, `deleteBudgetAction`
- [ ] Zod: nominal > 0, periode valid, cakupan eksklusif
- [ ] `revalidatePath('/budgets')`, `'/'`, `'/household/[id]/budgets'`

## UI

- [ ] `/budgets` — budget pribadi, diurut persentase terpakai menurun
- [ ] `/household/[id]/budgets` — budget household + rincian per anggota
- [ ] `BudgetBar` — progress dengan warna ambang
- [ ] Ringkasan header: total dianggarkan, terpakai, sisa
- [ ] Sheet buat/edit dengan toggle "Ulangi setiap bulan" (default aktif)
- [ ] `MemberBreakdown` — siapa menghabiskan berapa dari anggaran bersama
- [ ] Empty state
- [ ] Kartu budget di dashboard: **hanya yang ≥ 80%**
- [ ] Pemilih kategori budget household hanya menampilkan kategori bawaan

## Cron

- [ ] `/api/cron/budget-rollover` — bearer `CRON_SECRET`
- [ ] Berjalan **harian**, memeriksa apakah tanggal 1 di zona waktu terkait
- [ ] Memateralisasi budget berulang untuk periode baru
- [ ] Idempoten lewat unique index
- [ ] Test: panggil dua kali → satu instance

## Test

- [ ] Unit: ambang status
- [ ] Integration: terpakai dihitung benar, termasuk sub-kategori
- [ ] **Integration: transfer tidak terhitung**
- [ ] **Integration: kontribusi savings tidak terhitung**
- [ ] **Integration: pembayaran hutang tidak terhitung**
- [ ] Integration: transaksi ter-void dikecualikan
- [ ] Integration: batas periode memakai zona waktu yang benar (uji 31 & 1 pukul 23:30 WIB)
- [ ] Integration: budget household menjumlahkan transaksi bertanda dari semua anggota
- [ ] **Integration: cocok eksak lewat `system_key` lintas anggota, meski namanya diganti salah satu anggota**
- [ ] Integration: `category_key` di luar katalog ditolak
- [ ] Integration: kategori kustom tidak dapat dijadikan budget household
- [ ] Integration: `CHECK budget_scope_exclusive` menolak cakupan ganda
- [ ] Integration: unique index menolak duplikat kategori+periode
- [ ] **Integration: isolasi lintas-user & lintas-household**
- [ ] E2E: buat budget → catat pengeluaran → progres bergerak
- [ ] E2E: lewati 100% → status `over` + warna danger

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Periksa manual: satu transaksi bertanda muncul di budget pribadi **dan** household, dengan angka yang benar di keduanya
