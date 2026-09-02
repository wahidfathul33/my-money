# 08 — Copywriting & Wording

Bahasa yang terlihat pengguna. Dokumen ini **otoritatif** untuk setiap teks di UI — label, tombol, judul, deskripsi, empty state, error, konfirmasi, tooltip, dan notifikasi.

Kalau teks di [09-screen-specs](09-screen-specs.md) atau [10-ux-states](10-ux-states.md) berbeda dengan dokumen ini, **dokumen ini yang menang** — atau salah satunya harus diperbaiki sampai sepakat.

## 1. Karakter Bahasa

**Sederhana · tenang · membantu · manusiawi.**

Aplikasi ini dibuat oleh tim produk fintech, bukan oleh vendor software akuntansi. Bahasanya membantu orang memahami uangnya sendiri tanpa membuat mereka merasa sedang mengoperasikan sistem.

| | |
|---|---|
| ❌ | "Selamat datang di dashboard manajemen finansial Anda." |
| ✅ | "Ringkasan keuangan" |
| ❌ | "Transaksi Anda telah berhasil ditambahkan ke dalam sistem." |
| ✅ | "Transaksi tersimpan" |
| ❌ | "Apakah Anda yakin ingin menghapus data transaksi ini?" |
| ✅ | "Hapus transaksi ini?" |

**Aturan tunggal yang mengatasi semua aturan lain:**

> Kalau sebuah teks bisa dihapus tanpa mengurangi pemahaman, **hapus.**

Jangan menambah teks agar halaman terlihat penuh. Kejelasan mengalahkan penjelasan.

### Yang dihindari

Terlalu formal · terlalu panjang · terdengar seperti dokumentasi teknis · jargon finansial · bahasa marketing · kalimat generik ("Kelola keuangan Anda dengan mudah") · mengulang apa yang sudah terlihat dari UI.

## 2. Bahasa

**Bahasa Indonesia sebagai bahasa utama.** Istilah Inggris dipertahankan hanya bila lebih familiar bagi pengguna, atau bila terjemahannya justru terdengar asing.

Satu-satunya istilah Inggris yang bertahan di UI adalah **Transfer** — ia sudah dipakai sehari-hari, dan "pindah dana" terdengar lebih asing daripada aslinya.

Yang **diterjemahkan meski sering dibiarkan Inggris:** Budget → Anggaran · Cash flow → Arus kas · Net worth → Kekayaan bersih · Wallet → Dompet.

**Jangan mencampur dua bahasa dalam satu konteks.** "Total Balance Kekayaan" adalah gejala tidak adanya glosarium yang dipatuhi.

## 3. Glosarium

Satu konsep, satu istilah, di seluruh aplikasi. Tabel ini mengikat.

| Konsep | Istilah UI | Jangan pakai |
|--------|-----------|--------------|
| Wallet | **Dompet** | Akun, Wallet, Rekening |
| Transaction | **Transaksi** | Mutasi, Catatan |
| Expense | **Pengeluaran** | Expense, Belanja, Keluar |
| Income | **Pemasukan** | Income, Pendapatan, Masuk |
| Transfer | **Transfer** | Pindah dana, Mutasi |
| Category | **Kategori** | Pos, Klasifikasi |
| Savings goal | **Target tabungan** | Goal, Sasaran, Celengan |
| Contribution | **Kontribusi** | Setoran, Alokasi |
| Asset | **Aset** | Harta, Kekayaan |
| Debt | **Hutang** | Utang², Kewajiban, Liabilitas |
| Receivable | **Piutang** | Tagihan, Receivable |
| Budget | **Anggaran** | Budget, Batas |
| Net worth | **Kekayaan bersih** | Net worth, Nilai bersih |
| Cash flow | **Arus kas** | Cash flow |
| Household | **Keluarga** | Household, Rumah tangga |
| Member | **Anggota** | Member, Partisipan |
| Due date | **Jatuh tempo** | Tenggat, Deadline |

² **"Hutang" vs "utang".** KBBI membakukan *utang*. Kami memakai **Hutang** karena jauh lebih umum dipakai penutur sehari-hari, dan pasangannya *piutang* sudah baku. Konsistensi dengan cara orang bicara lebih berharga daripada kepatuhan ejaan di sini — tetapi keputusannya sadar, bukan kelalaian.

### 3.1 "Dompet" dan "Akun" adalah dua hal berbeda

| Konsep | Istilah | Contoh |
|--------|---------|--------|
| Tempat uang berada | **Dompet** | "Dompet BCA", "Tambah dompet", "Saldo dompet" |
| Identitas login pengguna | **Akun** | "Pengaturan akun", "Keluar", "Hapus akun" |

Memilih "Dompet" — bukan "Akun" — untuk wallet membuat keduanya bebas dipakai tanpa saling merebut makna. "Hapus akun" tetap berarti apa yang orang harapkan.

Konsekuensinya, "Dompet BCA" secara harfiah agak janggal untuk rekening bank. Itu diterima: di aplikasi ini dompet adalah **kategori tempat uang** — tunai, rekening, e-wallet, kartu kredit — dan nama spesifiknya yang membedakan. Alternatifnya ("Rekening") justru lebih salah untuk uang tunai.

### 3.2 Istilah internal yang tidak boleh bocor ke UI

Spesifikasi ini penuh istilah teknis yang tepat untuk engineer dan salah untuk pengguna.

| Di spec | Di UI |
|---------|-------|
| `void` transaksi | **Hapus** |
| `ledger entry` | *(tidak pernah muncul)* |
| `invarian`, `rekonsiliasi` | *(tidak pernah muncul)* |
| `share_wealth` | **Bagikan kekayaan saya** |
| `exclude_from_household` | **Sembunyikan dari keluarga** |
| `acknowledged` | **Sudah dilihat** |
| `counterparty` | **Anggota** / nama orangnya |
| `cakupan` (coverage) | **Dari 2 dari 3 anggota** — angkanya, bukan istilahnya |
| `idempotency`, `cursor`, `snapshot` | *(tidak pernah muncul)* |
| `owner` / `member` | **Pemilik** / **Anggota** |
| `funded` / `committed` | *(tidak berlaku — hanya satu mode)* |

## 4. Format Angka & Tanggal

Bagian ini tidak ada di panduan asal, tetapi tanpa keputusannya setiap layar akan menebak sendiri.

| Hal | Format | Contoh |
|-----|--------|--------|
| Rupiah | `Rp` menempel, pemisah titik | `Rp8.000.000` · `Rp0` |
| Nol | Tetap `Rp0`, bukan "-" atau kosong | `Rp0` |
| Negatif | Tanda minus di depan `Rp` | `−Rp45.000` |
| Pemasukan | Tanda plus eksplisit | `+Rp15.000.000` |
| Transfer | **Tanpa tanda** | `Rp500.000` |
| Ringkas (≥ 1 miliar) | Satu desimal + satuan | `Rp1,2 M` · `Rp8,5 jt` |
| Persen | Tanpa desimal kecuali < 10% | `86%` · `4,25%` |
| Tanggal (daftar) | Relatif lalu absolut | `Hari ini` · `Kemarin` · `2 Sep` |
| Tanggal (detail) | Panjang | `2 September 2026` |
| Waktu | 24 jam | `12:30` |
| Rentang | En dash tanpa spasi | `1–30 Sep` |

**`Rp` menempel tanpa spasi.** Ini mengubah `formatIDR` di [07-design-system §14.6](07-design-system.md#146-contoh-moneytext) dan setiap contoh nominal di dokumen lain, yang saat ini memakai spasi. Panduan ini yang berlaku.

Bentuk ringkas hanya untuk tempat yang benar-benar sempit (tile dashboard, sumbu chart). Di daftar transaksi dan detail, **selalu nominal penuh** — orang datang ke sana justru untuk angka pastinya.

## 5. Pola per Permukaan

### 5.1 Navigasi

```
Beranda · Transaksi · Kekayaan · Aktivitas · Dompet
Anggaran · Tabungan · Aset · Hutang & Piutang · Laporan
Keluarga · Pengaturan
```

Label nav adalah satu kata bila memungkinkan. Jangan menjelaskan fungsi di label.

### 5.2 Judul halaman & kartu

Langsung menyebut isinya. Tanpa "Anda", tanpa kata kerja.

```
Ringkasan keuangan          Total saldo
Keuangan bulan ini          Pemasukan
Pengeluaran keluarga        Pengeluaran
Kekayaan bersih             Arus kas
```

### 5.3 Form

Label = nama field, bukan kalimat perintah.

```
Jumlah          Kategori        Dompet
Tanggal         Catatan         Dari · Ke
```

| | |
|---|---|
| ❌ | "Masukkan jumlah uang yang ingin Anda gunakan untuk transaksi ini." |
| ✅ | "Jumlah" |
| ❌ | "Silakan pilih kategori transaksi yang sesuai." |
| ✅ | "Pilih kategori" *(placeholder, bukan label)* |

Placeholder nominal: `Rp0`. Catatan bersifat opsional — tulis `Catatan (opsional)` hanya bila ketiadaannya benar-benar membingungkan.

### 5.4 Tombol

Kata kerja pendek. Satu atau dua kata.

```
Simpan · Tambah · Buat · Edit · Hapus · Batal
Transfer · Bayar · Tarik dana · Catat
Undang · Kelola · Lihat semua · Coba lagi
```

Jangan: `Klik di sini` · `Submit` · `Lanjutkan` · `Konfirmasi Tindakan` · `Simpan Transaksi Sekarang` · `Pelajari lebih lanjut`.

Tombol destruktif memakai kata kerjanya, bukan "OK" atau "Ya".

### 5.5 Empty state

Judul menyatakan keadaan. Deskripsi menjelaskan **nilai** dari mengisinya — bukan mengulang judul. Satu aksi.

| Layar | Judul | Deskripsi | Tombol |
|-------|-------|-----------|--------|
| Transaksi | Belum ada transaksi | Catat pemasukan atau pengeluaran pertama Anda. | Tambah transaksi |
| Dompet | Belum ada dompet | Tambahkan rekening, e-wallet, atau uang tunai untuk mulai mencatat. | Tambah dompet |
| Tabungan | Belum ada target | Buat target untuk mulai menyisihkan uang. | Buat target |
| Aset | Belum ada aset | Tambahkan emas, deposito, atau aset lain yang Anda miliki. | Tambah aset |
| Hutang | Tidak ada hutang | — | Tambah catatan |
| Anggaran | Belum ada anggaran | Tetapkan batas per kategori, lalu kami ingatkan saat mendekati. | Buat anggaran |
| Filter kosong | Tidak ada yang cocok | Coba ubah rentang tanggal atau kategorinya. | Reset filter |
| Aktivitas | Tidak ada yang perlu ditinjau | Catatan dari anggota keluarga muncul di sini. | — |
| Keluarga | Belum punya keluarga | Lihat gambaran keuangan bersama tanpa menggabungkan rekening. | Buat keluarga |

"Tidak ada hutang" **tanpa deskripsi** — keadaan itu tidak butuh dorongan apa pun, dan merayakannya ("Selamat, Anda bebas hutang!") terdengar seperti template.

### 5.6 Pesan sukses

Satu atau dua kata. Toast, bukan dialog.

```
Tersimpan · Transaksi tersimpan · Perubahan disimpan
Target diperbarui · Pembayaran dicatat · Undangan terkirim
```

Jangan: "Data berhasil diperbarui." · "Transaksi Anda telah berhasil disimpan."

### 5.7 Error

Sebutkan apa yang salah, lalu apa yang bisa dilakukan. Satu kalimat.

```
Jumlah harus lebih dari Rp0.
Saldo BCA tidak mencukupi. Tersedia Rp1.240.000.
Pembayaran melebihi sisa hutang. Sisa Rp2.500.000.
Pilih dompet tujuan.
Tanggal tidak valid.
Terjadi kesalahan. Coba lagi.
```

**Untuk kegagalan yang menyangkut uang, sebutkan status datanya.** Kekhawatiran pertama orang saat melihat error di aplikasi keuangan adalah apakah uangnya hilang:

> Gagal menyimpan. Data Anda tidak berubah — coba lagi.

Jangan pernah menampilkan pesan teknis, kode HTTP, atau nama tabel.

### 5.8 Konfirmasi

Judul adalah pertanyaan berisi tindakan. Deskripsi **hanya** bila ada konsekuensi yang tidak terlihat.

```
Hapus transaksi ini?
Hapus target?
Batalkan undangan?
Keluarkan anggota dari keluarga?
```

| Punya konsekuensi | Deskripsi |
|-------------------|-----------|
| Hapus dompet berisi transaksi | "Dompet ini punya 142 transaksi. Menghapusnya menghapus seluruh riwayatnya." |
| Keluar dari keluarga | "Data keuangan Anda tetap milik Anda. Berbagi akan dihentikan." |
| Transfer ke anggota | "Saldo Istri langsung berubah. Ia akan melihatnya di Aktivitas." |

Aksi yang dapat diurungkan **tidak** memakai dialog — cukup toast + "Urungkan". Dialog untuk aksi yang reversibel hanya melatih orang menekan "Ya" tanpa membaca.

### 5.9 Loading

Skeleton tanpa teks. Bila teks benar-benar perlu (> 2 detik): `Memuat…`

Jangan: "Loading data..." · "Mohon tunggu sebentar..."

### 5.10 Microcopy

Hanya bila UI tidak cukup menjelaskan dirinya. Sebagian besar tooltip yang terpikir sebenarnya tidak dibutuhkan.

Yang **memang** perlu, karena menjelaskan hal yang tidak terlihat:

> Harga buyback — harga saat Anda menjual, bukan saat membeli.

> Estimasi setelah pajak 20%.

> Diperbarui 2 hari lalu.

> Kekayaan bersih Anda tidak berubah — uang hanya berpindah tempat.

## 6. Wording Keluarga

Konsepnya **Keluarga**, bukan "household" atau "shared financial ecosystem".

```
Keluarga · Anggota · Undang anggota
Pengeluaran keluarga · Anggaran keluarga · Tabungan keluarga
Kekayaan keluarga · Kontribusi anggota
```

### 6.1 Undangan

| Elemen | Teks |
|--------|------|
| Judul | Undang anggota keluarga |
| Deskripsi | Ajak anggota keluarga melihat dan merencanakan keuangan bersama. |
| Tombol | Kirim undangan |
| Status | Menunggu · Diterima · Kedaluwarsa · Dibatalkan |

### 6.2 Pemilih konteks

```
Melihat sebagai
  Pribadi
  Keluarga Wahid
```

Jangan: "Pilih konteks finansial" · "Workspace".

### 6.3 Privasi

Karena setiap orang tetap memegang akunnya sendiri, wording privasi harus tegas dan tidak menakuti.

Kalimat inti, dipakai di layar undangan dan di pengaturan berbagi:

> Data keuangan Anda tetap pribadi kecuali Anda membagikannya.

Untuk sakelar berbagi kekayaan:

| Elemen | Teks |
|--------|------|
| Label | Bagikan kekayaan saya |
| Aktif | Anggota keluarga melihat total aset dan hutang Anda — bukan transaksi atau isi tiap akun. |
| Nonaktif | Kekayaan Anda tidak dihitung di keluarga. |
| Pengecualian | Sembunyikan dari keluarga |

**Jangan memakai kosakata izin.** Model berbagi kami bukan ACL — tidak ada "Dapat melihat" atau "Dapat mengelola" per objek. Menampilkan istilah itu di UI akan menjanjikan kontrol yang tidak ada.

Istilah yang **dilarang muncul di UI**: `Public` · `Private Access Control` · `RBAC` · `Permission scope` · `View access` · `Manage access`.

### 6.4 Transfer ke anggota

```
Transfer ke Istri
Dari  BCA
Ke    Istri › BRI Istri
```

Transfer **tidak pernah** disebut pemasukan atau pengeluaran, di layar mana pun.

## 7. Anggaran

```
Anggaran · Terpakai · Sisa · Batas
```

Status memakai bahasa manusia, bukan tingkat severity:

| Keadaan | Teks |
|---------|------|
| < 80% | Aman |
| 80–99% | Hampir habis |
| ≥ 100% | Melewati anggaran |

Jangan: `Warning` · `Critical` · `Exceeded threshold`.

## 8. Tabungan & Aset

**Tabungan** — tampilkan nominal, bukan persentase saja:

```
Rp8.000.000 dari Rp20.000.000
Sisa Rp12.000.000 · 8 bulan lagi
```

Lebih berguna daripada `40% completed`. Persentase boleh menyertai, tidak menggantikan.

Istilah: `Target tabungan` · `Terkumpul` · `Sisa` · `Kontribusi` · `Tanggal target`

**Emas:** `Berat` · `Harga beli` · `Harga saat ini` · `Nilai saat ini` · `Keuntungan`

**Deposito:** `Pokok` · `Bunga` · `Tanggal mulai` · `Jatuh tempo` · `Estimasi nilai saat jatuh tempo`

Keuntungan yang belum dijual disebut **"Keuntungan belum terealisasi"** — bukan "unrealized gain".

## 9. Catatan Penerapan

Glosarium ini sudah diterapkan ke seluruh dokumen dan task. Dua hal yang perlu diingat saat menulis kode:

**Istilah UI ≠ identifier kode.** Tabel tetap `wallets`, kolom tetap `wallet_id`, rute tetap `/wallets` dan `/wealth`, komponen tetap `WalletPicker`. Yang berubah hanya teks yang dilihat pengguna. Menerjemahkan identifier hanya akan memutus hubungan antara kode dan skema.

**`formatIDR` merapatkan `Rp`.** Lihat §4 — `Rp8.000.000`, bukan `Rp 8.000.000`. Ini berbeda dari kebiasaan menulis dengan spasi, dan test format harus memakai bentuk baru.

## 10. Checklist Review

Dijalankan pada setiap teks yang terlihat pengguna, sebelum rilis:

- [ ] Terdengar seperti tulisan manusia, bukan terjemahan.
- [ ] Tidak ada kalimat yang bisa dipendekkan tanpa kehilangan makna.
- [ ] Maksudnya langsung tertangkap tanpa dibaca dua kali.
- [ ] Istilah cocok dengan glosarium §3 — tidak ada sinonim liar.
- [ ] Tidak ada istilah internal §3.2 yang bocor.
- [ ] Tidak ada jargon finansial yang tidak dipakai orang sehari-hari.
- [ ] Tidak ada teks yang mengulang apa yang sudah terlihat di layar.
- [ ] Setiap CTA memakai kata kerja yang jelas.
- [ ] Format angka dan tanggal mengikuti §4.
- [ ] Tidak ada dialog untuk aksi yang bisa diurungkan.
- [ ] Error menyebut tindakan pemulihan; error finansial menyebut status data.
- [ ] Tone sama di seluruh aplikasi — tidak ada layar yang tiba-tiba formal.

**Cara termurah menjalankannya:** baca seluruh teks satu layar berturut-turut, keras-keras. Kalimat yang terasa aneh saat diucapkan hampir selalu juga aneh saat dibaca.
