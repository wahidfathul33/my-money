# Todo — 16 Assets: Gold

## Logika Murni

- [ ] `lib/finance/gold.ts` — `averageCostPerGram(lots)`
- [ ] `currentValue(totalGrams, buybackPerGram)`
- [ ] `unrealizedGain(lots, buybackPerGram)`
- [ ] `computeSale(lots, gramsSold, pricePerGram)` → proceeds, cost basis, realized gain, pengurangan proporsional per lot
- [ ] Pembulatan eksplisit saat berat × harga → uang
- [ ] Unit test: satu lot, banyak lot harga berbeda, jual sebagian, jual seluruhnya, berat pecahan

## Provider Harga

- [ ] `GoldPriceProvider` interface
- [ ] `ManualPriceProvider` — selalu terdaftar
- [ ] `ExternalPriceProvider` — di belakang `GOLD_PRICE_PROVIDER=external`
- [ ] **Fallback wajib ke harga manual terakhir saat gagal**
- [ ] Unit test: provider eksternal error → mundur ke manual

## Service

- [ ] `buyGold` — satu transaction: INSERT asset (bila belum ada) + lot + `postEntries` + cache
- [ ] `sellGold` — `FOR UPDATE` pada lot; kurangi proporsional; INSERT `gold_sales`; `postEntries`; cache
- [ ] `recordGoldPrice` — upsert per (user, tanggal)
- [ ] `refreshGoldPrices()` — untuk cron

## Query

- [ ] `getGoldHoldings(userId)` — total gram, cost basis, nilai kini, gain
- [ ] `getLatestPrice(userId)` — dengan umur harga
- [ ] `getGoldSales(userId)`

## Server Action

- [ ] `buyGoldAction`, `sellGoldAction`, `recordGoldPriceAction`
- [ ] Zod: berat > 0 desimal, harga > 0, buyback ≤ jual
- [ ] Idempotensi pada beli & jual

## UI

- [ ] `/wealth/assets/gold` — total gram, nilai, gain, harga buyback + umur
- [ ] Badge "Diperbarui N hari lalu" → peringatan setelah 30 hari
- [ ] Tooltip: perbedaan harga jual vs buyback (sekali)
- [ ] Daftar lot: berat, tanggal, harga beli, nilai kini, gain per lot
- [ ] Sheet beli: berat, harga/gram (terisi dari harga jual terakhir), dompet
- [ ] Sheet jual: berat, harga/gram (terisi dari buyback), dompet tujuan
- [ ] Dialog konfirmasi jual menampilkan proceeds + realized gain/loss
- [ ] Sheet update harga: jual & buyback
- [ ] Toggle `exclude_from_household`
- [ ] Empty state: belum ada kepemilikan
- [ ] Belum ada harga → valuasi disembunyikan + CTA

## Cron

- [ ] `/api/cron/gold-price` — bearer `CRON_SECRET`
- [ ] Hanya berjalan bila `GOLD_PRICE_PROVIDER=external`
- [ ] Fallback ke harga manual saat gagal, dicatat di log
- [ ] Idempoten per (user, tanggal)

## Test

- [ ] Unit: cost basis rata-rata tertimbang, banyak lot
- [ ] Unit: penjualan proporsional lintas lot
- [ ] Unit: realized gain benar
- [ ] Integration: beli mengurangi saldo dompet sebesar berat × harga
- [ ] Integration: jual menambah saldo dompet sebesar proceeds
- [ ] Integration: jual melebihi kepemilikan ditolak
- [ ] Integration: `remaining_grams` berkurang proporsional
- [ ] **Integration: valuasi memakai buyback, bukan harga jual**
- [ ] Integration: `CHECK gold_buyback_lte_sell` menolak data tidak sah
- [ ] Integration: upsert harga per (user, tanggal)
- [ ] Integration: harga user A tidak memengaruhi valuasi user B
- [ ] Integration: provider eksternal gagal → memakai harga manual terakhir
- [ ] **Integration: isolasi lintas-user**
- [ ] E2E: beli → saldo turun → update harga → gain berubah → jual → saldo naik

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Rekonsiliasi 0 selisih
- [ ] Periksa manual: beli emas → net worth turun sedikit (spread), bukan naik
