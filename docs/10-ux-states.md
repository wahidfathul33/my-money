# 09 — UX States

Setiap layar punya lebih dari satu keadaan. Yang tidak dirancang akan muncul apa adanya — dan biasanya buruk.

> Dokumen ini mengatur **kapan** sebuah keadaan muncul dan apa perilakunya. **Kata-katanya** diatur [08-copywriting](08-copywriting.md); bila berbeda, 08 yang berlaku.

## 1. Matriks Keadaan

| Layar | Empty | Loading | Error | Kondisi khusus |
|-------|-------|---------|-------|----------------|
| Dashboard | Belum ada dompet · belum ada transaksi | Skeleton | Gagal muat + coba lagi | Belum cukup data untuk delta |
| Transaksi | Belum pernah ada · filter kosong | Skeleton daftar | Gagal muat | Gagal muat halaman berikutnya |
| Dompet | Belum ada dompet | Skeleton kartu | Gagal muat | Semua dompet diarsipkan |
| Savings | Belum ada goal | Skeleton | Gagal muat | Semua goal selesai |
| Emas | Belum ada kepemilikan | Skeleton | Gagal muat | Harga sudah basi (> 30 hari) |
| Deposito | Belum ada deposito | Skeleton | Gagal muat | Semua sudah cair |
| Hutang | Belum ada hutang | Skeleton | Gagal muat | Semua lunas |
| Budget | Belum ada budget | Skeleton | Gagal muat | Semua budget lewat batas |
| Laporan | Data tidak cukup | Skeleton chart | Gagal muat | Satu kategori mendominasi |
| Net worth | Belum ada snapshot | Skeleton | Gagal muat | Riwayat < 2 titik |
| Daftar household | Belum punya household | Skeleton | Gagal muat | Punya undangan tertunda |
| Ringkasan keluarga | Baru dibuat · belum ada yang berbagi | Skeleton | Gagal muat / bukan anggota (404) | Hanya satu anggota |
| Pengeluaran keluarga | Belum ada transaksi bertanda | Skeleton daftar | Gagal muat | Hanya satu anggota yang menandai |
| Anggota | — (selalu ada ≥ 1) | Skeleton | Gagal muat | Ada undangan kedaluwarsa |
| Kekayaan keluarga | Belum ada yang mengaktifkan `share_wealth` | Skeleton | Gagal muat | Hanya sebagian anggota berbagi |
| Tabungan bersama | Belum ada goal | Skeleton | Gagal muat | Hanya satu anggota berkontribusi |
| Aktivitas | Tidak ada yang ditulis anggota lain | Skeleton | Gagal muat | Semua sudah ditinjau |
| Yang saya bagikan | Tidak membagikan apa pun | Skeleton | Gagal muat | Anggota di beberapa household |

## 2. Empty State

Anatominya: ikon · judul · satu kalimat penjelas · satu aksi primer. Tidak lebih.

**Aturannya:** empty state menjelaskan *nilai* dari mengisinya, bukan sekadar menyatakan kekosongan. "Belum ada data" tidak menolong siapa pun.

| Konteks | Judul | Deskripsi | Aksi |
|---------|-------|-----------|------|
| Belum ada dompet | Mulai dari dompet pertama | Dompet adalah tempat uang Anda berada — rekening bank, dompet tunai, atau e-wallet. | Buat Dompet |
| Belum ada transaksi | Catat transaksi pertama | Pencatatan harian yang konsisten membuat semua laporan di sini jadi berguna. | Catat Transaksi |
| Filter kosong | Tidak ada yang cocok | Tidak ada transaksi pada filter ini. Coba ubah rentang tanggal atau kategorinya. | Reset Filter |
| Belum ada goal | Punya target tabungan? | Tetapkan targetnya, lalu lihat progresnya bertambah setiap kali menabung. | Buat Target |
| Belum ada emas | Catat kepemilikan emas | Lacak berat, harga beli, dan nilai emas Anda saat ini. | Tambah Emas |
| Belum ada deposito | Belum ada deposito | Catat pokok dan jatuh temponya, lalu kami hitung estimasi bunga setelah pajak. | Tambah Deposito |
| Belum ada hutang | Tidak ada hutang tercatat | Catat hutang dan piutang supaya kekayaan bersih Anda mencerminkan kondisi sebenarnya. | Tambah Catatan |
| Belum ada budget | Batasi pengeluaran per kategori | Tetapkan anggaran bulanan, lalu kami ingatkan saat mendekati batas. | Buat Anggaran |
| Semua goal selesai | Semua target tercapai | Empat target tabungan sudah tercapai. Waktunya menetapkan yang berikutnya? | Buat Target Baru |
| Data laporan kurang | Belum cukup data | Laporan muncul setelah ada transaksi minimal 7 hari. | Catat Transaksi |
| Belum punya household | Kelola keuangan bersama | Lihat gambaran keuangan keluarga tanpa menggabungkan rekening. Dompet tetap milik masing-masing. | Buat Keluarga |
| Belum membagikan apa pun | Semua data Anda privat | Anda belum membagikan apa pun ke keluarga. Aktifkan kapan Anda siap, dan matikan kapan saja. | — (informatif) |
| Aktivitas kosong | Tidak ada yang perlu ditinjau | Kalau anggota keluarga mencatat transfer ke rekening Anda, catatannya muncul di sini. | — (informatif) |
| Tabungan bersama kosong | Menabung bersama | Tetapkan target bersama. Setiap orang berkontribusi dari rekeningnya masing-masing. | Buat Target Bersama |

**Yang tidak dilakukan:** ilustrasi besar. Ilustrasi memakan ruang layar mahal di 360px dan menua dengan buruk. Ikon 48px di lingkaran `--color-brand-subtle` sudah cukup.

### 2.1 Ringkasan keluarga yang baru dibuat

Ini empty state terpenting di seluruh lapisan household, dan ia tidak boleh berupa satu kalimat "belum ada data".

Household yang baru dibuat secara teknis kosong: tidak ada transaksi bertanda, tidak ada item yang disertakan, mungkin belum ada anggota lain. Kalau layarnya hanya menyatakan kekosongan itu, orang akan menyimpulkan fiturnya tidak berfungsi dan tidak kembali.

Sebagai gantinya, tampilkan **daftar langkah dengan progres**:

```
┌───────────────────────────────────┐
│  Keluarga Wahid siap digunakan    │
│  Selesaikan 3 langkah berikut     │
│                                   │
│  ✓ Buat keluarga                  │
│                                   │
│  ○ Undang anggota                 │
│    Ajak pasangan atau anggota     │
│    keluarga lain bergabung.       │
│                     [Undang →]    │
│                                   │
│  ○ Tandai pengeluaran keluarga    │
│    Aktifkan 🏠 saat mencatat, atau│
│    tandai transaksi yang sudah ada│
│                [Pilih transaksi →]│
│                                   │
│  ○ Bagikan yang ingin dihitung    │
│    Pilih dompet atau aset yang    │
│    masuk kekayaan keluarga.       │
│                      [Atur →]     │
└───────────────────────────────────┘
```

Langkah menghilang satu per satu saat selesai, dan seluruh blok hilang setelah ketiganya tuntas. Ini mengubah layar kosong menjadi jalur yang jelas, dan tiap langkah menghasilkan sesuatu yang langsung terlihat di layar yang sama.

Tombol "Pilih transaksi" penting: kebanyakan orang membuat household **setelah** sudah mencatat berminggu-minggu. Memaksa mereka menunggu transaksi baru untuk melihat laporan keluarga terisi adalah cara yang tidak perlu untuk kehilangan mereka. Layar ini menawarkan penandaan massal atas transaksi yang sudah ada.

## 3. Loading

**Tiga strategi, dipilih berdasarkan konteks:**

| Situasi | Pola | Alasan |
|---------|------|--------|
| Muat halaman awal | Skeleton yang meniru tata letak akhir | Mencegah layout shift; terasa lebih cepat |
| Muat halaman berikutnya (infinite scroll) | Spinner di bawah daftar | Konten yang ada tetap terbaca |
| Mengirim form | Tombol jadi spinner + nonaktif | Menahan pengiriman ganda |
| Navigasi antar rute | Progress bar tipis di atas | Umpan balik langsung tanpa mengosongkan layar |
| Aksi optimistik (hapus, undo) | Terapkan langsung, batalkan bila gagal | Aksi yang hampir pasti berhasil tidak perlu menunggu |

**Aturan skeleton:**
- Skeleton harus berukuran sama dengan konten aslinya. Skeleton yang salah ukuran menyebabkan layout shift — persis yang mau dicegah.
- Animasi pulse, bukan shimmer bergerak. Shimmer menarik perhatian ke sesuatu yang tidak dapat ditindaklanjuti.
- Baris skeleton pada daftar: 5 buah. Lebih banyak terasa seperti aplikasi sedang macet.
- Untuk nominal uang, skeleton memakai lebar tetap sesuai lebar tipikal (`Rp00.000.000`), bukan lebar acak.

**Ambang batas:**
- < 200ms: tanpa indikator apa pun. Menampilkan spinner yang langsung hilang justru terasa lebih lambat.
- 200ms–2s: skeleton atau spinner.
- \> 2s: skeleton + teks status ("Menyiapkan laporan…").
- \> 10s: anggap gagal, tampilkan error dengan opsi coba lagi.

## 4. Error

### 4.1 Kategori

| Jenis | Penyajian | Pemulihan |
|-------|-----------|-----------|
| Validasi (per field) | Teks merah di bawah field + `aria-describedby` | Perbaiki input |
| Validasi (form) | Banner di atas form | Perbaiki input |
| Jaringan | Banner tetap "Anda sedang offline" | Otomatis coba lagi saat online |
| Server (5xx) | Empty state dengan tombol coba lagi | Coba lagi |
| Tidak ditemukan (404) | Halaman khusus | Kembali ke daftar |
| Tidak berwenang (403) | Redirect ke login | Login ulang |
| Konflik | Toast + minta muat ulang | Muat ulang |
| Rate limited | Toast dengan hitung mundur | Tunggu |

### 4.2 Aturan penulisan pesan

1. Sebutkan apa yang terjadi, bukan kode teknisnya.
2. Sebutkan apa yang harus dilakukan pengguna.
3. Kalau menyangkut uang, sebutkan status datanya.
4. Jangan menyalahkan pengguna.

```
Buruk:  "Error: 500 Internal Server Error"
Baik:   "Gagal menyimpan transaksi. Data Anda tidak berubah — coba lagi."

Buruk:  "Invalid input"
Baik:   "Nominal harus lebih dari Rp0."

Buruk:  "Insufficient funds"
Baik:   "Saldo BCA tidak cukup. Tersedia Rp1.240.000."
```

### 4.3 Error khusus finansial

Ini yang paling penting ditangani dengan benar.

| Situasi | Perilaku |
|---------|----------|
| Simpan gagal, tidak jelas apakah tersimpan | "Tidak yakin transaksi tersimpan. Periksa riwayat sebelum mencatat ulang." + tombol menuju riwayat |
| Kirim ganda tertangkap idempotency | Perlakukan sebagai sukses. Jangan tampilkan error — dari sisi pengguna, hasilnya memang benar. |
| Saldo tampak salah setelah aksi | Banner "Angka mungkin belum terbarui" + tombol segarkan |
| Rekonsiliasi menemukan selisih | Banner di dashboard: "Ada selisih pencatatan pada dompet X. Tinjau." |
| Rekening tujuan diarsipkan tepat sebelum menyimpan | "Rekening tujuan tidak tersedia. Minta {nama} memeriksa daftar rekeningnya." |
| Penerima menghapus sisinya | Pengirim melihat catatannya kehilangan pasangan, dengan penjelas di Aktivitas |
| Dikeluarkan dari household saat sedang membukanya | Redirect ke `/` dengan toast "Anda tidak lagi menjadi anggota keluarga ini." |
| Menandai transaksi ke household yang keanggotaannya baru dicabut | "Anda tidak lagi menjadi anggota keluarga ini." Transaksi tetap tersimpan tanpa tag. |
| Undangan kedaluwarsa saat diklik | Halaman khusus: "Undangan tidak berlaku lagi. Minta pengundang mengirim ulang." |

Baris terakhir sengaja tidak membedakan undangan kedaluwarsa, sudah dipakai, atau tidak pernah ada — pesan yang lebih spesifik akan mengonfirmasi bahwa sebuah token pernah sah.

**Catatan tentang transfer ke anggota:** kedua sisi ditulis dalam satu DB transaction, jadi tidak ada keadaan di mana uang "menggantung" atau hanya satu sisi tercatat. Kegagalan apa pun membatalkan keduanya. Yang mungkin terjadi setelahnya hanyalah penerima menghapus sisinya — dan itu terlihat jelas di kedua sisi.

Aturan yang mengikat semuanya: **jangan pernah biarkan pengguna menebak apakah uangnya berpindah.** Kalau sistem tidak tahu, katakan tidak tahu dan tunjukkan cara memeriksanya.

## 5. Konfirmasi & Aksi Destruktif

### 5.1 Kapan meminta konfirmasi

| Aksi | Konfirmasi? | Mekanisme |
|------|-------------|-----------|
| Hapus transaksi | Tidak | Terapkan langsung + undo 5 detik |
| Hapus dompet berisi transaksi | Ya | Dialog; tawarkan arsip sebagai gantinya |
| Arsip dompet | Tidak | Undo di toast |
| Hapus kategori terpakai | Ya | Dialog menjelaskan bahwa transaksi lama tetap ada |
| Tarik seluruh dana savings | Ya | Dialog dengan nominal |
| Jual emas | Ya | Dialog menampilkan proceeds + realized gain/loss |
| Cairkan deposito sebelum jatuh tempo | Ya | Dialog memperingatkan bunga bisa hangus |
| Tandai hutang dihapusbukukan | Ya | Dialog; ini mengubah net worth |
| Hapus akun | Ya, kuat | Ketik email untuk konfirmasi |
| Buang input form terisi | Ya | Dialog "Buang input?" |
| **Menandai transaksi ke household** | Tidak | Reversibel dengan satu tap |
| **Mengaktifkan `share_wealth`** | **Ya** | Dialog menyatakan persis apa yang akan terlihat |
| **Mengecualikan satu item** | Tidak | Menyempitkan cakupan, tidak melebarkannya |
| **Mematikan `share_wealth`** | Tidak | Terapkan langsung — penarikan akses tidak boleh punya friksi |
| **Berhenti berbagi semuanya** | Ya | Dialog menyebutkan household dan jumlah tag terdampak |
| **Mengeluarkan anggota** | Ya | Dialog menjelaskan apa yang terjadi pada datanya |
| **Keluar dari household** | Ya | Dialog + pilihan nasib tag transaksi |
| **Mengarsipkan household** | Ya | Dialog; sebutkan jumlah anggota terdampak |
| **Mengalihkan kepemilikan** | Ya | Tidak dapat dibatalkan sendiri setelahnya |
| **Mencatat transfer ke anggota** | **Ya** | Dialog menyatakan bahwa saldo penerima langsung berubah |
| **Menandai aktivitas sudah ditinjau** | Tidak | Reversibel; hanya menghilangkan lencana |
| **Memindahkan transfer masuk ke dompet lain** | Tidak | Edit biasa atas transaksi sendiri |
| **Menghapus transfer masuk yang ditulis orang lain** | Tidak | Void biasa + undo; pengirim melihatnya di Aktivitasnya |

Perhatikan asimetri antara **membagikan** (butuh konfirmasi) dan **mencabut** (tidak). Membuka akses sulit dibatalkan efeknya — orang mungkin sudah melihat datanya. Menutup akses tidak punya konsekuensi buruk. Menempatkan friksi hanya di satu arah adalah cara desain menyatakan sikapnya soal privasi.

### 5.1 Dialog mengaktifkan berbagi kekayaan

```
┌─────────────────────────────────┐
│  Bagikan kekayaan Anda ke       │
│  Keluarga Wahid?                │
│                                 │
│  Anggota keluarga akan melihat: │
│  • Total aset dan liabilitas    │
│    Anda, dan rinciannya per     │
│    jenis (kas, emas, deposito)  │
│                                 │
│  Mereka TIDAK akan melihat:     │
│  • Transaksi Anda               │
│  • Isi rekening per dompet      │
│  • Apa pun yang Anda kecualikan │
│                                 │
│  Anda dapat mematikannya kapan  │
│  saja, dan efeknya seketika.    │
│                                 │
│         [Batal]  [Bagikan]      │
└─────────────────────────────────┘
```

Bagian "TIDAK akan melihat" sama pentingnya dengan bagian pertama. Kekhawatiran orang saat diminta membagikan data keuangan biasanya lebih spesifik daripada yang mereka ucapkan — dan menjawabnya di depan lebih murah daripada kehilangan mereka di layar ini.

### 5.2 Dialog mencatat transfer ke anggota

```
┌─────────────────────────────────┐
│  Catat transfer Rp1.000.000    │
│  ke BRI Istri?                  │
│                                 │
│  • Saldo BCA Anda berkurang     │
│  • Saldo BRI Istri bertambah,   │
│    seketika                     │
│  • Istri melihatnya di Aktivitas│
│    dan dapat memindahkan atau   │
│    menghapusnya                 │
│                                 │
│  Catat hanya kalau uangnya      │
│  memang sudah Anda kirim.       │
│                                 │
│      [Batal]  [Catat]           │
└─────────────────────────────────┘
```

Kalimat terakhir yang paling penting. Aplikasi ini **mencatat** perpindahan uang, tidak melakukannya — dan satu-satunya cara pengguna salah paham adalah kalau tidak pernah dikatakan.

Ini satu dari sedikit aksi yang meminta konfirmasi meski dapat dibatalkan. Alasannya: efeknya jatuh pada buku besar orang lain, dan itu pantas ditegaskan sekali.

### 5.3 Dialog keluar dari household

```
┌─────────────────────────────────┐
│  Keluar dari Keluarga Wahid?    │
│                                 │
│  • Data keuangan Anda tetap     │
│    milik Anda dan tidak hilang  │
│  • Berbagi dompet dan aset      │
│    dicabut seketika             │
│  • Anda tidak lagi melihat      │
│    laporan keluarga             │
│                                 │
│  42 transaksi Anda ditandai ke  │
│  keluarga ini:                  │
│  ● Biarkan di laporan keluarga  │
│  ○ Lepaskan dari laporan        │
│                                 │
│         [Batal]  [Keluar]       │
└─────────────────────────────────┘
```

**Prinsipnya:** aksi yang dapat dibatalkan tidak butuh dialog — cukup undo. Aksi yang tidak dapat dibatalkan butuh dialog. Dialog untuk aksi yang bisa di-undo hanya melatih orang untuk menekan "Ya" tanpa membaca, yang justru membuat dialog yang penting jadi ikut diabaikan.

### 5.2 Anatomi dialog destruktif

```
┌─────────────────────────────────┐
│  Hapus dompet "BCA"?            │
│                                 │
│  Dompet ini punya 142 transaksi.│
│  Menghapusnya akan menghapus    │
│  seluruh riwayatnya permanen.   │
│                                 │
│  Arsipkan saja untuk menyembu-  │
│  nyikannya tanpa kehilangan     │
│  data.                          │
│                                 │
│  [Arsipkan]  [Batal] [Hapus]    │
└─────────────────────────────────┘
```

- Judul menyebut objek spesifiknya, bukan "Anda yakin?".
- Badan pesan menyebut konsekuensi konkret dengan angka.
- Tawarkan alternatif yang lebih aman kalau ada.
- Tombol destruktif memakai warna danger dan **bukan** tombol default.
- Kata kerja spesifik ("Hapus"), bukan "OK".

### 5.3 Undo

Undo lebih baik daripada konfirmasi kapan pun memungkinkan.

- Toast bertahan 5 detik dengan aksi "Urungkan".
- Undo pada transaksi membatalkan operasi void — memulihkan transaksi beserta ledger entry-nya, atomik.
- Toast tidak menutupi bottom nav: ia muncul di atasnya.
- Toast baru menggantikan yang lama; tidak menumpuk.

## 6. Sukses

Umpan balik sukses harus proporsional dengan usaha yang dikeluarkan.

| Aksi | Umpan balik |
|------|-------------|
| Simpan transaksi | Toast "Tersimpan" + undo. Sheet tertutup. Angka dashboard terupdate. |
| Buat dompet | Toast + dompet baru langsung tersorot di daftar |
| Target tabungan tercapai | Perayaan sekali: sheet dengan ring penuh + "Target tercapai!" |
| Hutang lunas | Toast "Lunas!" + kartu pindah ke bagian selesai |
| Impor/ekspor selesai | Toast + tautan unduh |

**Tidak ada konfeti.** Satu-satunya perayaan adalah saat savings goal tercapai atau hutang lunas, dan itu pun dalam bentuk sheet sederhana. Aplikasi keuangan yang terlalu antusias terasa tidak serius memegang uang Anda.

## 7. Offline & PWA

| Keadaan | Perilaku |
|---------|----------|
| Offline, membuka aplikasi | Tampilkan data ter-cache + banner "Offline — data per {waktu}" |
| Offline, coba simpan | Blokir kirim, pesan "Butuh koneksi untuk menyimpan" |
| Kembali online | Banner hilang, data disegarkan otomatis |
| Koneksi lambat (> 3s) | Pertahankan skeleton, tambah "Koneksi lambat…" |

**Antrean tulis offline sengaja tidak dibuat di MVP.** Sinkronisasi tulis yang tertunda membutuhkan resolusi konflik, dan konflik pada data finansial berisiko menghasilkan angka yang salah. Sampai ada resolusi konflik yang benar, menolak menyimpan lebih jujur daripada berjanji tersimpan dan gagal diam-diam.

## 8. Kasus Batas Data

| Kasus | Perilaku |
|-------|----------|
| Nominal sangat besar (> Rp1 M) | Singkat jadi "Rp1,25 M"; nilai penuh di tooltip / detail |
| Nama sangat panjang | Potong dengan elipsis, judul lengkap di `title` |
| Nol transaksi bulan ini tapi ada di bulan lain | Tampilkan periode kosong dengan tautan ke periode terakhir yang ada |
| Net worth negatif | Tampilkan apa adanya dengan warna negatif. Jangan disembunyikan. |
| Progress goal > 100% | Batasi bar di 100%, tampilkan persentase sebenarnya sebagai teks |
| Target date sudah lewat | Status "Target terlewat", saran kontribusi = sisa penuh |
| Harga emas belum pernah diisi | Sembunyikan valuasi, tampilkan CTA "Masukkan harga saat ini" |
| Satu kategori > 80% pengeluaran | Chart tetap benar; tambah catatan "Didominasi {kategori}" |
| Semua dompet diarsipkan | Perlakukan seperti belum ada dompet, tawarkan pemulihan |
