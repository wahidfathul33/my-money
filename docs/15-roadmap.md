# 14 — Roadmap

## 1. Fase

| Fase | Task | Hasil |
|------|------|-------|
| **F0 — Fondasi** | 00–04 | Aplikasi ter-deploy, terautentikasi, dengan database. Belum ada fitur finansial. |
| **F1 — Ledger inti** | 05–09 | Bisa mencatat dan meninjau transaksi. Sudah berguna sehari-hari. |
| **F2 — Household** | 10–13 | Beberapa orang dapat berbagi konteks keuangan tanpa berbagi rekening. |
| **F3 — Perencanaan** | 14–15 | Budget dan savings goal, pribadi maupun bersama. |
| **F4 — Kekayaan** | 16–18 | Emas, deposito, hutang & piutang. |
| **F5 — Insight** | 19–21 | Net worth pribadi & keluarga, dashboard, laporan. |
| **F6 — Rilis** | 22–23 | Settings, berbagi, PWA, pengerasan, peluncuran. |

## 2. Graf Dependensi

```
00 bootstrap
 ├─► 01 design-system ──┐
 ├─► 03 database ───────┼─► 04 auth ─┐
 └───────────────────────┘            │
                                      ▼
        02 app-shell ◄────────────────┤
             │                        │
             ▼                        ▼
        05 dompet ◄──────────── 06 categories
             │                        │
             └──────────┬─────────────┘
                        ▼
                 07 transactions-core
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
       08 transfers-self     09 transaction-history
             │                     │
             └──────────┬──────────┘
                        ▼
             ═══════ HOUSEHOLD ═══════
                        │
              10 household-core
                        │
              11 household-membership
                        │
             ┌──────────┼──────────────┐
             ▼          ▼              ▼
      12 sharing   13 transfers-member │
             │          │              │
             └──────────┴──────┬───────┘
                               │
             ┌─────────────────┼─────────────────┐
             ▼                 ▼                 ▼
       14 budgets        15 savings-goals        │
             │                 │                 │
             └────────┬────────┘                 │
                      │                          │
        ┌─────────────┼─────────────┐            │
        ▼             ▼             ▼            │
  16 assets-gold  17 deposits  18 debts          │
        └─────────────┼─────────────┘            │
                      ▼                          │
                19 net-worth ◄───────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
  20 dashboard   21 reports   22 settings-sharing-pwa
        └─────────────┼─────────────┘
                      ▼
              23 hardening-launch
```

**Dapat dikerjakan paralel:**
- 01 (design system) dan 03 (database) tidak saling bergantung.
- 05 (dompet) dan 06 (categories) independen setelah 04.
- 08 dan 09 independen setelah 07.
- 12 (sharing) dan 13 (transfer antar anggota) independen setelah 11.
- 14 dan 15 independen setelah 11.
- 16, 17, 18 saling independen.

**Jalur kritis:** 00 → 03 → 04 → 05 → 07 → 10 → 11 → 19 → 23.

## 3. Kenapa Household di F2, Bukan di Akhir

Household berada tepat setelah ledger inti dan **sebelum** budget, savings, dan aset. Ini bukan urutan yang paling nyaman, tetapi yang paling murah.

Alasannya: household menyentuh hampir setiap modul yang datang sesudahnya.

- Budget punya dua cakupan (pribadi per `category_id`, household per `system_key`) — [03](03-domain-model.md#13-budget)
- Savings goal punya `household_id` dan menampilkan kontribusi per anggota
- Aset, hutang, piutang semuanya punya `exclude_from_household`
- Net worth punya dua bentuk perhitungan, dan yang household ditampilkan per anggota

Membangun modul-modul itu lebih dulu tanpa kesadaran household berarti membangunnya dua kali: sekali sebagai fitur pribadi, sekali lagi saat menambahkan cakupan household. Menempatkan household lebih awal membuat setiap modul sesudahnya lahir dengan kedua cakupan sekaligus.

Biayanya: aplikasi baru terasa "lengkap" lebih lambat. Itu sepadan — 09 sudah menghasilkan aplikasi yang layak dipakai harian, dan sisanya menumpuk di atas fondasi yang tidak perlu dibongkar.

## 4. Indeks Task

Setiap task berada di `tasks/<nomor>-<slug>/` berisi `spec.md` dan `todo.md`.

| # | Task | Fase | Bergantung | Dokumen utama |
|---|------|------|-----------|---------------|
| 00 | [project-bootstrap](../tasks/00-project-bootstrap/spec.md) | F0 | — | [11](11-tech-architecture.md), [13](13-deployment-vercel.md) |
| 01 | [design-system-foundation](../tasks/01-design-system-foundation/spec.md) | F0 | 00 | [07](07-design-system.md) |
| 02 | [app-shell-navigation](../tasks/02-app-shell-navigation/spec.md) | F0 | 01 | [02](02-information-architecture.md) |
| 03 | [database-foundation](../tasks/03-database-foundation/spec.md) | F0 | 00 | [04](04-database-schema.md), [05](05-financial-integrity.md) |
| 04 | [authentication](../tasks/04-authentication/spec.md) | F0 | 03 | [12](12-security-and-auth.md) |
| 05 | [dompet](../tasks/05-wallets/spec.md) | F1 | 02, 04 | [03](03-domain-model.md#6-dompet) |
| 06 | [categories](../tasks/06-categories/spec.md) | F1 | 04 | [03](03-domain-model.md#7-kategori) |
| 07 | [transactions-core](../tasks/07-transactions-core/spec.md) | F1 | 05, 06 | [03](03-domain-model.md#8-transaksi), [05](05-financial-integrity.md) |
| 08 | [transfers-self](../tasks/08-transfers-self/spec.md) | F1 | 07 | [03](03-domain-model.md#9-transfer) |
| 09 | [transaction-history](../tasks/09-transaction-history/spec.md) | F1 | 07 | [06](06-api-contracts.md), [09](09-screen-specs.md) |
| 10 | [household-core](../tasks/10-household-core/spec.md) | F2 | 09 | [03](03-domain-model.md#4-household), [12](12-security-and-auth.md) |
| 11 | [household-membership](../tasks/11-household-membership/spec.md) | F2 | 10 | [03](03-domain-model.md#43-undangan) |
| 12 | [sharing-and-privacy](../tasks/12-sharing-and-privacy/spec.md) | F2 | 11 | [03](03-domain-model.md#5-model-berbagi), [12](12-security-and-auth.md#4-query-visibilitas) |
| 13 | [transfers-member](../tasks/13-transfers-member/spec.md) | F2 | 11 | [03](03-domain-model.md#93-transfer-ke-anggota-household) |
| 14 | [budgets](../tasks/14-budgets/spec.md) | F3 | 11 | [03](03-domain-model.md#13-budget) |
| 15 | [savings-goals](../tasks/15-savings-goals/spec.md) | F3 | 11 | [03](03-domain-model.md#10-savings-goal) |
| 16 | [assets-gold](../tasks/16-assets-gold/spec.md) | F4 | 12 | [03](03-domain-model.md#112-emas) |
| 17 | [assets-deposits](../tasks/17-assets-deposits/spec.md) | F4 | 12 | [03](03-domain-model.md#113-deposito) |
| 18 | [debts-receivables](../tasks/18-debts-receivables/spec.md) | F4 | 12 | [03](03-domain-model.md#12-hutang--piutang) |
| 19 | [net-worth](../tasks/19-net-worth/spec.md) | F5 | 15, 16, 17, 18 | [03](03-domain-model.md#14-net-worth) |
| 20 | [dashboard](../tasks/20-dashboard/spec.md) | F5 | 19 | [09](09-screen-specs.md#1-home--dashboard) |
| 21 | [reports](../tasks/21-reports/spec.md) | F5 | 09, 19 | [09](09-screen-specs.md#9-reports--reports) |
| 22 | [settings-sharing-pwa](../tasks/22-settings-sharing-pwa/spec.md) | F6 | 19 | [09](09-screen-specs.md#17-apa-yang-saya-bagikan--settingssharing), [13](13-deployment-vercel.md) |
| 23 | [hardening-and-launch](../tasks/23-hardening-and-launch/spec.md) | F6 | semua | [14](14-testing-strategy.md), [00](00-overview.md#7-definisi-selesai-definition-of-done-untuk-v10) |

## 5. Checkpoint Verifikasi

Titik henti untuk meninjau sebelum melanjutkan. Kalau checkpoint gagal, perbaiki sebelum mengambil task berikutnya.

| Setelah | Checkpoint |
|---------|-----------|
| 04 | Login berfungsi di preview Vercel. Migrasi berjalan di CI. Sesi bertahan. |
| 07 | Catat pengeluaran → saldo berubah benar. Job rekonsiliasi melaporkan 0 selisih. |
| 09 | **Aplikasi layak dipakai sendiri setiap hari mulai titik ini.** Kalau belum terasa demikian, perbaiki friksi input sebelum lanjut. |
| 11 | Dua akun berbeda dapat berada di satu household. Test isolasi lintas-household hijau. |
| 12 | Bergabung tidak membagikan apa pun. Mematikan `share_wealth` berlaku seketika. Coverage `lib/visibility` 100%. |
| 13 | **Invarian I11 & I19 hijau.** Hanya satu operasi menulis lintas-ledger, dan cakupannya dikunci `CHECK`. |
| 15 | Kontribusi savings selalu berpasangan dengan ledger entry. Net worth tidak berubah karenanya. |
| 18 | Semua sumber aset dan liabilitas ada. Net worth dapat dihitung penuh, pribadi & household. |
| 19 | Rincian net worth menjumlah tepat ke total. Cakupan household benar. Snapshot berjalan. |
| 23 | Seluruh DoD di [00](00-overview.md#7-definisi-selesai-definition-of-done-untuk-v10) terpenuhi. |

**Checkpoint 09 dan 13 adalah yang paling menentukan.**

Checkpoint 09 menguji apakah produk intinya berhasil — kalau mencatat transaksi masih terasa merepotkan, menambah fitur tidak akan memperbaikinya.

Checkpoint 13 menguji **batas** pengecualian aturan 1.3. Setelah [ADR-030](16-decision-log.md#adr-030--transfer-ke-anggota-mencatat-kedua-sisi-sekaligus), ada tepat satu operasi yang menulis lintas-ledger — dan yang perlu dibuktikan bukan ketiadaannya, melainkan bahwa ia tidak bocor: `CHECK tx_created_by_rule` menahan bentuk lain, I11 menjaga kepemilikan entry, dan I19 memindai setiap baris yang ditulis orang lain.

## 6. Prinsip Urutan

**Setiap task adalah irisan vertikal.** Task menghasilkan sesuatu yang dapat dicoba, bukan lapisan yang menunggu lapisan lain. Task "dompet" mencakup skema, service, action, dan UI — bukan "semua skema" lalu "semua UI".

**Fitur yang menghasilkan data didahulukan.** Laporan tanpa transaksi tidak menampilkan apa pun. Karena itu 07 mendahului 21.

**Household mendahului modul yang terpengaruh olehnya.** Lihat §3.

**Net worth (19) menunggu semua sumbernya.** Membangunnya lebih awal berarti membangunnya dua kali.

**Dashboard (20) datang setelah net worth (19)**, meski ia halaman pertama yang dilihat pengguna. Dashboard adalah agregasi; membangunnya sebelum yang diagregasi ada berarti menulis placeholder yang nanti dibuang.

## 7. Setelah v1.0

Tidak dijadwalkan. Ditinjau ulang setelah pemakaian nyata.

**v1.1 kandidat:** transaksi berulang · rollover budget · attachment struk · notifikasi push (jatuh tempo, aktivitas, undangan) · widget · pembaruan waktu nyata untuk anggota lain.

**v1.2 kandidat:** multi-currency · import CSV/rekening koran · budget household untuk kategori kustom · pengecualian berbagi per household · penautan otomatis hutang-piutang antar anggota · pelacakan komitmen menabung sebagai catatan non-finansial · aset properti & kendaraan · lock biometrik.

**v2 kandidat:** saham & reksa dana · Open Banking · aplikasi native · household bertingkat.

**Ditolak sebagai arah produk** — bukan ditunda:

- Dompet atau rekening bersama → [ADR-016](16-decision-log.md#adr-016--household-sebagai-lapisan-bukan-pemilik)
- ACL per objek (`wallet_access`) → [ADR-024](16-decision-log.md#adr-024--tidak-ada-acl-per-objek)
- Operasi **kedua** yang menulis ke ledger user lain → [ADR-030](16-decision-log.md#adr-030--transfer-ke-anggota-mencatat-kedua-sisi-sekaligus)

Menambahkan salah satunya kelak bukan penyesuaian query — ia perubahan produk yang butuh ADR baru dan peninjauan ulang seluruh model otorisasi.
