# Todo — 03 Database Foundation

## Neon

- [x] Buat proyek Neon, region terdekat dengan `sin1`
- [x] Ambil connection string pooled **dan** unpooled
- [ ] Set `DATABASE_URL` + `DATABASE_URL_UNPOOLED` di Vercel (3 environment) — `.env` lokal sudah ada
- [x] Aktifkan Neon branching untuk PR
- [ ] Set retensi PITR ≥ 7 hari di produksi

## Koneksi

- [x] `src/lib/db/read.ts` — `drizzle-orm/neon-http`, hanya SELECT
- [x] `src/lib/db/write.ts` — `drizzle-orm/neon-serverless` dengan `Pool`
- [x] Komentar di kedua berkas menjelaskan kenapa terpisah
- [x] `drizzle.config.ts` — memakai `DATABASE_URL_UNPOOLED`

## Skema Drizzle

- [x] `schema/enums.ts` — seluruh enum dari [docs/04 §2](../../docs/04-database-schema.md#2-enum)
- [x] `schema/users.ts` — users + tabel Auth.js
- [x] `schema/households.ts` — households, household_members (+ `share_wealth`), household_invitations
- [x] `schema/wallets.ts` — dompet
- [x] `schema/categories.ts` — categories + `name_norm` generated + `system_key`
- [x] `schema/transactions.ts` — transactions (+ `counterparty_user_id`, `linked_transaction_id`), ledger_entries
- [x] `schema/savings.ts` — savings_goals, savings_contributions (`ledger_entry_id NOT NULL`)
- [x] `schema/assets.ts` — assets, gold_lots, gold_prices, gold_sales, deposits
- [x] `schema/obligations.ts` — debts, debt_payments, receivables, receivable_payments
- [x] `schema/budgets.ts` — budgets
- [x] `schema/snapshots.ts` — net_worth_snapshots, household_net_worth_snapshots
- [x] `schema/index.ts` — barrel + relations

## Constraint & Trigger

- [x] Seluruh `CHECK` dari [docs/04](../../docs/04-database-schema.md) — terutama `tx_counterparty_rule`, `tx_link_requires_counterparty`, `wallets_cc_non_positive`, `gold_buyback_lte_sell`, `budget_scope_exclusive`, `categories_system_no_parent`
- [x] Seluruh unique index, termasuk yang parsial
- [x] Trigger `enforce_category_depth`
- [x] `CREATE EXTENSION pg_trgm`
- [x] Verifikasi tiap constraint: coba simpan data yang melanggar → ditolak

## Modul Uang

- [x] Lengkapi `money.ts`: `multiplyRatio`, `serializeMoney`, `deserializeMoney`
- [x] Unit test `multiplyRatio`: pembulatan half-up positif **dan** negatif
- [x] Unit test nilai ekstrem mendekati batas `BIGINT`

## Ledger

- [x] `src/lib/finance/ledger.ts` — `postEntries`
- [x] Agregasi delta per dompet → satu `UPDATE` per dompet
- [x] `UPDATE` memakai `balance = balance + delta` di SQL
- [x] Integration test: saldo = Σ entry setelah beberapa entry
- [x] Integration test: dua entry ke dompet yang sama → satu UPDATE

## Test Atomisitas

- [x] Test rollback: gagal di tengah transaction → nol perubahan tersisa
- [x] Test driver: buktikan `dbWrite` transaksional (rollback benar-benar bekerja)
- [x] Test: `dbRead` tidak dapat dipakai menulis (lint + runtime)

## Aturan Lint

- [x] `no-restricted-imports`: `dbWrite` tidak boleh dari Server Component
- [x] Aturan kustom: tidak ada `insert`/`update`/`delete` pada `dbRead`
- [x] Aturan kustom: `number` dilarang untuk properti bernama pola uang
- [x] Verifikasi: tulis pelanggaran → lint gagal → cabut kembali

## Migrasi & CI

- [x] Skrip `db:generate`, `db:migrate`, `db:studio`
- [x] `build` = `db:migrate && next build`
- [x] Migrasi awal ter-commit
- [x] CI menjalankan migrasi terhadap Neon branch PR
- [ ] Verifikasi: migrasi gagal → build gagal → tidak ada deploy

## Rekonsiliasi

- [x] `src/lib/db/reconcile.ts` — query invarian dari [docs/05 §5](../../docs/05-financial-integrity.md#5-invarian)
- [x] Mengembalikan daftar selisih, tidak memperbaiki otomatis
- [x] Test: mengembalikan 0 baris pada data uji yang sehat

## Verifikasi Akhir

- [x] `npm run db:migrate` berhasil pada database bersih
- [x] `npm run test` hijau, termasuk test rollback
- [x] `npm run verify` hijau
- [ ] CI hijau di PR dengan Neon branch
