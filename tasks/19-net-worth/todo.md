# Todo — 19 Net Worth

## Logika Murni — Pribadi

- [x] Lengkapi `lib/finance/net-worth.ts` dengan seluruh sumber
- [x] Dompet cash/bank/ewallet: hanya `balance > 0`
- [x] Dompet bersaldo negatif → liabilitas
- [x] Kartu kredit → liabilitas `ABS(balance)`
- [x] Tabungan: Σ kontribusi non-void
- [x] Emas: berat × **buyback**
- [x] Deposito: **pokok saja**
- [x] Piutang: hanya bila `count_receivables_as_asset`
- [x] Mengembalikan `{totalAssets, totalLiabilities, netWorth, breakdown}`

## Logika Murni — Household

- [x] `lib/finance/household-net-worth.ts`
- [x] Menerima data yang **sudah tersaring** (tidak tahu cara menyaring)
- [x] Mengembalikan `{byMember[], totals, coverage: {memberCount, contributingCount}}` — `byMember` lebih dulu

## Property Test (tulis dulu, harus merah)

- [x] `netWorth = totalAssets − totalLiabilities` selalu
- [x] I8: transfer sendiri, kontribusi savings, pembayaran hutang → net worth tetap
- [x] I13: transfer ke anggota **tertaut** → kekayaan keluarga tetap
- [x] Transfer ke anggota → net worth pengirim −amount, penerima +amount, keluarga tetap
- [x] I10: bunga deposito akrual tidak dihitung
- [x] Kartu kredit tidak pernah menambah aset
- [x] Emas dinilai dengan buyback, bukan harga jual

## Query

- [x] `getNetWorth(userId)` — mengumpulkan seluruh sumber
- [x] `getHouseholdNetWorth(householdId)` — lewat `lib/visibility/household-items`, saring `status='active'` + `share_wealth=true`
- [x] `getNetWorthHistory(userId, range)`
- [x] `getHouseholdNetWorthHistory(householdId, range)`

## Route Handler

- [x] `GET /api/net-worth/history`
- [x] `GET /api/households/[id]/net-worth` — `requireHouseholdMember`; respons meletakkan `byMember` sebelum `totals`; **`coverage` wajib**

## Cron Snapshot

- [x] `/api/cron/net-worth-snapshot` — bearer `CRON_SECRET`
- [x] Satu baris per user aktif
- [x] Satu baris per household aktif, dengan `contributing_count`
- [x] `ON CONFLICT (user_id, snapshot_date) DO UPDATE` — idempoten
- [x] Batas hari memakai zona waktu masing-masing
- [x] Proses per batch dengan cursor
- [x] Test: panggil dua kali → satu baris per entitas per tanggal

## Komponen

- [x] `CoverageNote` — **prop `coverage` non-opsional**
- [x] `MemberNetWorthRow` — baris per anggota, termasuk yang belum berbagi
- [x] `NetWorthHero` — angka besar, delta, sparkline (hanya untuk net worth pribadi)
- [x] Komponen total household **menolak dirender tanpa `coverage`** (tipe)
- [x] Stacked bar horizontal untuk komposisi (bukan pie)
- [x] Setiap baris komposisi dapat ditap → modul sumber

## Halaman

- [x] `/wealth/net-worth` — hero, rentang waktu, area chart, komposisi, liabilitas, piutang terpisah
- [x] `/household/[id]/net-worth` — **per anggota dulu**, lalu total + cakupan, lalu tren, lalu komposisi
- [x] Anggota belum berbagi → tampil berlabel "Belum berbagi"
- [x] Penanda pada grafik saat `contributing_count` berubah
- [x] Riwayat < 2 titik → delta disembunyikan
- [x] Net worth negatif ditampilkan apa adanya
- [x] Empty state: belum ada snapshot / belum ada yang berbagi

## Test

- [x] **Seluruh property test di atas hijau**
- [x] Integration: rincian menjumlah tepat ke total (pribadi & household)
- [x] Integration: household hanya menghitung item milik anggota aktif ber-`share_wealth`, mengecualikan `exclude_from_household`
- [x] Integration: anggota `removed` tidak lagi terhitung
- [x] Integration: `coverage` menghitung dengan benar
- [x] Integration: snapshot idempoten
- [x] Integration: **jalankan job rekonsiliasi — 0 selisih di seluruh modul**
- [x] E2E: rincian menjumlah ke total di layar
- [x] E2E: tap baris komposisi → menuju modul sumber
- [x] E2E (dua konteks): satu anggota mengaktifkan `share_wealth` → cakupan berubah 1/2 → 2/2
- [x] E2E (dua konteks): transfer ke anggota → kedua saldo benar, kekayaan keluarga tetap

## Verifikasi Akhir

- [x] `npm run verify` hijau
- [x] Rekonsiliasi 0 selisih
- [x] **Periksa manual: telusuri satu angka net worth sampai ke transaksi asalnya**
- [x] Periksa manual: tanpa household, halaman net worth pribadi tidak berubah sama sekali
