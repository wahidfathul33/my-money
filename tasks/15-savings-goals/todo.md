# Todo — 15 Savings Goals

## Property Test Dulu (harus merah)

- [x] Kontribusi tidak mengubah net worth (hanya berpindah pos)
- [x] Total aset tetap sama sebelum dan sesudah kontribusi
- [x] Jalankan → pastikan **merah** sebelum implementasi

## Logika Murni

- [x] `lib/finance/savings.ts` — `calculateGoalProgress({target, current, targetDate})`
- [x] `suggestedMonthly` — pembagian aman saat sisa bulan 0
- [x] `suggestedMonthlyPerMember` untuk goal bersama
- [x] Unit test: progress dibatasi 100%, target terlewat, target tercapai, sisa 0

## Service

- [x] `createGoal` — `householdId` opsional; bila ada, `requireHouseholdMember`
- [x] `updateGoal`, `archiveGoal`
- [x] `contribute` — satu transaction: `postEntries` + INSERT kontribusi + UPDATE `current_amount`
- [x] `withdraw` — `FOR UPDATE`; hanya kontribusi milik penarik; ke dompet miliknya
- [x] Auto `completed` saat progress ≥ target
- [x] Idempotensi pada semua kontribusi

## Query

- [x] `listGoals(userId)` — pribadi + bersama dari household aktif
- [x] `getGoal(id)` — dengan riwayat kontribusi
- [x] `getContributionsByMember(goalId)` — untuk goal bersama
- [x] `getTotalSavings(userId)` — untuk net worth

## Net Worth

- [x] Perbarui `lib/finance/net-worth.ts`: aset tabungan = Σ kontribusi non-void

## Server Action

- [x] `createGoalAction`, `updateGoalAction`, `archiveGoalAction`
- [x] `contributeAction`, `withdrawAction`
- [x] Zod: `walletId` wajib
- [x] `revalidatePath` termasuk rute household untuk goal bersama

## UI

- [x] `/wealth/savings` — daftar goal pribadi + bersama, total tersimpan
- [x] `/wealth/savings/[id]` — ring besar, aksi, riwayat per bulan
- [x] `/household/[id]/savings` — goal bersama, kontribusi per anggota dengan nama
- [x] Sheet kontribusi: nominal + pemilih dompet sumber
- [x] Catatan di sheet: "Kekayaan bersih Anda tidak berubah — dana dipindahkan, bukan dibelanjakan."
- [x] Sheet penarikan: hanya menampilkan kontribusi milik sendiri
- [x] Perayaan sekali saat target tercapai (sheet sederhana, tanpa konfeti)
- [x] Target terlewat: "Target terlewat", bukan angka negatif
- [x] Empty state pribadi & bersama

## Test

- [x] **Integration: kontribusi mengurangi saldo dompet dengan nominal yang tepat sama**
- [x] **Integration: `ledger_entry_id NOT NULL` menolak kontribusi tanpa ledger entry**
- [x] Integration: penarikan kontribusi anggota lain ditolak
- [x] Integration: penarikan ke dompet orang lain ditolak
- [x] Integration: penarikan melebihi `funded` milik sendiri ditolak
- [x] Integration: goal bersama hanya dapat dibuat anggota aktif household
- [x] Integration: kontribusi tidak terhitung sebagai expense di laporan
- [x] Integration: auto `completed` saat target tercapai
- [x] Integration: rekonsiliasi — `current_amount` = Σ kontribusi non-void
- [x] **Property test sekarang hijau**
- [x] E2E: kontribusi Rp3jt → saldo turun → net worth tetap
- [x] E2E (dua konteks): dua anggota berkontribusi ke goal bersama → total & rincian benar

## Verifikasi Akhir

- [x] `npm run verify` hijau
- [x] Rekonsiliasi 0 selisih
- [x] **Periksa manual: kontribusi Rp10 juta → saldo dompet turun Rp10 juta, tabungan naik Rp10 juta, net worth tidak berubah**
