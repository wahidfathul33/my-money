# 01 — Product Analysis

Analisis pola produk personal finance, feature breakdown, dan prioritas UX.

## 1. Pola yang Dipelajari (dan Alasannya)

Analisis ini menelaah **mengapa** konvensi tertentu muncul berulang di aplikasi personal finance, bukan meniru tampilannya.

### 1.1 Quick-add sebagai aksi primer

**Observasi:** hampir semua aplikasi menempatkan tombol "tambah transaksi" di tengah bottom nav, sering lebih menonjol dari item lain.

**Alasan UX:** pencatatan transaksi adalah satu-satunya aksi yang dilakukan **berkali-kali setiap hari**. Semua fitur lain (laporan, budget, aset) bersifat konsumsi — dilakukan mingguan atau bulanan. Menempatkan aksi tulis-tinggi-frekuensi di posisi termudah dijangkau ibu jari adalah konsekuensi langsung dari distribusi frekuensi ini.

**Keputusan kita:** FAB di tengah bottom nav, membuka bottom sheet. Bukan halaman baru — karena navigasi mundur dari halaman penuh terasa lebih berat daripada menutup sheet.

### 1.2 Amount-first input

**Observasi:** form input transaksi selalu menempatkan nominal sebagai fokus pertama dengan keypad numerik langsung terbuka.

**Alasan UX:** nominal adalah satu-satunya field yang **selalu** berbeda tiap transaksi. Kategori, dompet, dan tanggal punya nilai default yang benar ~80% waktu. Meminta user mengisi field yang bisa ditebak sebelum field yang tidak bisa ditebak membuang waktu.

**Keputusan kita:** keypad kustom di layar (bukan keyboard OS) supaya tinggi sheet dapat diprediksi dan kita bisa menyisipkan tombol kalkulator (`+`, `−`) — orang sering menjumlahkan beberapa struk.

### 1.3 Grouping transaksi per tanggal dengan subtotal harian

**Observasi:** riwayat transaksi dikelompokkan per hari dengan header berisi tanggal + total hari itu.

**Alasan UX:** memori manusia soal pengeluaran ter-anchor ke hari ("kemarin saya habis berapa?"), bukan ke transaksi individual. Subtotal harian menjawab pertanyaan itu tanpa perlu menghitung mental.

### 1.4 Transfer sebagai kelas warga tersendiri

**Observasi:** transfer antar-wallet ditampilkan berbeda dari income/expense.

**Alasan UX:** kalau transfer terhitung sebagai expense di dompet sumber, total pengeluaran bulanan akan meledak dan angkanya tidak bermakna. Ini kesalahan akuntansi yang langsung menghancurkan kepercayaan pada aplikasi.

**Keputusan kita:** transfer punya `type` sendiri, dikecualikan dari semua agregasi income/expense, dan diberi warna netral (bukan merah/hijau). Lihat [05-financial-integrity.md](05-financial-integrity.md).

### 1.5 Batas kompleksitas dashboard

**Observasi:** dashboard yang dipadati 10+ kartu justru jarang dibuka.

**Alasan UX:** dashboard dibuka untuk menjawab satu pertanyaan: *"apakah kondisi saya baik-baik saja?"* Itu pertanyaan biner. Kartu tambahan menaikkan waktu untuk sampai ke jawaban, bukan menurunkannya.

**Keputusan kita:** dashboard punya **satu angka pahlawan** (net worth), satu ringkasan arus kas bulan berjalan, dan maksimal 4 kartu ringkas di bawahnya. Sisanya di balik satu tap.

## 2. Feature Breakdown

Prioritas memakai MoSCoW. `M` = Must (MVP), `S` = Should (v1.0 kalau waktu cukup), `C` = Could (v1.x), `W` = Won't (di luar cakupan).

### 2.1 Core Ledger

| Fitur | Prio | Catatan |
|-------|------|---------|
| Catat expense | M | Alur < 5 detik |
| Catat income | M | |
| Transfer antar dompet | M | Tidak dihitung income/expense |
| Edit transaksi | M | Harus reversal-safe |
| Hapus/void transaksi | M | Soft delete + reversal saldo atomik |
| Kalkulator inline di keypad | S | `+` dan `−` saja |
| Transaksi berulang | C | v1.1 |
| Attachment struk | C | Butuh Vercel Blob |
| Split transaction | W | |

### 2.2 Dompet

| Fitur | Prio | Catatan |
|-------|------|---------|
| CRUD dompet (cash/bank/e-wallet/kartu kredit) | M | |
| Saldo awal saat pembuatan | M | Dicatat sebagai ledger entry `opening_balance` |
| Dompet default untuk quick-add | M | Terakhir dipakai, bisa di-override di settings |
| Arsip dompet (non-aktif) | M | Tidak boleh dihapus jika punya transaksi |
| Semantik kartu kredit sebagai liabilitas | M | Lihat [ADR-015](16-decision-log.md#adr-015--kartu-kredit-sebagai-liabilitas-dengan-saldo-negatif) |
| Rekonsiliasi saldo manual | S | "Saldo asli saya sebenarnya X" → buat adjustment entry |

### 2.3 Kategori

| Fitur | Prio | Catatan |
|-------|------|---------|
| Kategori bawaan (seed) | M | Lihat [03-domain-model.md](03-domain-model.md) |
| CRUD kategori kustom | M | |
| Sub-kategori (1 level) | S | `parent_id`, kedalaman dibatasi 1 |
| Ikon + warna kategori | M | Dari set ikon terkurasi, bukan upload |
| Merge kategori | C | |

### 2.4 Budget

| Fitur | Prio | Catatan |
|-------|------|---------|
| Budget bulanan per kategori | M | |
| Status: aman / mendekati limit / lewat | M | Ambang 80% dan 100% |
| Budget berulang otomatis tiap bulan | M | Tanpanya, budget harus dibuat ulang tiap tanggal 1 |
| Rollover sisa budget | C | Default: tidak rollover |
| Budget total (bukan per kategori) | S | |

### 2.5 Savings Goal

| Fitur | Prio | Catatan |
|-------|------|---------|
| CRUD goal + target + tanggal target | M | |
| Kontribusi dari dompet | M | Selalu memindahkan uang; internal movement, bukan expense |
| Penarikan ke dompet | M | Hanya atas kontribusi milik sendiri |
| Progress, sisa nominal, sisa waktu | M | |
| Saran kontribusi bulanan | M | Pada goal bersama, juga ditampilkan per anggota |
| Riwayat kontribusi | M | Pada goal bersama, disertai nama kontributor |
| **Shared household goal** | M | Satu tabel, dibedakan `household_id` |
| Arsip goal | M | |
| Mode "komitmen" (tanpa pindah uang) | C | v1.x, sebagai catatan non-finansial di luar perhitungan aset |
| Auto-debit terjadwal | C | |

### 2.6 Household / Keluarga

| Fitur | Prio | Catatan |
|-------|------|---------|
| Buat household | M | |
| Undang anggota lewat email | M | Token ter-hash, kedaluwarsa 7 hari, sekali pakai |
| Terima undangan | M | Termasuk alur untuk yang belum punya akun |
| Peran: owner / member | M | Hanya 4 aksi yang dibatasi peran, semuanya soal keanggotaan |
| Keluar / keluarkan anggota | M | |
| Alih kepemilikan household | M | Wajib sebelum owner keluar atau menghapus akun |
| Tag transaksi ke household | M | `household_id` nullable pada transaksi |
| `share_wealth` per anggota | M | Satu toggle, default `false` |
| Pengecualian per item | M | `exclude_from_household`, untuk satu-dua item tertentu |
| Layar "apa yang saya bagikan" | M | Status per household + daftar pengecualian |
| Ringkasan keluarga | M | Income, expense, per kategori, per anggota |
| Budget keluarga per kategori bawaan | M | Dicocokkan **eksak** lewat `system_key` |
| Kekayaan keluarga per anggota | M | Rincian per anggota adalah tampilan utama |
| Transfer ke anggota + saran penautan | M | Masing-masing mencatat sisinya sendiri |
| Context switcher | M | Rute terpisah, bukan mode tersembunyi |
| Multi-household per user | M | Skema mendukung; UI menampilkan daftar |
| Budget household untuk kategori kustom | C | v1.x; butuh kategori milik household sendiri |
| Pengecualian berbagi per household | C | v1.x; saat ini `exclude_from_household` bersifat global |
| Penautan otomatis hutang-piutang antar anggota | C | v1.x |
| Split bill antar anggota | W | Di luar cakupan |
| Berbagi dompet per orang (ACL) | **W** | **Ditolak** — lihat [00 §6](00-overview.md#6-ruang-lingkup-mvp) |
| Dompet / rekening bersama | **W** | **Ditolak sebagai arah produk** |

### 2.7 Aset

| Fitur | Prio | Catatan |
|-------|------|---------|
| Emas: beli, jual, multi-lot | M | Cost basis rata-rata tertimbang |
| Emas: update harga pasar manual | M | Ada riwayat harga |
| Emas: provider harga eksternal | S | Opsional, di belakang env flag |
| Deposito: pokok, bunga, jatuh tempo | M | |
| Deposito: estimasi bunga + PPh 20% | M | Mengabaikan pajak melebihkan imbal hasil ~20% |
| Deposito: pencairan → dompet | M | |
| Deposito: ARO (auto roll over) | S | Praktik umum di Indonesia |
| Properti / kendaraan / aset lain | S | Valuasi manual sederhana |
| Saham / reksa dana / kripto | W | v2 |

### 2.8 Hutang & Piutang

| Fitur | Prio | Catatan |
|-------|------|---------|
| CRUD hutang & piutang | M | |
| Cicilan / pelunasan sebagian | M | Mengurangi sisa + membuat ledger entry |
| Tandai lunas | M | |
| Jatuh tempo mendatang & telat bayar | M | Tampil di dashboard |
| Bunga pada hutang | S | Bunga flat sederhana |
| Amortisasi | W | |

### 2.9 Insight

| Fitur | Prio | Catatan |
|-------|------|---------|
| Halaman net worth pribadi + rincian | M | |
| Snapshot net worth harian | M | Vercel Cron, pribadi + household |
| Tren net worth | M | |
| Pengeluaran per kategori | M | |
| Income vs expense per bulan | M | |
| Kategori pengeluaran terbesar | M | |
| Arus kas | M | |
| **Laporan household: per kategori** | M | Dikelompokkan nama kategori ternormalisasi |
| **Laporan household: per anggota** | M | Siapa membayar berapa |
| **Tren pengeluaran household** | M | |
| **Tren kekayaan keluarga + penanda perubahan cakupan** | M | Lonjakan karena anggota mulai berbagi bukan pertumbuhan kekayaan |
| Ekspor CSV | S | Hanya data milik user sendiri |

## 3. User Flow Utama

Notasi: `→` langkah, `[…]` layar/sheet, `«…»` aksi sistem.

### 3.1 Catat pengeluaran (alur terpenting)

```
[Home] → tap FAB
  → [Sheet: Add Transaction] tab "Expense" aktif secara default
    → keypad terbuka, fokus di Amount
    → ketik nominal
    → tap kategori dari baris "sering dipakai" (chip horizontal)
    → «Dompet terisi otomatis dari default; tanggal = hari ini»
    → tap Simpan
  → «Transaksi tersimpan; saldo dompet diperbarui atomik»
  → sheet tertutup, toast "Tersimpan" + aksi "Urungkan" (5 detik)
  → [Home] angka terupdate
```

**Jumlah tap kasus umum: 3** (FAB → kategori → Simpan). Nominal diketik.

### 3.2 Transfer antar dompet

```
[Home] → FAB → tab "Transfer"
  → nominal
  → pilih dompet asal → pilih dompet tujuan
  → «Validasi: asal ≠ tujuan; saldo cukup jika dompet bukan kartu kredit»
  → Simpan
  → «Satu transaksi, dua ledger entry (debit + kredit), satu DB transaction»
```

### 3.3 Kontribusi ke savings goal

```
[Kekayaan] → [Savings] → pilih goal
  → tap "Tambah Dana"
  → nominal + dompet sumber
  → Simpan
  → «Saldo dompet turun, current_amount goal naik, dalam satu DB transaction»
  → «Net worth TIDAK berubah — dana hanya berpindah antar pos aset»
```

Poin terakhir itu penting dan harus terlihat di UI: setelah kontribusi, tampilkan "Net worth tidak berubah — dana dipindahkan, bukan dibelanjakan."

### 3.4 Bayar cicilan hutang

```
[Kekayaan] → [Debt] → pilih hutang
  → "Catat Pembayaran" → nominal + dompet
  → «Validasi: nominal ≤ sisa hutang»
  → Simpan
  → «Saldo dompet turun; sisa hutang turun; status → paid jika sisa = 0»
  → «Net worth TIDAK berubah — aset turun, liabilitas turun dengan jumlah sama»
```

### 3.5 Beli emas

```
[Kekayaan] → [Assets] → [Gold] → "Beli"
  → berat + harga per gram + dompet sumber
  → «Saldo dompet turun sebesar berat × harga»
  → «Lot emas baru tercatat; cost basis dihitung ulang»
  → «Net worth turun sedikit jika harga beli > harga buyback saat ini (spread nyata)»
```

Spread emas beli-vs-buyback harus dijelaskan di UI sekali (tooltip), agar user tidak menganggapnya bug.

### 3.6 Menandai pengeluaran sebagai pengeluaran keluarga

```
[Home] → FAB → tab "Pengeluaran"
  → nominal → kategori "Tagihan"
  → toggle "Pengeluaran keluarga"  ← muncul hanya bila user punya household
    → bila punya >1 household: pilih yang mana
  → Simpan
  → «Verifikasi keanggotaan aktif di dalam transaction»
  → «Satu transaksi, satu ledger entry, satu tag household»

Efek pribadi:   saldo turun, masuk pengeluaran pribadi
Efek keluarga:  masuk pengeluaran keluarga, tercatat "dibayar oleh Wahid"
Kepemilikan:    tidak berubah sedikit pun
```

Toggle ini adalah **satu tap tambahan pada alur tersibuk aplikasi**, jadi ia harus ditempatkan dengan hati-hati: berada di baris meta (sejajar dompet dan tanggal), tidak pernah menggeser posisi tombol Simpan, dan mengingat pilihan terakhir per kategori. Kalau menandai pengeluaran keluarga terasa merepotkan, orang berhenti melakukannya dan laporan keluarga jadi kosong.

### 3.7 Mengundang anggota

```
[Keluarga] → [Anggota] → "Undang"
  → email + peran
  → «Token dibuat, di-hash, disimpan; email terkirim»
  → status "Menunggu" muncul di daftar anggota

Penerima:
  klik tautan → /invite/[token]
    → belum punya akun → daftar → verifikasi email → cocokkan undangan
    → sudah punya akun  → login
  → [Layar konfirmasi] "Bergabung tidak membagikan data keuangan Anda."
  → Terima
  → «status undangan → accepted, keanggotaan → active, dalam satu transaction»
  → mendarat di ringkasan keluarga yang masih kosong, dengan ajakan berbagi
```

### 3.8 Transfer ke anggota lain

Alurnya berangkat dari satu koreksi premis: **uangnya sudah pindah lewat bank.** Aplikasi hanya mencatat.

```
Wahid (sudah transfer BCA → BRI Istri di m-banking):
[Home] → FAB → tab "Transfer" → "Ke anggota keluarga"
  → nominal + dompet asal (milik saya) + pilih anggota
  → «Validasi: keduanya anggota aktif household yang sama»
  → Simpan
  → «Saldo Wahid turun. Ledger Istri TIDAK tersentuh.»
  → badge pada transaksinya: "Menunggu dicatat Istri"

Istri:
[Saran] → "Wahid mencatat transfer Rp1.000.000 ke Anda. Catat juga?"
  → pilih dompet tujuan (miliknya) → [Catat]
  → «Saldo Istri naik; kedua transaksi saling menunjuk»
  → «Kekayaan keluarga kembali utuh»

  atau [Abaikan] → saran hilang; catatan Wahid tetap sah
```

Perhatikan bahwa **Wahid tidak memilih dompet tujuan** — ia tidak perlu tahu rekening mana milik Istri, dan tidak perlu diberi akses untuk melihatnya. Istri memilihnya sendiri saat mencatat.

Kalau Istri tidak pernah mencatat, catatan Wahid tetap benar dan kekayaan keluarga turun sebesar itu. Itu jujur: dari sisi data keluarga, uang itu memang belum tercatat sampai di mana pun.

### 3.9 Kontribusi ke shared savings goal

```
[Keluarga] → [Tabungan] → pilih goal → "Tambah Kontribusi"
  → nominal + dompet sumber (milik saya)
  → Simpan
  → «Saldo dompet turun; current_amount goal naik; satu DB transaction»
  → «Net worth tidak berubah — dana hanya berpindah pos»
```

Kontribusi selalu berasal dari dompet pribadi kontributor. Sistem tidak pernah membuat saldo bersama, dan penarikan hanya dapat dilakukan atas kontribusi sendiri, ke dompet sendiri.

Sheet memuat catatan tetap: *"Ini memindahkan uang dari dompet Anda ke tabungan. Kekayaan bersih Anda tidak berubah."*

## 4. Prioritas Informasi

Urutan ini menentukan tata letak Dashboard di [09-screen-specs.md](09-screen-specs.md).

1. **Net worth** — satu angka yang menjawab "bagaimana kondisi saya".
2. **Kas tersedia** — satu angka yang menjawab "berapa yang bisa saya pakai sekarang".
3. **Arus kas bulan berjalan** — masuk vs keluar, dengan selisih.
4. **Quick add** — selalu terlihat, tidak pernah butuh scroll.
5. **Progress savings** — motivasi, bukan diagnostik.
6. **Status budget** — hanya tampilkan kategori yang mendekati/melewati limit.
7. **Jatuh tempo hutang/piutang** — hanya jika ada dalam 7 hari ke depan atau telat.
8. **Transaksi terbaru** — 5 item, sebagai konfirmasi "pencatatan saya masuk".

Aset dan liabilitas rinci **tidak** tampil di dashboard. Sudah terangkum di net worth; rinciannya ada satu tap lebih dalam.

## 5. Risiko Produk

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| User berhenti mencatat setelah 2 minggu | Fatal — data kosong bikin semua fitur tak berguna | Obsesi pada friksi input; default cerdas; toast undo |
| Angka net worth terasa salah | Kepercayaan hancur, tidak bisa dipulihkan | Rincian net worth dapat ditelusuri sampai entri sumber; job rekonsiliasi |
| Onboarding kosong terasa berat | Ditinggalkan di hari pertama | Seed kategori otomatis; buat 1 dompet "Cash" saat signup; empty state yang mengajak |
| Emas/deposito bikin aplikasi terasa rumit | Mengusir user yang cuma mau expense tracking | Modul wealth ada di tab terpisah, tidak pernah menghalangi alur harian |
| Harga emas basi menyesatkan | Keputusan finansial keliru | Tampilkan badge "Diperbarui N hari lalu"; peringatan setelah 30 hari |
| **Household terasa mengancam privasi** | Undangan ditolak; fitur mati sebelum dipakai | Default privat; layar konfirmasi undangan menyatakan apa yang **tidak** dibagikan; tidak ada tombol "bagikan semua" |
| **Household bikin aplikasi terasa berat bagi pengguna solo** | Mengusir mayoritas demi minoritas | Tanpa household, tidak ada satu pun elemen household yang terlihat — switcher pun disembunyikan |
| **Laporan keluarga kosong meski sudah bergabung** | Fitur terasa rusak | Ringkasan keluarga kosong menampilkan langkah konkret: "Tandai pengeluaran keluarga" + "Bagikan dompet" |
| **Berbagi berlebihan tanpa sadar** | Penyesalan, hilangnya kepercayaan | Satu toggle dengan deskripsi eksplisit; `/settings/sharing` sebagai tempat meninjau |
| **Kekayaan keluarga disalahartikan sebagai total sebenarnya** | Keputusan keluarga diambil dari angka tidak lengkap | Tampilan utama per anggota; anggota yang belum berbagi tetap tampil berlabel |
| **Konflik antar anggota soal siapa membayar apa** | Masalah sosial yang tidak bisa diselesaikan software | Laporan menampilkan fakta (siapa membayar berapa), bukan penilaian |
| **Transfer hanya dicatat satu sisi** | Kekayaan keluarga turun tanpa sebab yang jelas | Badge "Menunggu dicatat {nama}" pada transaksi pengirim; saran satu tap di sisi penerima; catatan penjelas di halaman kekayaan keluarga |
