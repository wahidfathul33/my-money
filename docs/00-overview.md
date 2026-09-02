# 00 — Overview

> Dokumen induk. Baca ini dulu sebelum dokumen lain.

## 1. Produk

**MyMoney** — Personal & Household Finance / Kekayaan Management web app, mobile-first, PWA-ready.

Bukan sekadar expense tracker. Ada dua pembeda:

1. **Kekayaan** — net worth, aset (emas, deposito), hutang-piutang, dan savings goal, semuanya terhubung ke satu ledger keuangan yang konsisten.
2. **Household** — beberapa orang dapat melihat dan merencanakan keuangan bersama **tanpa menggabungkan rekening**. Setiap orang tetap memegang dompet, aset, dan privasinya sendiri.

**Pengguna sasaran:** individu dan rumah tangga di Indonesia yang sudah mencatat pengeluaran harian tetapi kehilangan gambaran besar kekayaannya karena data tersebar di banyak tempat — dan, bila berkeluarga, tersebar juga di antara beberapa orang.

**Masalah inti yang dipecahkan:**
1. Pencatatan transaksi harian terlalu banyak friksi → orang berhenti mencatat dalam 2 minggu.
2. Kekayaan tidak terlihat sebagai satu angka → keputusan finansial diambil buta.
3. Aplikasi sejenis memaksa memilih: *expense tracker sederhana* ATAU *portfolio tracker rumit*.
4. **Keuangan keluarga memaksa memilih antara dua ekstrem yang sama-sama buruk:** menggabungkan semuanya ke satu akun bersama (kehilangan privasi dan kejelasan kepemilikan), atau tidak berbagi sama sekali (kehilangan gambaran bersama). Tidak ada jalan tengah yang dirancang dengan benar.

Masalah keempat itu yang menentukan bentuk seluruh lapisan household: **berbagi bersifat per item, opt-in, dan dapat dicabut** — bukan sakelar tunggal "gabung berarti buka semuanya".

## 2. Prinsip Produk

Diurutkan berdasarkan prioritas. Kalau ada konflik, yang di atas menang.

| # | Prinsip | Konsekuensi konkret |
|---|---------|---------------------|
| 1 | **Integritas data finansial di atas segalanya** | Setiap perubahan saldo punya jejak. Tidak ada UPDATE saldo tanpa ledger entry. |
| 2 | **Kepemilikan tidak pernah berpindah ke household** | Dompet, aset, hutang selalu milik satu user. Household hanya mengagregasi. Tidak ada rekening bersama. |
| 3 | **Menulis ke buku besar orang lain: tepat satu pengecualian** | Hanya mencatat transfer ke anggota household. Teratribusi, terbatas bentuk oleh `CHECK`, terlihat di Aktivitas, dan dapat dibatalkan sepihak oleh pemiliknya. |
| 4 | **Privat secara default** | Bergabung ke household tidak membagikan apa pun. Berbagi bersifat eksplisit dan dapat dicabut kapan saja. |
| 5 | **Input transaksi harus < 5 detik** | Amount adalah fokus pertama. Dompet & kategori punya default cerdas. Maksimal 3 tap untuk kasus umum. |
| 6 | **Mobile-first, bukan mobile-juga** | Desain dimulai dari 360px. Desktop adalah adaptasi, bukan sebaliknya. |
| 7 | **Progressive disclosure** | Dashboard menampilkan 5 hal. Sisanya satu tap lebih dalam. Household tidak pernah menghalangi alur harian. |
| 8 | **Jujur soal ketidakpastian** | Nilai estimasi diberi label estimasi. Kekayaan keluarga ditampilkan per anggota lebih dulu, bukan sebagai satu total yang menyamarkan cakupannya. |

## 3. Batasan Legal & Etis

Aplikasi ini terinspirasi pola UX aplikasi personal finance (termasuk Money Lover) — **bukan turunan kodenya**.

**Dilarang keras:**
- Menyalin aset visual, ikon, ilustrasi, logo, atau string produk milik pihak lain.
- Menggunakan nama, trademark, atau screenshot Money Lover di dalam produk maupun materi promosi.
- Melakukan dekompilasi/scraping aplikasi Money Lover.

**Diperbolehkan:** menganalisis pola interaksi yang sudah menjadi konvensi industri (bottom nav, quick-add FAB, grouping transaksi per tanggal) dan mengimplementasikannya dengan desain sendiri.

Lihat [14-testing-strategy.md](14-testing-strategy.md) untuk checklist review sebelum rilis.

## 4. Keputusan Arsitektural yang Sudah Dikunci

Empat keputusan ini sudah disepakati dan menjadi dasar semua dokumen lain. Perubahan di sini akan meruntuhkan banyak dokumen — perlakukan sebagai keputusan mahal.

| Keputusan | Pilihan | Alasan singkat |
|-----------|---------|----------------|
| Model pengguna | **Multi-user + Auth.js v5** | Skema sudah punya `user_id` di semua tabel. Aplikasi keuangan yang di-deploy publik tanpa auth tidak dapat dipertanggungjawabkan. |
| Database layer | **Drizzle ORM + Neon PostgreSQL** | Type-safe, SQL-first, transaksi eksplisit, bundle kecil untuk serverless. |
| Mata uang | **IDR saja di MVP** | Kolom `currency` tetap ada di skema, tetapi tidak ada konversi FX. Menghindari satu kelas bug yang mahal. |
| Harga emas | **Pluggable provider, manual sebagai default** | Tidak ada API harga Antam yang resmi & stabil. Detail di §5. |
| **Kepemilikan household** | **Household tidak memiliki apa pun** | Tidak ada shared dompet, tidak ada saldo household. Semua angka keluarga adalah hasil agregasi. |
| **Transfer antar anggota** | **Satu pencatatan, kedua sisi sekaligus** | Uangnya sudah pindah, jadi kedua saldo memang seharusnya berubah. Penerima diberi tahu lewat Aktivitas, bukan dimintai persetujuan. |
| **Berbagi data** | **Dua mekanisme saja: tag transaksi + `share_wealth`** | Tidak ada ACL per objek. Pertanyaan "siapa dapat melihat apa" harus dapat dijawab tanpa menelusuri graf izin. |
| **Peran household** | **`owner` dan `member`** | Household berisi 2–5 orang yang saling percaya. Hanya empat aksi yang dibatasi peran, semuanya soal keanggotaan — bukan uang. |
| **Kontribusi savings** | **Selalu memindahkan uang** | Tidak ada mode "komitmen". Angka tabungan tidak pernah naik tanpa saldo dompet turun. |
| **Kategori** | **Katalog kanonis ber-`system_key`** | Agregasi household eksak, bukan pencocokan teks. Kategori kustom tetap ditampilkan sebagai barisnya sendiri. |
| **Konteks household** | **Rute terpisah `/household/[id]`** | Konteks terbaca dari URL, bukan dari state tersembunyi. |

Rincian dan alternatif yang ditolak ada di [16-decision-log.md](16-decision-log.md).

## 5. Catatan: Sumber Harga Emas

Hasil riset (September 2026):

- **XAU spot global gratis** — `goldprice.dev`, `gold-api.com`, `goldapi.io` menyediakan XAU/USD tanpa kartu kredit. Masalahnya: harga spot USD/troy-oz ≠ harga emas batangan retail Indonesia (selisih bisa 8–15%), dan mengonsumsinya memaksa konversi FX yang sudah kita keluarkan dari MVP.
- **Harga Antam/UBS/Pegadaian** — hanya lewat API komunitas hasil scraping. Tidak ada SLA, bisa mati sewaktu-waktu.

**Keputusan:** definisikan interface `GoldPriceProvider`. MVP mengirim `ManualPriceProvider` (user input, selalu berfungsi). `ExternalPriceProvider` bersifat opsional, aktif lewat env flag, dijadwalkan Vercel Cron, dan **wajib** fallback ke harga manual terakhir bila gagal. Detail di [03-domain-model.md](03-domain-model.md#112-emas).

## 6. Ruang Lingkup MVP

**Masuk MVP (v1.0) — pribadi:**
Auth · Dompet · Kategori bawaan + kustom · Transaksi (income/expense/transfer) · Riwayat transaksi + filter · Budget bulanan · Savings goal · Emas · Deposito · Hutang & piutang · Dashboard · Net worth + snapshot · Laporan dasar · Settings · PWA installable.

**Masuk MVP (v1.0) — household:**
Buat household · Undangan lewat email · Keanggotaan (owner/member) · Tag transaksi ke household · `share_wealth` per anggota + pengecualian per item · Budget keluarga per kategori bawaan · Shared savings goal · Transfer ke anggota dengan saran penautan · Ringkasan keluarga · Kontribusi per anggota · Kekayaan keluarga per anggota · Layar "apa yang saya bagikan" · Context switcher.

**Ditunda ke v1.x:**
Multi-currency · Transaksi berulang · Import CSV/rekening koran · Attachment struk · Notifikasi push · Widget · Penautan otomatis hutang-piutang antar anggota · Pembaruan waktu nyata untuk anggota lain · Antrean tulis offline · Pengecualian berbagi per household · Budget household untuk kategori kustom.

**Di luar cakupan:**
Integrasi rekening bank langsung (Open Banking) · Trading/eksekusi investasi · Saran finansial otomatis · Perpajakan · Pembagian tagihan (split bill) antar anggota.

**Ditolak sebagai arah produk** — bukan sekadar ditunda:

| Fitur | Alasan penolakan |
|-------|------------------|
| Rekening / dompet bersama | Meruntuhkan invarian kepemilikan yang menjadi dasar seluruh model data. Jawabannya adalah shared savings goal dan transfer antar anggota. |
| ACL per dompet (`wallet_access`) | Akses baca ke **isi** dompet — saldo dan seluruh transaksinya. Menjadikan "siapa dapat melihat apa" sebagai penelusuran graf yang harus diaudit terpisah. Nama dompet yang terlihat di pemilih tujuan transfer bukan ini: ia dua field, melekat pada keanggotaan, dan tidak dapat diberikan per orang. |
| Operasi **kedua** yang menulis ke ledger user lain | Prinsip 3 menyediakan tepat satu, dan cakupannya dikunci `CHECK tx_created_by_rule`. Memperluasnya menuntut migrasi dan ADR baru. |

Menambahkan salah satunya kelak bukan penyesuaian query — ia perubahan produk yang butuh ADR baru dan peninjauan ulang seluruh model otorisasi.

## 7. Definisi Selesai (Definition of Done) untuk v1.0

Angka-angka ini adalah kriteria rilis, bukan aspirasi.

**Fungsional**
- [ ] Semua modul MVP di §6 dapat digunakan penuh (create, read, update, delete/void).
- [ ] Saldo dompet hasil kalkulasi ledger cocok 100% dengan saldo tersimpan untuk seluruh data uji (job rekonsiliasi melaporkan 0 selisih).
- [ ] Net worth = Σaset − Σliabilitas, dan tidak ada dana yang terhitung dua kali (diverifikasi lewat property test).
- [ ] Setiap kontribusi savings berpasangan dengan ledger entry; angka tabungan tidak pernah naik tanpa saldo dompet turun.
- [ ] Transfer ke anggota meninggalkan kekayaan keluarga tidak berubah — selalu, tanpa keadaan antara.
- [ ] **Invarian I11 & I19 hijau:** `ledger_entries.user_id` selalu pemilik dompet, dan `created_by <> user_id` hanya pada sisi penerima transfer.
- [ ] Agregasi kategori household eksak lewat `system_key`; kategori kustom tetap ditampilkan.
- [ ] Kekayaan keluarga dirender per anggota lebih dulu, dengan cakupan yang selalu terlihat.

**Privasi**
- [ ] User baru yang bergabung ke household tidak membagikan apa pun sampai ia mengaktifkan `share_wealth` atau menandai transaksi.
- [ ] Anggota yang dikeluarkan kehilangan seluruh akses pada permintaan berikutnya.
- [ ] `/settings/sharing` menampilkan status berbagi dan seluruh pengecualian dalam satu layar.
- [ ] `owner` tidak dapat membaca data pribadi anggota yang tidak dibagikan — dibuktikan test.
- [ ] Hanya `createMemberTransfer` yang menerima dompet milik user lain sebagai target tulis, dan kelayakannya diverifikasi di dalam transaction.

**Kualitas & performa**
- [ ] LCP < 2,5 s dan INP < 200 ms pada Moto G Power / jaringan 4G (diukur lewat Lighthouse CI di preview Vercel).
- [ ] Bundle JS rute dashboard < 180 KB gzip.
- [ ] Tidak ada horizontal overflow pada 360 / 375 / 390 / 430 px.
- [ ] Semua target sentuh ≥ 44×44 px; kontras teks memenuhi WCAG 2.2 AA.
- [ ] Alur "catat pengeluaran" selesai dalam ≤ 3 tap dan < 5 detik dari layar Home.

**Teknis**
- [ ] Coverage ≥ 90% pada `src/lib/finance/**` (kalkulasi finansial), ≥ 70% keseluruhan.
- [ ] Alur kritis (login, catat transaksi, transfer, bayar hutang, undang & terima anggota, transfer ke anggota) tercakup E2E Playwright.
- [ ] Setiap modul punya test isolasi lintas-user **dan** lintas-household.
- [ ] Coverage `lib/visibility/**` 100% cabang.
- [ ] Nol error TypeScript, nol warning ESLint pada `--max-warnings=0`.
- [ ] Migrasi database berjalan otomatis di pipeline deploy dan reversible.

## 8. Peta Dokumen

| Dokumen | Isi |
|---------|-----|
| [00-overview.md](00-overview.md) | Dokumen ini — visi, keputusan terkunci, DoD |
| [01-product-analysis.md](01-product-analysis.md) | Analisis pola produk, feature breakdown, prioritas |
| [02-information-architecture.md](02-information-architecture.md) | Sitemap, navigasi, context switcher, user flow |
| [03-domain-model.md](03-domain-model.md) | Entitas, household, lifecycle, aturan bisnis, formula |
| [04-database-schema.md](04-database-schema.md) | DDL lengkap, index, strategi migrasi |
| [05-financial-integrity.md](05-financial-integrity.md) | Representasi uang, invarian, transaksi atomik |
| [06-api-contracts.md](06-api-contracts.md) | Server Action & route handler, validasi, error model |
| [07-design-system.md](07-design-system.md) | Token desain, tipografi, warna, komponen |
| [08-copywriting.md](08-copywriting.md) | **Bahasa UI** — glosarium, tone, format angka, pola teks |
| [09-screen-specs.md](09-screen-specs.md) | Spesifikasi per layar, pribadi & household |
| [10-ux-states.md](10-ux-states.md) | Empty, loading, error, konfirmasi |
| [11-tech-architecture.md](11-tech-architecture.md) | Struktur folder, state management, boundary |
| [12-security-and-auth.md](12-security-and-auth.md) | Auth.js, model otorisasi dua sumbu, ancaman household |
| [13-deployment-vercel.md](13-deployment-vercel.md) | Vercel, Neon, env, cron, email, migrasi CI |
| [14-testing-strategy.md](14-testing-strategy.md) | Framework, level tes, coverage |
| [15-roadmap.md](15-roadmap.md) | Fase, milestone, indeks task |
| [16-decision-log.md](16-decision-log.md) | ADR: keputusan, alternatif yang ditolak, konsekuensi |

## 9. Cara Kerja Dokumen Ini

Spec ini **dokumen hidup**:

- Kalau keputusan berubah, **ubah dokumennya dulu**, baru kodenya.
- Setiap PR menyebut bagian spec yang diimplementasikan.
- Task di `tasks/` merujuk balik ke dokumen ini; kalau task dan doc berbeda, **doc yang menang** — atau doc-nya yang harus diperbaiki.
