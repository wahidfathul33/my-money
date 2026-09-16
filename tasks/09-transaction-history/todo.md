# Todo — 09 Transaction History

## Helper Tanggal

- [x] `src/lib/date/timezone.ts` — konversi UTC ↔ zona waktu user
- [x] `toLocalDate(instant, tz)`, `localDayRange(date, tz)`, `localMonthRange(period, tz)`
- [x] **Unit test batas hari:** 23:59 dan 00:01 WIB masuk hari yang benar
- [x] Unit test batas bulan: 31 Agt 23:59 WIB ≠ September

## Cursor

- [x] `encodeCursor({date, id})` / `decodeCursor(s)` — base64
- [x] Unit test: round-trip, cursor tidak sah ditolak dengan aman

## Query

- [x] `listTransactions({userId, cursor, limit, filters})` — keyset pada `(transaction_date DESC, id DESC)`
- [x] `getDayTotals(userId, dateRange, tz)` — dihitung server-side
- [x] `getPeriodSummary(userId, period, tz)` — income & expense
- [x] `searchTransactions(userId, q)` — trigram pada `note` + nama kategori
- [x] Semua mengecualikan `voided_at IS NOT NULL`
- [x] Semua di-scope `user_id`

## Route Handler

- [x] `GET /api/transactions` sesuai [docs/06](../../docs/06-api-contracts.md#get-apitransactions)
- [x] `requireUser()` di baris pertama
- [x] Zod untuk query param; `limit` maks 100
- [x] Mengembalikan `{ items, nextCursor, dayTotals }`
- [x] Rate limit pencarian: 30 / menit

## UI

- [x] `/transactions` — Server Component untuk render awal
- [x] `PeriodPicker` — navigasi bulan, di search param
- [x] Ringkasan periode di header (masuk / keluar)
- [x] `FilterBar` — chip dompet / kategori / tipe, sheet untuk rentang tanggal
- [x] Filter di search param via `router.replace` (bukan `push` — agar back tidak menelusuri tiap perubahan filter)
- [x] `TransactionDayGroup` — header tanggal + subtotal + item
- [x] `TransactionItem` — ikon kategori, nama, catatan, dompet, waktu, nominal
- [x] Transfer: ikon `⇄`, "BCA → GoPay", netral, tanpa tanda
- [x] `TransactionList` — Client Component, SWR infinite, batch 30
- [x] Spinner di bawah daftar saat memuat halaman berikutnya
- [x] Sheet pencarian di header, debounce 300 ms, min 2 karakter
- [x] Sheet detail: seluruh field + Edit / Hapus
- [x] Geser kiri → hapus + undo
- [x] Skeleton 5 baris saat muat awal

## Empty State

- [x] Belum pernah ada transaksi → CTA "Catat Transaksi"
- [x] Filter kosong → CTA "Reset Filter"
- [x] Periode kosong tapi ada di bulan lain → tautan ke periode terakhir yang ada

## Test

- [x] Unit: encode/decode cursor
- [x] Unit: batas hari & bulan zona waktu
- [x] Integration: pengelompokan memakai zona waktu user, bukan UTC
- [x] Integration: subtotal harian mengecualikan transfer & void
- [x] Integration: setiap filter menyaring dengan benar
- [x] Integration: kombinasi filter
- [x] Integration: pencarian menemukan berdasarkan catatan & nama kategori
- [x] **Integration: sisipkan transaksi baru di tengah pagination → tidak ada item terlewat/ganda**
- [x] **Integration: isolasi lintas-user**
- [x] E2E: filter → URL berubah → reload → filter bertahan
- [x] E2E: infinite scroll memuat batch berikutnya
- [x] E2E: geser untuk hapus + undo

## Verifikasi Akhir

- [x] `npm run verify` hijau
- [x] Tanpa horizontal overflow di 360px
- [x] **Checkpoint: pakai aplikasi ini sendiri selama satu hari penuh.** Catat friksinya. Perbaiki sebelum lanjut ke task 10.
