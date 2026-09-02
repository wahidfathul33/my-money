# Todo — 09 Transaction History

## Helper Tanggal

- [ ] `src/lib/date/timezone.ts` — konversi UTC ↔ zona waktu user
- [ ] `toLocalDate(instant, tz)`, `localDayRange(date, tz)`, `localMonthRange(period, tz)`
- [ ] **Unit test batas hari:** 23:59 dan 00:01 WIB masuk hari yang benar
- [ ] Unit test batas bulan: 31 Agt 23:59 WIB ≠ September

## Cursor

- [ ] `encodeCursor({date, id})` / `decodeCursor(s)` — base64
- [ ] Unit test: round-trip, cursor tidak sah ditolak dengan aman

## Query

- [ ] `listTransactions({userId, cursor, limit, filters})` — keyset pada `(transaction_date DESC, id DESC)`
- [ ] `getDayTotals(userId, dateRange, tz)` — dihitung server-side
- [ ] `getPeriodSummary(userId, period, tz)` — income & expense
- [ ] `searchTransactions(userId, q)` — trigram pada `note` + nama kategori
- [ ] Semua mengecualikan `voided_at IS NOT NULL`
- [ ] Semua di-scope `user_id`

## Route Handler

- [ ] `GET /api/transactions` sesuai [docs/06](../../docs/06-api-contracts.md#get-apitransactions)
- [ ] `requireUser()` di baris pertama
- [ ] Zod untuk query param; `limit` maks 100
- [ ] Mengembalikan `{ items, nextCursor, dayTotals }`
- [ ] Rate limit pencarian: 30 / menit

## UI

- [ ] `/transactions` — Server Component untuk render awal
- [ ] `PeriodPicker` — navigasi bulan, di search param
- [ ] Ringkasan periode di header (masuk / keluar)
- [ ] `FilterBar` — chip dompet / kategori / tipe, sheet untuk rentang tanggal
- [ ] Filter di search param via `router.replace` (bukan `push` — agar back tidak menelusuri tiap perubahan filter)
- [ ] `TransactionDayGroup` — header tanggal + subtotal + item
- [ ] `TransactionItem` — ikon kategori, nama, catatan, dompet, waktu, nominal
- [ ] Transfer: ikon `⇄`, "BCA → GoPay", netral, tanpa tanda
- [ ] `TransactionList` — Client Component, SWR infinite, batch 30
- [ ] Spinner di bawah daftar saat memuat halaman berikutnya
- [ ] Sheet pencarian di header, debounce 300 ms, min 2 karakter
- [ ] Sheet detail: seluruh field + Edit / Hapus
- [ ] Geser kiri → hapus + undo
- [ ] Skeleton 5 baris saat muat awal

## Empty State

- [ ] Belum pernah ada transaksi → CTA "Catat Transaksi"
- [ ] Filter kosong → CTA "Reset Filter"
- [ ] Periode kosong tapi ada di bulan lain → tautan ke periode terakhir yang ada

## Test

- [ ] Unit: encode/decode cursor
- [ ] Unit: batas hari & bulan zona waktu
- [ ] Integration: pengelompokan memakai zona waktu user, bukan UTC
- [ ] Integration: subtotal harian mengecualikan transfer & void
- [ ] Integration: setiap filter menyaring dengan benar
- [ ] Integration: kombinasi filter
- [ ] Integration: pencarian menemukan berdasarkan catatan & nama kategori
- [ ] **Integration: sisipkan transaksi baru di tengah pagination → tidak ada item terlewat/ganda**
- [ ] **Integration: isolasi lintas-user**
- [ ] E2E: filter → URL berubah → reload → filter bertahan
- [ ] E2E: infinite scroll memuat batch berikutnya
- [ ] E2E: geser untuk hapus + undo

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Tanpa horizontal overflow di 360px
- [ ] **Checkpoint: pakai aplikasi ini sendiri selama satu hari penuh.** Catat friksinya. Perbaiki sebelum lanjut ke task 10.
