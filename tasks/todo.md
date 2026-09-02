# Task Index — MyMoney

Daftar induk seluruh task. Rincian tiap task ada di `tasks/<n>-<slug>/spec.md` dan `todo.md`.

Rencana: [plan.md](plan.md) · Spesifikasi: [docs/](../docs/README.md)

---

## F0 — Fondasi

- [ ] **00 — [project-bootstrap](00-project-bootstrap/)**
  Next.js + TS + Tailwind v4 + ESLint/Prettier + Vitest + Playwright, ter-deploy ke Vercel.
  *Verifikasi:* `npm run verify` hijau; halaman placeholder tampil di preview URL.

- [ ] **01 — [design-system-foundation](01-design-system-foundation/)**
  Token OKLCH, tipografi, spasi, primitif UI (Button, Input, Sheet, Card, …), `MoneyText`.
  *Verifikasi:* halaman kitchen-sink; test kontras dari token hijau; nol pelanggaran axe.

- [ ] **02 — [app-shell-navigation](02-app-shell-navigation/)**
  Bottom nav 5 slot, sidebar desktop, safe area, error & loading boundary, Lighthouse CI.
  *Verifikasi:* tanpa horizontal overflow di 360/375/390/430/768/1024/1440; anggaran Lighthouse terpenuhi.

- [ ] **03 — [database-foundation](03-database-foundation/)**
  Neon + Drizzle, pemisahan `db/read` & `db/write`, tipe `Money`, `postEntries`, migrasi di CI.
  *Verifikasi:* test rollback membuktikan atomisitas; aturan lint menolak `number` untuk uang.

- [ ] **04 — [authentication](04-authentication/)**
  Auth.js v5, Google OAuth + magic link, database session, middleware, `requireUser`, seed per-user.
  *Verifikasi:* login di preview; sesi bertahan; test user B tidak dapat membaca data user A.

> **Checkpoint:** login berfungsi di preview, migrasi berjalan di CI.

---

## F1 — Ledger Inti

- [ ] **05 — [dompet](05-wallets/)**
  CRUD dompet, saldo awal sebagai `opening_balance`, arsip, kartu kredit sebagai liabilitas, penyesuaian saldo.
  *Verifikasi:* saldo = Σ ledger entry; `CHECK` menolak kartu kredit bersaldo positif.

- [ ] **06 — [categories](06-categories/)**
  Katalog kanonis ber-`system_key` + seeder, CRUD kategori kustom, sub-kategori 1 tingkat.
  *Verifikasi:* seeder idempoten; mengganti nama kategori bawaan tidak mengubah `system_key`.

- [ ] **07 — [transactions-core](07-transactions-core/)**
  Catat income/expense, sheet + keypad, ledger atomik, edit, void, idempotensi.
  *Verifikasi:* saldo berubah benar; rekonsiliasi 0 selisih; kunci idempotensi berulang tidak menggandakan.

- [ ] **08 — [transfers-self](08-transfers-self/)**
  Transfer antar dompet sendiri: satu transaksi, dua ledger entry, invarian Σ = 0.
  *Verifikasi:* net worth tidak berubah; transfer tidak masuk agregasi income/expense.

- [ ] **09 — [transaction-history](09-transaction-history/)**
  Riwayat berkelompok per hari, subtotal harian, filter di URL, pencarian, pagination cursor.
  *Verifikasi:* tidak ada item terlewat/ganda saat data baru masuk selama scroll.

> **Checkpoint utama:** aplikasi layak dipakai sendiri setiap hari. Kalau belum, perbaiki friksi input sebelum lanjut.

---

## F2 — Household

- [ ] **10 — [household-core](10-household-core/)**
  Tabel household, buat household, `requireHouseholdMember`, layout & guard `/household/[id]`, context switcher.
  *Verifikasi:* non-anggota mendapat 404 (bukan 403); pengguna tanpa household tidak melihat elemen household apa pun.

- [ ] **11 — [household-membership](11-household-membership/)**
  Undangan (token ter-hash, sekali pakai, kedaluwarsa), dua peran, keluar/keluarkan, alih kepemilikan, email.
  *Verifikasi:* token tidak dapat dipakai dua kali; tepat satu owner aktif; `member` ditolak pada aksi khusus `owner`.

- [ ] **12 — [sharing-and-privacy](12-sharing-and-privacy/)**
  Dua mekanisme berbagi: tag transaksi + `share_wealth` per anggota. `lib/visibility/**`, penandaan massal.
  *Verifikasi:* bergabung tidak membagikan apa pun; mematikan berbagi seketika; coverage `lib/visibility` 100%.

- [ ] **13 — [transfers-member](13-transfers-member/)**
  Transfer ke anggota: satu pencatatan, kedua sisi sekaligus, penerima ditinjau lewat Aktivitas.
  *Verifikasi:* kedua saldo benar & atomik; `CHECK tx_created_by_rule` menahan bentuk lain.

> **Checkpoint utama:** invarian I11 & I19 hijau — satu-satunya operasi lintas-ledger tidak bocor ke bentuk lain.

---

## F3 — Perencanaan

- [ ] **14 — [budgets](14-budgets/)**
  Budget pribadi (per `category_id`) & household (per `system_key`, **eksak**), status, perulangan, rincian per anggota.
  *Verifikasi:* transfer & kontribusi savings tidak pernah terhitung; cocok lintas anggota meski namanya diganti.

- [ ] **15 — [savings-goals](15-savings-goals/)**
  Goal pribadi & bersama, kontribusi dari dompet, penarikan, kontribusi per anggota.
  *Verifikasi:* setiap kontribusi berpasangan ledger entry; net worth tidak berubah karenanya.

---

## F4 — Kekayaan

- [ ] **16 — [assets-gold](16-assets-gold/)**
  Lot emas, cost basis rata-rata tertimbang, harga jual vs buyback, beli/jual, provider harga.
  *Verifikasi:* valuasi memakai harga buyback; `CHECK` menolak buyback > harga jual.

- [ ] **17 — [assets-deposits](17-assets-deposits/)**
  Deposito, bunga prorata + PPh 20%, ARO, pencairan, cron jatuh tempo.
  *Verifikasi:* bunga akrual tidak masuk total aset; perhitungan cocok dengan nilai yang dihitung tangan.

- [ ] **18 — [debts-receivables](18-debts-receivables/)**
  Hutang & piutang, `affects_wallet`, cicilan, jatuh tempo, `counterparty_user_id`.
  *Verifikasi:* pembayaran tidak mengubah net worth; kelebihan bayar ditolak dengan `FOR UPDATE`.

---

## F5 — Insight

- [ ] **19 — [net-worth](19-net-worth/)**
  Net worth pribadi & kekayaan keluarga **per anggota**, `CoverageNote`, snapshot harian keduanya, tren.
  *Verifikasi:* rincian menjumlah tepat ke total; seluruh invarian anti-double-count hijau.

- [ ] **20 — [dashboard](20-dashboard/)**
  Dashboard pribadi (hero net worth, arus kas, budget bermasalah, jatuh tempo) & ringkasan keluarga.
  *Verifikasi:* LCP < 2,5 s; bagian kosong tersembunyi; household baru menampilkan daftar langkah.

- [ ] **21 — [reports](21-reports/)**
  Laporan pribadi & household, chart tanpa horizontal scroll, tabel data pendamping, ekspor CSV.
  *Verifikasi:* tidak ada overflow di 360px; Recharts hanya dimuat di rute laporan.

---

## F6 — Rilis

- [ ] **22 — [settings-sharing-pwa](22-settings-sharing-pwa/)**
  Settings, `/settings/sharing`, ekspor & hapus akun, manifest + service worker, banner offline.
  *Verifikasi:* installable; "berhenti berbagi semuanya" mematikan seluruh `share_wealth`; hapus akun diblokir bila masih owner.

- [ ] **23 — [hardening-and-launch](23-hardening-and-launch/)**
  Audit keamanan, a11y, performa, observability, runbook, uji pemulihan backup, go/no-go.
  *Verifikasi:* seluruh DoD di [docs/00](../docs/00-overview.md#7-definisi-selesai-definition-of-done-untuk-v10) terpenuhi.

---

## Ringkasan

| Fase | Task | Selesai |
|------|------|:-------:|
| F0 Fondasi | 00–04 | 0 / 5 |
| F1 Ledger inti | 05–09 | 0 / 5 |
| F2 Household | 10–13 | 0 / 4 |
| F3 Perencanaan | 14–15 | 0 / 2 |
| F4 Kekayaan | 16–18 | 0 / 3 |
| F5 Insight | 19–21 | 0 / 3 |
| F6 Rilis | 22–23 | 0 / 2 |
| **Total** | | **0 / 24** |
