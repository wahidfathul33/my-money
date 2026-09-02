# Task 16 — Assets: Gold

**Fase:** F4 · **Bergantung pada:** 12 · **Dokumen:** [03-domain §11.2](../../docs/03-domain-model.md#112-emas), [ADR-007](../../docs/16-decision-log.md#adr-007--valuasi-emas-memakai-harga-buyback)

## Objektif

Kepemilikan emas dengan valuasi yang jujur: memakai harga **buyback**, bukan harga jual.

## Ruang Lingkup

**Termasuk:** lot emas, beli, jual, cost basis rata-rata tertimbang, riwayat harga (jual & buyback), provider harga pluggable, `exclude_from_household`.

**Tidak termasuk:** integrasi API eksternal aktif (kerangka disiapkan, aktivasi opsional di task 23).

## Dua Harga

Emas retail Indonesia punya harga jual (yang Anda bayar saat membeli) dan harga buyback (yang Anda terima saat menjual). Selisihnya 5–12%.

**Valuasi memakai `buyback_price_per_gram`** — itulah yang benar-benar akan diterima. Menilai dengan harga jual melebih-lebihkan kekayaan secara sistematis; untuk kepemilikan Rp65 juta, selisihnya Rp3–8 juta.

`CHECK gold_buyback_lte_sell` mengunci realitas ekonomi ke dalam skema. Data eksternal yang melanggarnya ditolak, bukan diam-diam merusak valuasi.

## Cost Basis

Rata-rata tertimbang atas lot yang masih tersisa:

```
avg_cost_per_gram = Σ(remaining_grams × purchase_price_per_gram) / Σ(remaining_grams)

current_value   = total_grams × buyback_price_per_gram
unrealized_gain = current_value − Σ(remaining_grams × purchase_price_per_gram)

Saat menjual:
proceeds      = grams_sold × buyback_price_at_sale
realized_gain = proceeds − (grams_sold × avg_cost_per_gram)
```

Dipilih daripada FIFO karena emas fisik *fungible*, dan FIFO menuntut UI menjelaskan lot mana yang dijual — kompleksitas tanpa manfaat bagi pengguna personal.

Penjualan mengurangi `remaining_grams` lot-lot **secara proporsional**.

## Provider Harga

```ts
interface GoldPriceProvider {
  readonly id: string
  fetch(): Promise<{ sellPerGram: bigint; buybackPerGram: bigint; asOf: Date }>
}
```

`ManualPriceProvider` selalu terdaftar dan menjadi default. `ExternalPriceProvider` aktif hanya bila `GOLD_PRICE_PROVIDER=external`, dan **wajib** mundur ke harga manual terakhir bila gagal.

Harga bersifat **per user** — dua anggota boleh memakai sumber berbeda tanpa saling menimpa.

## Kriteria Penerimaan

- [ ] Beli emas: lot baru + ledger entry (dompet turun) + `assets.cached_value` diperbarui, satu transaction.
- [ ] Saldo dompet turun sebesar `berat × harga_beli_per_gram`.
- [ ] Jual emas: `remaining_grams` beberapa lot berkurang proporsional, `gold_sales` tercatat, ledger entry masuk ke wallet.
- [ ] `realized_gain` dihitung terhadap cost basis rata-rata tertimbang.
- [ ] Menjual melebihi total kepemilikan ditolak (`FOR UPDATE`).
- [ ] Valuasi memakai `buyback_price_per_gram` — diverifikasi test.
- [ ] `CHECK gold_buyback_lte_sell` menolak buyback > harga jual.
- [ ] Update harga manual mencatat riwayat; satu baris per user per tanggal.
- [ ] Harga > 30 hari memicu badge peringatan + CTA perbarui.
- [ ] Belum ada harga sama sekali → valuasi disembunyikan, CTA "Masukkan harga saat ini".
- [ ] Tooltip menjelaskan sekali perbedaan harga jual vs buyback.
- [ ] `exclude_from_household` dapat di-toggle.
- [ ] `ExternalPriceProvider` mundur ke harga manual terakhir saat gagal — diverifikasi test.
- [ ] **Test isolasi:** lintas-user.

## Verifikasi

```bash
npm run test        # unit cost basis & gain + integration beli/jual + fallback provider
npm run test:e2e    # beli → saldo turun → update harga → gain berubah → jual
```

## Berkas yang Disentuh

Baru: `src/features/assets/gold/{actions,queries,schema}.ts` · `src/features/assets/gold/components/*` · `src/lib/services/gold.ts` · `src/lib/finance/gold.ts` · `src/lib/gold-price/{provider,manual,external}.ts` · `src/app/(app)/wealth/assets/gold/**` · `src/app/api/cron/gold-price/route.ts` · test.

## Batasan

**Selalu:** valuasi dengan harga buyback · berat sebagai `NUMERIC(18,4)`, uang sebagai `bigint` · penjualan memakai `FOR UPDATE`.
**Tanya dulu:** mengubah metode cost basis · mengaktifkan provider eksternal di produksi.
**Jangan:** menilai dengan harga jual · `float` untuk berat maupun harga · menjual melebihi kepemilikan · menjadikan provider eksternal sebagai satu-satunya sumber.

## Catatan

**Pembelian emas sedikit menurunkan net worth** — sebesar spread beli-buyback. Ini benar secara ekonomi tetapi mengejutkan; UI menjelaskannya sekali lewat tooltip agar tidak dianggap bug.

Berat memakai `NUMERIC`, bukan `bigint`, karena ia kuantitas dan bukan uang. Perkalian berat × harga menghasilkan uang, dan konversinya harus melewati pembulatan eksplisit — bukan dibiarkan implisit.
