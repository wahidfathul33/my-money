# Todo — 16 Assets: Gold

## Logika Murni

- [x] `lib/finance/gold.ts` — `averageCostPerGram(lots)`
- [x] `currentValue(totalGrams, buybackPerGram)`
- [x] `unrealizedGain(lots, buybackPerGram)`
- [x] `computeSale(lots, gramsSold, pricePerGram)` → proceeds, cost basis, realized gain, pengurangan proporsional per lot
- [x] Pembulatan eksplisit saat berat × harga → uang
- [x] Unit test: satu lot, banyak lot harga berbeda, jual sebagian, jual seluruhnya, berat pecahan

## Provider Harga

- [x] `GoldPriceProvider` interface
- [x] `ManualPriceProvider` — selalu terdaftar
- [x] `ExternalPriceProvider` — di belakang `GOLD_PRICE_PROVIDER=external`
- [x] **Fallback wajib ke harga manual terakhir saat gagal**
- [x] Unit test: provider eksternal error → mundur ke manual

## Service

- [x] `buyGold` — satu transaction: INSERT asset (bila belum ada) + lot + `postEntries` + cache
- [x] `sellGold` — `FOR UPDATE` pada lot; kurangi proporsional; INSERT `gold_sales`; `postEntries`; cache
- [x] `recordGoldPrice` — upsert per (user, tanggal)
- [x] `refreshGoldPrices()` — untuk cron

## Query

- [x] `getGoldHoldings(userId)` — total gram, cost basis, nilai kini, gain
- [x] `getLatestPrice(userId)` — dengan umur harga
- [x] `getGoldSales(userId)`

## Server Action

- [x] `buyGoldAction`, `sellGoldAction`, `recordGoldPriceAction`
- [x] Zod: berat > 0 desimal, harga > 0, buyback ≤ jual
- [x] Idempotensi pada beli & jual

## UI

- [x] `/wealth/assets/gold` — total gram, nilai, gain, harga buyback + umur
- [x] Badge "Diperbarui N hari lalu" → peringatan setelah 30 hari
- [x] Tooltip: perbedaan harga jual vs buyback (sekali)
- [x] Daftar lot: berat, tanggal, harga beli, nilai kini, gain per lot
- [x] Sheet beli: berat, harga/gram (terisi dari harga jual terakhir), dompet
- [x] Sheet jual: berat, harga/gram (terisi dari buyback), dompet tujuan
- [x] Dialog konfirmasi jual menampilkan proceeds + realized gain/loss
- [x] Sheet update harga: jual & buyback
- [x] Toggle `exclude_from_household`
- [x] Empty state: belum ada kepemilikan
- [x] Belum ada harga → valuasi disembunyikan + CTA

## Cron

- [x] `/api/cron/gold-price` — bearer `CRON_SECRET`
- [x] Hanya berjalan bila `GOLD_PRICE_PROVIDER=external`
- [x] Fallback ke harga manual saat gagal, dicatat di log
- [x] Idempoten per (user, tanggal)

## Test

- [x] Unit: cost basis rata-rata tertimbang, banyak lot
- [x] Unit: penjualan proporsional lintas lot
- [x] Unit: realized gain benar
- [x] Integration: beli mengurangi saldo dompet sebesar berat × harga
- [x] Integration: jual menambah saldo dompet sebesar proceeds
- [x] Integration: jual melebihi kepemilikan ditolak
- [x] Integration: `remaining_grams` berkurang proporsional
- [x] **Integration: valuasi memakai buyback, bukan harga jual**
- [x] Integration: `CHECK gold_buyback_lte_sell` menolak data tidak sah
- [x] Integration: upsert harga per (user, tanggal)
- [x] Integration: harga user A tidak memengaruhi valuasi user B
- [x] Integration: provider eksternal gagal → memakai harga manual terakhir
- [x] **Integration: isolasi lintas-user**
- [x] E2E: beli → saldo turun → update harga → gain berubah → jual → saldo naik

## Verifikasi Akhir

- [x] `npm run verify` hijau
- [x] Rekonsiliasi 0 selisih
- [x] Periksa manual: beli emas → net worth turun sedikit (spread), bukan naik
