# Dokumentasi MyMoney

Spesifikasi lengkap untuk **MyMoney** — Personal Finance & Kekayaan Management web app, mobile-first, deploy di Vercel + Neon PostgreSQL.

**Mulai dari [00-overview.md](00-overview.md).**

## Urutan Baca

**Kalau Anda baru di proyek ini:** 00 → 01 → 02 → 03 → 10.

**Kalau Anda akan mengerjakan sebuah task:** buka `tasks/<n>-<slug>/spec.md`, lalu baca dokumen yang dirujuknya.

**Kalau Anda menulis kode finansial:** 03 dan 05 wajib dibaca sampai selesai sebelum menulis baris pertama.

**Kalau Anda menulis teks yang dilihat pengguna:** 08 otoritatif. Glosariumnya mengikat.

## Daftar Dokumen

| # | Dokumen | Isi |
|---|---------|-----|
| 00 | [Overview](00-overview.md) | Visi, keputusan terkunci, ruang lingkup, definisi selesai |
| 01 | [Product Analysis](01-product-analysis.md) | Analisis pola, feature breakdown, user flow, prioritas |
| 02 | [Information Architecture](02-information-architecture.md) | Sitemap, navigasi, pola URL |
| 03 | [Domain Model](03-domain-model.md) | Entitas, lifecycle, aturan bisnis, formula |
| 04 | [Database Schema](04-database-schema.md) | DDL, index, strategi migrasi |
| 05 | [Financial Integrity](05-financial-integrity.md) | Uang, ledger, invarian, atomisitas |
| 06 | [API Contracts](06-api-contracts.md) | Server Action, route handler, error model |
| 07 | [Design System](07-design-system.md) | Token, tipografi, warna, komponen |
| 08 | [Copywriting](08-copywriting.md) | Glosarium, tone, format angka, pola teks per permukaan |
| 08 | [Screen Specs](09-screen-specs.md) | Tata letak per layar |
| 09 | [UX States](10-ux-states.md) | Empty, loading, error, konfirmasi |
| 10 | [Tech Architecture](11-tech-architecture.md) | Stack, struktur folder, batas modul |
| 11 | [Security & Auth](12-security-and-auth.md) | Auth.js, otorisasi, model ancaman |
| 12 | [Deployment](13-deployment-vercel.md) | Vercel, Neon, cron, CI |
| 13 | [Testing Strategy](14-testing-strategy.md) | Level tes, coverage, gerbang CI |
| 14 | [Roadmap](15-roadmap.md) | Fase, dependensi, indeks task |
| 15 | [Decision Log](16-decision-log.md) | ADR: keputusan, alternatif yang ditolak, konsekuensi |

## Aturan

1. **Dokumen adalah sumber kebenaran.** Kalau kode dan dokumen berbeda, salah satunya salah — perbaiki keduanya sampai sepakat.
2. **Ubah dokumen dulu.** Keputusan berubah? Perbarui dokumennya sebelum mengubah kode.
3. **Keputusan masuk ADR.** Setiap pilihan arsitektural yang tidak jelas dari kodenya masuk ke [16-decision-log.md](16-decision-log.md), lengkap dengan alternatif yang ditolak.
4. **PR merujuk bagian spec.** Sebutkan bagian mana yang diimplementasikan.
