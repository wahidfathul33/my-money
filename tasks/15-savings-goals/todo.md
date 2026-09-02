# Todo — 15 Savings Goals

## Property Test Dulu (harus merah)

- [ ] Kontribusi tidak mengubah net worth (hanya berpindah pos)
- [ ] Total aset tetap sama sebelum dan sesudah kontribusi
- [ ] Jalankan → pastikan **merah** sebelum implementasi

## Logika Murni

- [ ] `lib/finance/savings.ts` — `calculateGoalProgress({target, current, targetDate})`
- [ ] `suggestedMonthly` — pembagian aman saat sisa bulan 0
- [ ] `suggestedMonthlyPerMember` untuk goal bersama
- [ ] Unit test: progress dibatasi 100%, target terlewat, target tercapai, sisa 0

## Service

- [ ] `createGoal` — `householdId` opsional; bila ada, `requireHouseholdMember`
- [ ] `updateGoal`, `archiveGoal`
- [ ] `contribute` — satu transaction: `postEntries` + INSERT kontribusi + UPDATE `current_amount`
- [ ] `withdraw` — `FOR UPDATE`; hanya kontribusi milik penarik; ke dompet miliknya
- [ ] Auto `completed` saat progress ≥ target
- [ ] Idempotensi pada semua kontribusi

## Query

- [ ] `listGoals(userId)` — pribadi + bersama dari household aktif
- [ ] `getGoal(id)` — dengan riwayat kontribusi
- [ ] `getContributionsByMember(goalId)` — untuk goal bersama
- [ ] `getTotalSavings(userId)` — untuk net worth

## Net Worth

- [ ] Perbarui `lib/finance/net-worth.ts`: aset tabungan = Σ kontribusi non-void

## Server Action

- [ ] `createGoalAction`, `updateGoalAction`, `archiveGoalAction`
- [ ] `contributeAction`, `withdrawAction`
- [ ] Zod: `walletId` wajib
- [ ] `revalidatePath` termasuk rute household untuk goal bersama

## UI

- [ ] `/wealth/savings` — daftar goal pribadi + bersama, total tersimpan
- [ ] `/wealth/savings/[id]` — ring besar, aksi, riwayat per bulan
- [ ] `/household/[id]/savings` — goal bersama, kontribusi per anggota dengan nama
- [ ] Sheet kontribusi: nominal + pemilih dompet sumber
- [ ] Catatan di sheet: "Kekayaan bersih Anda tidak berubah — dana dipindahkan, bukan dibelanjakan."
- [ ] Sheet penarikan: hanya menampilkan kontribusi milik sendiri
- [ ] Perayaan sekali saat target tercapai (sheet sederhana, tanpa konfeti)
- [ ] Target terlewat: "Target terlewat", bukan angka negatif
- [ ] Empty state pribadi & bersama

## Test

- [ ] **Integration: kontribusi mengurangi saldo dompet dengan nominal yang tepat sama**
- [ ] **Integration: `ledger_entry_id NOT NULL` menolak kontribusi tanpa ledger entry**
- [ ] Integration: penarikan kontribusi anggota lain ditolak
- [ ] Integration: penarikan ke dompet orang lain ditolak
- [ ] Integration: penarikan melebihi `funded` milik sendiri ditolak
- [ ] Integration: goal bersama hanya dapat dibuat anggota aktif household
- [ ] Integration: kontribusi tidak terhitung sebagai expense di laporan
- [ ] Integration: auto `completed` saat target tercapai
- [ ] Integration: rekonsiliasi — `current_amount` = Σ kontribusi non-void
- [ ] **Property test sekarang hijau**
- [ ] E2E: kontribusi Rp3jt → saldo turun → net worth tetap
- [ ] E2E (dua konteks): dua anggota berkontribusi ke goal bersama → total & rincian benar

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Rekonsiliasi 0 selisih
- [ ] **Periksa manual: kontribusi Rp10 juta → saldo dompet turun Rp10 juta, tabungan naik Rp10 juta, net worth tidak berubah**
