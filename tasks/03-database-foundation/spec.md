# Task 03 — Database Foundation

**Fase:** F0 · **Bergantung pada:** 00 · **Dokumen:** [04-database-schema](../../docs/04-database-schema.md), [05-financial-integrity](../../docs/05-financial-integrity.md)

## Objektif

Membangun lapisan database dan **menegakkan dua aturan yang menjadi dasar kebenaran seluruh aplikasi**:

1. Uang selalu `bigint` dalam satuan minor — tidak pernah `number`.
2. Penulisan finansial selalu atomik — lewat driver yang benar-benar mendukung transaksi.

Kedua aturan ini mudah dilanggar tanpa sadar, dan pelanggarannya tidak menimbulkan error — hanya angka yang perlahan salah. Karena itu keduanya ditegakkan lewat struktur modul, aturan lint, dan test, bukan lewat kesepakatan.

## Ruang Lingkup

**Termasuk:** koneksi Neon (read & write terpisah), skema Drizzle untuk seluruh tabel di [04](../../docs/04-database-schema.md), modul `money.ts` lengkap, `postEntries`, migrasi di CI, Neon branching per PR, job rekonsiliasi (kerangka).

**Tidak termasuk:** service per modul (task masing-masing) · UI apa pun · auth (task 04).

## Peringatan Driver — baca sebelum menulis kode

Neon punya dua driver, dan memilih yang salah **menghancurkan atomisitas tanpa memunculkan error**.

| Driver | Import | Transaksi multi-statement |
|--------|--------|---------------------------|
| `neon-http` | `drizzle-orm/neon-http` | ❌ Tidak didukung |
| `neon-serverless` (Pool/WebSocket) | `drizzle-orm/neon-serverless` | ✅ Didukung |

Driver HTTP mengirim tiap statement sebagai request terpisah. `db.transaction(...)` di atasnya tidak memberi jaminan yang Anda kira, dan kegagalan di tengah meninggalkan saldo tidak konsisten — tanpa error apa pun.

Karena itu koneksi dipisah menjadi dua modul, dan pemisahannya ditegakkan lint. Detail: [05 §1](../../docs/05-financial-integrity.md#1-peringatan-driver-neon-baca-sebelum-menulis-kode-db).

## Skema

Seluruh tabel dari [04-database-schema](../../docs/04-database-schema.md) dibuat di task ini, **termasuk tabel household**. Perhatikan yang **tidak** ada: `transfer_groups` dan `wallet_access` — keduanya sengaja dihapus, lihat [ADR-023](../../docs/16-decision-log.md#adr-023--transfer-antar-anggota-dicatat-masing-masing) dan [ADR-024](../../docs/16-decision-log.md#adr-024--tidak-ada-acl-per-objek). Belum ada data produksi, sehingga tidak ada alasan memecahnya menjadi beberapa migrasi — dan skema lengkap sejak awal membuat setiap task berikutnya tidak perlu menambah kolom ke tabel yang sudah dipakai.

Yang **tidak** dibuat di sini: service, action, dan UI. Task ini hanya membangun fondasinya.

## Modul Uang

`src/lib/finance/money.ts` sesuai [05 §2](../../docs/05-financial-integrity.md#2-representasi-uang): `Money`, `MINOR_UNITS`, `fromRupiah`, `formatIDR`, `multiplyRatio`, serta `serializeMoney`/`deserializeMoney` untuk batas Server Action.

`multiplyRatio` memakai pembulatan *half-up* eksplisit. Ia akan dipakai untuk bunga deposito, pembagian budget, dan cost basis emas — tempat-tempat di mana pembulatan implisit akan menghasilkan selisih yang menumpuk.

## `postEntries`

Satu-satunya fungsi yang boleh menyentuh `wallets.balance`. Implementasi di [05 §3](../../docs/05-financial-integrity.md#3-aturan-emas-semua-perubahan-saldo-lewat-ledger).

Poin yang mudah salah: `UPDATE` memakai `balance = balance + delta` **di dalam SQL**, bukan membaca saldo ke aplikasi lalu menulis ulang. Pola baca-modifikasi-tulis kehilangan update saat ada dua permintaan bersamaan.

## Kriteria Penerimaan

- [ ] `db/read.ts` (neon-http) dan `db/write.ts` (neon-serverless) terpisah.
- [ ] Aturan lint melarang `insert`/`update`/`delete` lewat `dbRead`, dan melarang import `dbWrite` dari Server Component.
- [ ] Aturan lint melarang `number` pada parameter/properti bernama pola uang (`amount`, `balance`, `price`, `principal`).
- [ ] Seluruh tabel, enum, index, constraint, dan trigger dari [04](../../docs/04-database-schema.md) ada di skema Drizzle.
- [ ] `drizzle-kit generate` menghasilkan migrasi; `drizzle-kit migrate` menjalankannya di CI.
- [ ] Migrasi berjalan di build step Vercel sebelum `next build`, memakai `DATABASE_URL_UNPOOLED`.
- [ ] Neon branch dibuat otomatis per PR dan migrasi diuji di sana.
- [ ] `money.ts` punya unit test: konversi, format, pembulatan half-up (termasuk nilai negatif), nilai ekstrem.
- [ ] `postEntries` punya integration test: multi-entry satu dompet menghasilkan satu `UPDATE`; saldo cocok dengan Σ entry.
- [ ] **Test rollback:** kegagalan di tengah transaction tidak meninggalkan perubahan parsial.
- [ ] **Test driver:** membuktikan `dbWrite` benar-benar transaksional (rollback berfungsi).
- [ ] Query invarian dari [05 §5](../../docs/05-financial-integrity.md#5-invarian) dapat dijalankan dan mengembalikan 0 baris pada data uji.

## Verifikasi

```bash
npm run db:generate && npm run db:migrate
npm run test              # unit money + integration ledger + rollback
npm run verify
```

## Berkas yang Disentuh

Baru: `src/lib/db/{read,write,index}.ts` · `src/lib/db/schema/*.ts` · `src/lib/finance/{money,ledger}.ts` · `drizzle.config.ts` · `drizzle/*` · `src/lib/db/reconcile.ts` · test terkait.
Diubah: `package.json` (skrip db) · `eslint.config.mjs` · `.github/workflows/ci.yml` · `src/lib/finance/money.ts` (dari task 01).

## Batasan

**Selalu:** penulisan multi-tabel di dalam satu `dbWrite.transaction()` · saldo diperbarui dengan bentuk relatif SQL · `bigint` untuk uang.
**Tanya dulu:** menyimpang dari DDL di [04](../../docs/04-database-schema.md) · menambah tabel yang tidak ada di sana.
**Jangan:** `drizzle-kit push` ke database mana pun selain lokal · `float`/`number` untuk uang · menyentuh `wallets.balance` di luar `postEntries` · `sql.raw` dengan input pengguna.

## Catatan

Job rekonsiliasi dibuat sebagai fungsi yang dapat dipanggil, tetapi endpoint cron-nya menyusul di task 23. Menulis fungsinya sekarang berarti setiap task finansial berikutnya dapat memanggilnya di test untuk membuktikan tidak meninggalkan selisih.

UUID memakai v7 (`uuidv7()` di aplikasi), bukan `gen_random_uuid()`. v7 terurut waktu sehingga tidak memecah locality index B-tree.
