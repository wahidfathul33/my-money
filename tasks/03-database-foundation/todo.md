# Todo — 03 Database Foundation

## Neon

- [ ] Buat proyek Neon, region terdekat dengan `sin1`
- [ ] Ambil connection string pooled **dan** unpooled
- [ ] Set `DATABASE_URL` + `DATABASE_URL_UNPOOLED` di Vercel (3 environment) dan `.env.local`
- [ ] Aktifkan Neon branching untuk PR
- [ ] Set retensi PITR ≥ 7 hari di produksi

## Koneksi

- [ ] `src/lib/db/read.ts` — `drizzle-orm/neon-http`, hanya SELECT
- [ ] `src/lib/db/write.ts` — `drizzle-orm/neon-serverless` dengan `Pool`
- [ ] Komentar di kedua berkas menjelaskan kenapa terpisah
- [ ] `drizzle.config.ts` — memakai `DATABASE_URL_UNPOOLED`

## Skema Drizzle

- [ ] `schema/enums.ts` — seluruh enum dari [docs/04 §2](../../docs/04-database-schema.md#2-enum)
- [ ] `schema/users.ts` — users + tabel Auth.js
- [ ] `schema/households.ts` — households, household_members (+ `share_wealth`), household_invitations
- [ ] `schema/wallets.ts` — dompet
- [ ] `schema/categories.ts` — categories + `name_norm` generated + `system_key`
- [ ] `schema/transactions.ts` — transactions (+ `counterparty_user_id`, `linked_transaction_id`), ledger_entries
- [ ] `schema/savings.ts` — savings_goals, savings_contributions (`ledger_entry_id NOT NULL`)
- [ ] `schema/assets.ts` — assets, gold_lots, gold_prices, gold_sales, deposits
- [ ] `schema/obligations.ts` — debts, debt_payments, receivables, receivable_payments
- [ ] `schema/budgets.ts` — budgets
- [ ] `schema/snapshots.ts` — net_worth_snapshots, household_net_worth_snapshots
- [ ] `schema/index.ts` — barrel + relations

## Constraint & Trigger

- [ ] Seluruh `CHECK` dari [docs/04](../../docs/04-database-schema.md) — terutama `tx_counterparty_rule`, `tx_link_requires_counterparty`, `wallets_cc_non_positive`, `gold_buyback_lte_sell`, `budget_scope_exclusive`, `categories_system_no_parent`
- [ ] Seluruh unique index, termasuk yang parsial
- [ ] Trigger `enforce_category_depth`
- [ ] `CREATE EXTENSION pg_trgm`
- [ ] Verifikasi tiap constraint: coba simpan data yang melanggar → ditolak

## Modul Uang

- [ ] Lengkapi `money.ts`: `multiplyRatio`, `serializeMoney`, `deserializeMoney`
- [ ] Unit test `multiplyRatio`: pembulatan half-up positif **dan** negatif
- [ ] Unit test nilai ekstrem mendekati batas `BIGINT`

## Ledger

- [ ] `src/lib/finance/ledger.ts` — `postEntries`
- [ ] Agregasi delta per dompet → satu `UPDATE` per dompet
- [ ] `UPDATE` memakai `balance = balance + delta` di SQL
- [ ] Integration test: saldo = Σ entry setelah beberapa entry
- [ ] Integration test: dua entry ke dompet yang sama → satu UPDATE

## Test Atomisitas

- [ ] Test rollback: gagal di tengah transaction → nol perubahan tersisa
- [ ] Test driver: buktikan `dbWrite` transaksional (rollback benar-benar bekerja)
- [ ] Test: `dbRead` tidak dapat dipakai menulis (lint + runtime)

## Aturan Lint

- [ ] `no-restricted-imports`: `dbWrite` tidak boleh dari Server Component
- [ ] Aturan kustom: tidak ada `insert`/`update`/`delete` pada `dbRead`
- [ ] Aturan kustom: `number` dilarang untuk properti bernama pola uang
- [ ] Verifikasi: tulis pelanggaran → lint gagal → cabut kembali

## Migrasi & CI

- [ ] Skrip `db:generate`, `db:migrate`, `db:studio`
- [ ] `build` = `db:migrate && next build`
- [ ] Migrasi awal ter-commit
- [ ] CI menjalankan migrasi terhadap Neon branch PR
- [ ] Verifikasi: migrasi gagal → build gagal → tidak ada deploy

## Rekonsiliasi

- [ ] `src/lib/db/reconcile.ts` — query invarian dari [docs/05 §5](../../docs/05-financial-integrity.md#5-invarian)
- [ ] Mengembalikan daftar selisih, tidak memperbaiki otomatis
- [ ] Test: mengembalikan 0 baris pada data uji yang sehat

## Verifikasi Akhir

- [ ] `npm run db:migrate` berhasil pada database bersih
- [ ] `npm run test` hijau, termasuk test rollback
- [ ] `npm run verify` hijau
- [ ] CI hijau di PR dengan Neon branch
