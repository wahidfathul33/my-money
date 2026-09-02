# Task 09 — Transaction History

**Fase:** F1 · **Bergantung pada:** 07 · **Dokumen:** [09-screen §3](../../docs/09-screen-specs.md#3-transactions--transactions), [06-api §6](../../docs/06-api-contracts.md#6-route-handler-untuk-pembacaan)

## Objektif

Riwayat transaksi yang dapat ditelusuri, difilter, dan dicari — melengkapi lingkaran pencatatan.

**Setelah task ini, aplikasi harus layak dipakai sendiri setiap hari.** Ini checkpoint terpenting di paruh pertama roadmap. Kalau belum terasa demikian, perbaiki friksinya sebelum melanjutkan ke household.

## Ruang Lingkup

**Termasuk:** daftar berkelompok per hari, subtotal harian, pemilih periode, filter (wallet/kategori/tipe/rentang), pencarian, infinite scroll dengan cursor, sheet detail, geser untuk hapus.

**Tidak termasuk:** pengeluaran keluarga (task 12) · laporan & chart (task 21).

## Pengelompokan

Per hari **dalam zona waktu user**, terbaru dulu. Header hari menampilkan tanggal + subtotal (income − expense; transfer dikecualikan).

Subtotal harian menjawab pertanyaan yang benar-benar diajukan orang — *"kemarin saya habis berapa?"* — tanpa mereka perlu menjumlahkan sendiri.

## Pagination

**Cursor keyset, bukan offset.** Cursor adalah base64 dari `{iso_date}|{id}`, cocok persis dengan `tx_user_date_idx` pada `(transaction_date DESC, id DESC)`.

Dengan offset, transaksi baru yang masuk saat pengguna sedang scroll akan menggeser halaman dan menyebabkan item terlewat atau muncul dua kali. Untuk aplikasi keuangan, item yang "hilang" dari riwayat adalah bug yang segera dilaporkan.

## Filter di URL

Semua filter berada di search param sehingga dapat dibagikan, di-bookmark, dan bertahan saat back. Lihat [02-IA §6](../../docs/02-information-architecture.md#6-pola-url--state).

## Kriteria Penerimaan

- [ ] Dikelompokkan per hari dalam zona waktu user, terbaru dulu, dengan subtotal harian.
- [ ] Subtotal mengecualikan transfer dan transaksi ter-void.
- [ ] Pemilih periode (bulan) dengan ringkasan masuk/keluar di header.
- [ ] Filter: dompet, kategori, tipe, rentang tanggal — semuanya di search param.
- [ ] Filter bertahan saat back dan dapat dibagikan lewat URL.
- [ ] Pencarian catatan (trigram), debounce 300 ms, minimal 2 karakter.
- [ ] Infinite scroll batch 30, cursor keyset.
- [ ] **Tidak ada item terlewat atau ganda** saat transaksi baru masuk selama scroll — diverifikasi test.
- [ ] Transfer tampil netral, format "BCA → GoPay", tanpa tanda.
- [ ] Tap item → sheet detail dengan aksi Edit / Hapus.
- [ ] Geser kiri → hapus cepat dengan undo.
- [ ] Empty state membedakan "belum pernah ada transaksi" dari "filter tidak menemukan apa pun".
- [ ] `dayTotals` dihitung server-side, bukan di klien.
- [ ] Tanpa horizontal overflow di 360px.
- [ ] **Test isolasi:** riwayat hanya memuat transaksi milik user.

## Verifikasi

```bash
npm run test        # unit cursor + integration filter & pagination
npm run test:e2e    # filter → URL berubah → back → filter bertahan
npm run dev         # periksa manual scroll panjang di 360px
```

## Berkas yang Disentuh

Baru: `src/app/api/transactions/route.ts` · `src/features/transactions/components/{transaction-list,day-group,filter-bar,detail-sheet,period-picker}.tsx` · `src/lib/date/*` · test.
Diubah: `src/app/(app)/transactions/page.tsx` · `src/features/transactions/queries.ts`.

## Batasan

**Selalu:** cursor keyset · pengelompokan tanggal memakai zona waktu user · filter di URL · agregasi di server.
**Tanya dulu:** menambah dimensi filter baru.
**Jangan:** pagination offset · menjumlahkan subtotal di klien · menaruh state sheet detail di URL · memuat seluruh transaksi lalu memfilter di klien.

## Catatan

**Zona waktu adalah sumber bug paling halus di task ini.** Transaksi pukul 07:00 WIB tersimpan sebagai 00:00 UTC. Mengelompokkan dalam UTC akan menempatkannya di hari yang berbeda dari yang dilihat pengguna. Helper tanggal terpusat dibuat di sini dan dipakai setiap agregasi berbasis tanggal sesudahnya — termasuk budget dan laporan household.

Tulis test batas hari (23:59 dan 00:01 WIB) sebelum implementasi. Ia akan gagal kalau helper-nya salah, dan tanpa test itu kesalahannya baru ketahuan berminggu-minggu kemudian.
