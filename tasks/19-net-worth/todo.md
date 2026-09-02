# Todo — 19 Net Worth

## Logika Murni — Pribadi

- [ ] Lengkapi `lib/finance/net-worth.ts` dengan seluruh sumber
- [ ] Dompet cash/bank/ewallet: hanya `balance > 0`
- [ ] Dompet bersaldo negatif → liabilitas
- [ ] Kartu kredit → liabilitas `ABS(balance)`
- [ ] Tabungan: Σ kontribusi non-void
- [ ] Emas: berat × **buyback**
- [ ] Deposito: **pokok saja**
- [ ] Piutang: hanya bila `count_receivables_as_asset`
- [ ] Mengembalikan `{totalAssets, totalLiabilities, netWorth, breakdown}`

## Logika Murni — Household

- [ ] `lib/finance/household-net-worth.ts`
- [ ] Menerima data yang **sudah tersaring** (tidak tahu cara menyaring)
- [ ] Mengembalikan `{byMember[], totals, coverage: {memberCount, contributingCount}}` — `byMember` lebih dulu

## Property Test (tulis dulu, harus merah)

- [ ] `netWorth = totalAssets − totalLiabilities` selalu
- [ ] I8: transfer sendiri, kontribusi savings, pembayaran hutang → net worth tetap
- [ ] I13: transfer ke anggota **tertaut** → kekayaan keluarga tetap
- [ ] Transfer ke anggota → net worth pengirim −amount, penerima +amount, keluarga tetap
- [ ] I10: bunga deposito akrual tidak dihitung
- [ ] Kartu kredit tidak pernah menambah aset
- [ ] Emas dinilai dengan buyback, bukan harga jual

## Query

- [ ] `getNetWorth(userId)` — mengumpulkan seluruh sumber
- [ ] `getHouseholdNetWorth(householdId)` — lewat `lib/visibility/household-items`, saring `status='active'` + `share_wealth=true`
- [ ] `getNetWorthHistory(userId, range)`
- [ ] `getHouseholdNetWorthHistory(householdId, range)`

## Route Handler

- [ ] `GET /api/net-worth/history`
- [ ] `GET /api/households/[id]/net-worth` — `requireHouseholdMember`; respons meletakkan `byMember` sebelum `totals`; **`coverage` wajib**

## Cron Snapshot

- [ ] `/api/cron/net-worth-snapshot` — bearer `CRON_SECRET`
- [ ] Satu baris per user aktif
- [ ] Satu baris per household aktif, dengan `contributing_count`
- [ ] `ON CONFLICT (user_id, snapshot_date) DO UPDATE` — idempoten
- [ ] Batas hari memakai zona waktu masing-masing
- [ ] Proses per batch dengan cursor
- [ ] Test: panggil dua kali → satu baris per entitas per tanggal

## Komponen

- [ ] `CoverageNote` — **prop `coverage` non-opsional**
- [ ] `MemberNetWorthRow` — baris per anggota, termasuk yang belum berbagi
- [ ] `NetWorthHero` — angka besar, delta, sparkline (hanya untuk net worth pribadi)
- [ ] Komponen total household **menolak dirender tanpa `coverage`** (tipe)
- [ ] Stacked bar horizontal untuk komposisi (bukan pie)
- [ ] Setiap baris komposisi dapat ditap → modul sumber

## Halaman

- [ ] `/wealth/net-worth` — hero, rentang waktu, area chart, komposisi, liabilitas, piutang terpisah
- [ ] `/household/[id]/net-worth` — **per anggota dulu**, lalu total + cakupan, lalu tren, lalu komposisi
- [ ] Anggota belum berbagi → tampil berlabel "Belum berbagi"
- [ ] Penanda pada grafik saat `contributing_count` berubah
- [ ] Riwayat < 2 titik → delta disembunyikan
- [ ] Net worth negatif ditampilkan apa adanya
- [ ] Empty state: belum ada snapshot / belum ada yang berbagi

## Test

- [ ] **Seluruh property test di atas hijau**
- [ ] Integration: rincian menjumlah tepat ke total (pribadi & household)
- [ ] Integration: household hanya menghitung item milik anggota aktif ber-`share_wealth`, mengecualikan `exclude_from_household`
- [ ] Integration: anggota `removed` tidak lagi terhitung
- [ ] Integration: `coverage` menghitung dengan benar
- [ ] Integration: snapshot idempoten
- [ ] Integration: **jalankan job rekonsiliasi — 0 selisih di seluruh modul**
- [ ] E2E: rincian menjumlah ke total di layar
- [ ] E2E: tap baris komposisi → menuju modul sumber
- [ ] E2E (dua konteks): satu anggota mengaktifkan `share_wealth` → cakupan berubah 1/2 → 2/2
- [ ] E2E (dua konteks): transfer ke anggota → kedua saldo benar, kekayaan keluarga tetap

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Rekonsiliasi 0 selisih
- [ ] **Periksa manual: telusuri satu angka net worth sampai ke transaksi asalnya**
- [ ] Periksa manual: tanpa household, halaman net worth pribadi tidak berubah sama sekali
