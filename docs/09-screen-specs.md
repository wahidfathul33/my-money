# 08 — Screen Specs

Spesifikasi per layar. Wireframe ASCII menunjukkan tata letak mobile pada 375px.

> **Teks di dokumen ini bersifat ilustratif.** Kata dan format angka yang mengikat ada di [08-copywriting](08-copywriting.md). Bila keduanya berbeda, 08 yang berlaku — sebagian wireframe di sini masih memakai istilah dan format lama.

## 1. Home / Dashboard — `/`

```
┌───────────────────────────────────┐
│ Selamat pagi, Dimas        [ⓘ]   │  greeting + avatar
│                                   │
│ ╭───────────────────────────────╮ │
│ │ Kekayaan Bersih               │ │  HERO
│ │ Rp187.450.000                │ │  text-display
│ │ ↗ +Rp4.200.000 (2,3%) bulan  │ │  delta vs snapshot awal bulan
│ │ ┈┈┈┈┈┈╱‾‾╲┈┈╱‾‾‾              │ │  sparkline 30 hari
│ ╰───────────────────────────────╯ │
│                                   │
│ ╭─────────────╮ ╭───────────────╮ │
│ │ Kas         │ │ Bulan Ini     │ │  dua tile berdampingan
│ │ Rp24,0 jt  │ │ +12,5 / −8,3  │ │
│ ╰─────────────╯ ╰───────────────╯ │
│                                   │
│ Anggaran                 Lihat →  │  hanya tampil bila ada
│ ╭───────────────────────────────╮ │  yang ≥ 80% terpakai
│ │ Makan & Minum  ▓▓▓▓▓▓▓░░  86% │ │
│ │ Rp1,72 jt dari Rp2,00 jt    │ │
│ ╰───────────────────────────────╯ │
│                                   │
│ Perlu Perhatian                   │  hanya bila ada yang jatuh
│ ╭───────────────────────────────╮ │  tempo ≤7 hari / telat
│ │ ⚠ Cicilan motor  jatuh tempo  │ │
│ │   3 hari lagi   Rp1.250.000  │ │
│ ╰───────────────────────────────╯ │
│                                   │
│ Tabungan                 Lihat →  │
│ ╭───────────────────────────────╮ │
│ │ ◐ Dana Darurat      Rp8/20jt │ │
│ │   40% · sisa 8 bulan          │ │
│ ╰───────────────────────────────╯ │
│                                   │
│ Transaksi Terakhir       Lihat →  │
│  🍜 Makan siang       −Rp45.000  │
│  💰 Gaji            +Rp15.000.000│
│  ⇄  Bank → GoPay      Rp500.000  │
│  🚗 Bensin           −Rp100.000  │
│  🛒 Belanja bulanan  −Rp850.000  │
│                                   │
│         [ruang untuk nav]         │
├───────────────────────────────────┤
│  🏠    📋    ╭─╮    💎    ⋯      │
└───────────────────────────────────┘
```

**Aturan tampil:**
- Bagian "Anggaran" tersembunyi seluruhnya kalau tidak ada budget yang ≥ 80%. Budget yang sehat tidak butuh perhatian.
- "Perlu Perhatian" tersembunyi kalau tidak ada jatuh tempo dalam 7 hari dan tidak ada yang telat.
- "Tabungan" menampilkan maksimal 2 goal, diurut dari yang terdekat target datenya.
- "Transaksi Terakhir" tepat 5 item.

**Data:** dirender di server. Satu query gabungan mengambil saldo dompet, agregat bulan berjalan, snapshot terbaru, dan 5 transaksi terakhir. Sisanya (budget yang bermasalah, jatuh tempo) diambil paralel.

**Delta net worth** membandingkan snapshot hari ini dengan snapshot terakhir bulan sebelumnya. Kalau riwayat < 2 snapshot, delta disembunyikan — bukan ditampilkan sebagai 0%.

## 2. Add Transaction — bottom sheet

```
┌───────────────────────────────────┐
│              ▂▂▂▂                 │  grabber
│  ╭─────────┬─────────┬─────────╮  │
│  │Pengeluar│ Pemasuk │ Transfer│  │  segmented, default Pengeluaran
│  ╰─────────┴─────────┴─────────╯  │
│                                   │
│              Rp                   │
│         1.500.000                 │  text-display, autofokus
│                                   │
│  Kategori                         │
│  ╭────╮ ╭────╮ ╭────╮ ╭────╮     │  chip "sering dipakai",
│  │🍜  │ │🚗  │ │🛒  │ │ ⋯  │     │  4 teratas + "lainnya"
│  ╰────╯ ╰────╯ ╰────╯ ╰────╯     │
│                                   │
│  💳 BCA         2 Sep  🏠  📝    │  dompet · tanggal · keluarga · catatan
│                                   │
│  ┌─────┬─────┬─────┬─────┐        │
│  │  1  │  2  │  3  │  ⌫  │        │
│  ├─────┼─────┼─────┼─────┤        │
│  │  4  │  5  │  6  │  +  │        │
│  ├─────┼─────┼─────┼─────┤        │
│  │  7  │  8  │  9  │  −  │        │
│  ├─────┼─────┼─────┼─────┤        │
│  │  0  │ 000 │  .  │  ✓  │        │
│  └─────┴─────┴─────┴─────┘        │
└───────────────────────────────────┘
```

**Perilaku:**
- Terbuka dengan nominal terfokus dan keypad aktif. Tidak ada tap tambahan untuk mulai mengetik.
- Kategori: 4 yang paling sering dipakai 30 hari terakhir, ditambah "lainnya" yang membuka grid penuh.
- Dompet terisi dari `users.default_wallet_id`, atau yang terakhir dipakai kalau belum ada default.
- Tanggal default hari ini. Tap membuka pemilih tanggal ringkas (Hari ini / Kemarin / pilih).
- Tombol `✓` mengirim. Nonaktif saat nominal = 0.
- `+` dan `−` melakukan aritmetika berurutan: `45000 + 12000` → tekan `✓` mengevaluasi lalu mengirim.
- Setelah tersimpan: sheet tertutup, toast "Tersimpan" dengan aksi "Urungkan" selama 5 detik.
- Menutup dengan nominal terisi → konfirmasi "Buang input?".

**Toggle keluarga (🏠)** hanya muncul bila user adalah anggota minimal satu household dengan peran ≥ `member`. Bagi pengguna tanpa household, baris meta terlihat persis seperti sebelumnya — tidak ada jejak fitur yang tidak mereka pakai.

- Aktif/nonaktif dengan satu tap. Ikon terisi berarti ditandai.
- Bila user punya lebih dari satu household, tap membuka pemilih ringkas.
- Pilihan terakhir diingat **per kategori**: setelah "Tagihan" beberapa kali ditandai keluarga, ia menyala otomatis untuk transaksi Tagihan berikutnya. Ini menghilangkan tap tambahan pada kasus yang paling sering.
- Toggle tidak pernah menggeser posisi tombol Simpan. Baris meta punya tinggi tetap.

**Mode transfer** mengganti baris kategori dengan pemilih asal → tujuan, dan menyembunyikan kategori sepenuhnya. Bila user punya household, muncul segmented kecil: **Antar dompet saya** | **Ke anggota keluarga**.

```
┌───────────────────────────────────┐
│  ╭──────────────┬──────────────╮  │
│  │ Dompet saya  │  Ke anggota  │  │
│  ╰──────────────┴──────────────╯  │
│                                   │
│              Rp1.000.000         │
│                                   │
│  Dari   💳 BCA                    │
│  Ke     👤 Istri › 🏦 BRI Istri   │
│                                   │
│  ℹ️ Saldo Istri langsung berubah.  │
│     Ia akan melihatnya di         │
│     Aktivitas.                    │
└───────────────────────────────────┘
```

**Pengirim memilih anggota, lalu rekening tujuannya** — supaya catatannya jatuh di rekening yang benar-benar menerima uangnya. Menebak lewat rekening default akan menaruhnya di tempat yang salah dan memaksa penerima memindahkannya setiap kali.

Pemilih rekening menampilkan **nama dan jenis saja**. Saldo tidak pernah ikut, bahkan tidak diambil dari server — lihat [12 §4.3](12-security-and-auth.md#43-dompet-yang-boleh-dipilih-sebagai-tujuan-transfer).

Kartu kredit tidak muncul sebagai tujuan: mentransfer ke kartu kredit adalah pembayaran tagihan, alur yang berbeda.

**Kenapa keypad kustom dan bukan keyboard OS?** Tinggi sheet jadi dapat diprediksi (keyboard OS tingginya berbeda-beda dan sering menutupi tombol simpan), tombol kalkulator bisa disisipkan, dan `000` menghemat banyak ketukan pada nominal rupiah.

## 3. Transactions — `/transactions`

```
┌───────────────────────────────────┐
│ Transaksi                    [🔍] │
│ ╭───────────────────────────────╮ │
│ │ ‹  September 2026  ›          │ │  PeriodPicker
│ ╰───────────────────────────────╯ │
│  Masuk 15,0 jt · Keluar 8,3 jt   │  ringkasan periode
│  ╭──────╮╭──────╮╭──────╮        │  chip filter
│  │Semua ││Dompet││Kateg.│        │
│  ╰──────╯╰──────╯╰──────╯        │
│                                   │
│  Hari ini              −145.000   │  header hari + subtotal
│  🍜 Makan siang                   │
│     BCA · 12:30       −Rp45.000  │
│  🚗 Bensin                        │
│     Tunai · 08:15    −Rp100.000  │
│                                   │
│  Kemarin             +14.150.000  │
│  💰 Gaji September                │
│     BCA            +Rp15.000.000 │
│  ⇄  Transfer                      │
│     BCA → GoPay        Rp500.000 │  netral, tanpa tanda
│  🛒 Belanja bulanan               │
│     BCA              −Rp850.000  │
│                                   │
│  1 September         −1.200.000   │
│  …                                │
└───────────────────────────────────┘
```

**Perilaku:**
- Dikelompokkan per hari dalam zona waktu user, terbaru dulu.
- Subtotal harian = income − expense. Transfer dikecualikan.
- Infinite scroll dengan cursor. Batch 30.
- Filter di search param, sehingga bisa dibagikan dan bertahan saat back.
- Pencarian: buka field di header, cari pada catatan (trigram) dan nama kategori, debounce 300ms, minimal 2 karakter.
- Tap item → sheet detail dengan aksi Edit / Hapus.
- Geser kiri pada item → aksi Hapus cepat (dengan undo).

**Empty state** dibedakan: belum pernah ada transaksi sama sekali (mengajak buat pertama) vs filter tidak menemukan apa-apa (menawarkan reset filter). Lihat [10-ux-states.md](10-ux-states.md).

## 4. Kekayaan Hub — `/wealth`

Lihat [02-information-architecture.md](02-information-architecture.md#5-hub-kekayaan) untuk tata letak. Rincian tambahan:

- Setiap baris rincian dapat ditap dan menuju modulnya.
- Piutang selalu ditampilkan di bawah pemisah, dengan label "tidak dihitung dalam kekayaan bersih" (atau "termasuk" bila settingnya aktif).
- Kartu kredit bersaldo tidak nol muncul di bawah Liabilitas, bukan di Kas.

## 5. Savings — `/wealth/savings`

```
┌───────────────────────────────────┐
│ ‹ Tabungan                   [+]  │
│  Total tersimpan  Rp38.000.000   │
│                                   │
│ ╭───────────────────────────────╮ │
│ │  ◕   Dana Darurat             │ │
│ │ 40%  Rp8,0 jt / Rp20,0 jt   │ │
│ │      ▓▓▓▓░░░░░░               │ │
│ │      Sisa Rp12,0 jt · 8 bln  │ │
│ │      Saran: Rp1,5 jt/bulan   │ │
│ ╰───────────────────────────────╯ │
│ ╭───────────────────────────────╮ │
│ │  ◔   Liburan Jepang           │ │
│ │ 22%  Rp6,6 jt / Rp30,0 jt   │ │
│ ╰───────────────────────────────╯ │
└───────────────────────────────────┘
```

**Detail goal** (`/wealth/savings/[id]`) menampilkan ring progress besar, tombol Tambah Dana / Tarik Dana, dan riwayat kontribusi berkelompok per bulan.

Sheet "Tambah Dana" memuat catatan tetap: *"Ini memindahkan uang dari dompet ke tabungan. Kekayaan bersih Anda tidak berubah."* Kalimat ini mencegah pertanyaan berulang yang pasti muncul kalau tidak ada.

## 6. Assets — `/wealth/assets`

Ringkasan dengan dua bagian: Emas dan Deposito. Masing-masing menampilkan nilai total dan gain/loss.

### Emas — `/wealth/assets/gold`

```
┌───────────────────────────────────┐
│ ‹ Emas                    [Beli]  │
│  Total 55,0 gram                  │
│  Rp65.450.000                    │
│  ↗ +Rp5.450.000 (+9,1%)          │
│                                   │
│  Harga buyback  Rp1.190.000/gr   │
│  Diperbarui 2 hari lalu  [Ubah]   │
│                                   │
│  Kepemilikan                      │
│  ╭───────────────────────────────╮│
│  │ Antam 10 gr · 12 Mar 2026     ││
│  │ Beli Rp1.050.000/gr          ││
│  │ Nilai Rp11.900.000  ↗ +13,3% ││
│  ╰───────────────────────────────╯│
│  …                                │
│                                   │
│  [Jual Emas]                      │
└───────────────────────────────────┘
```

Badge "Diperbarui N hari lalu" berubah menjadi peringatan setelah 30 hari. Tooltip pada "Harga buyback" menjelaskan sekali perbedaannya dengan harga beli.

### Deposito — `/wealth/assets/deposits`

Setiap kartu menampilkan: bank · pokok · suku bunga · jatuh tempo · sisa hari · estimasi bunga bersih. Estimasi bunga memakai warna teks sekunder dan diberi label "estimasi setelah pajak 20%" — ia bukan uang yang sudah Anda miliki.

Deposito jatuh tempo dalam 7 hari mendapat penanda dan muncul di "Perlu Perhatian" dashboard.

## 7. Debt & Receivable — `/wealth/debts`

Tab: Hutang | Piutang.

```
┌───────────────────────────────────┐
│ ‹ Hutang & Piutang           [+]  │
│  ╭──────────┬──────────╮          │
│  │  Hutang  │ Piutang  │          │
│  ╰──────────┴──────────╯          │
│  Total hutang  Rp15.000.000      │
│                                   │
│  ⚠ Jatuh tempo segera             │
│  ╭───────────────────────────────╮│
│  │ Cicilan motor — Adira         ││
│  │ Sisa Rp12,5 jt dari Rp30 jt ││
│  │ ▓▓▓▓▓▓░░░░  jatuh tempo 3 hari││
│  │              [Catat Bayar]    ││
│  ╰───────────────────────────────╯│
│                                   │
│  Aktif                            │
│  ╭───────────────────────────────╮│
│  │ Pinjaman — Budi               ││
│  │ Sisa Rp2,5 jt · 20 Okt       ││
│  ╰───────────────────────────────╯│
└───────────────────────────────────┘
```

Yang telat bayar tampil paling atas dengan aksen `--color-danger`. Progress bar menunjukkan proporsi terbayar — memberi rasa kemajuan, bukan hanya beban.

## 8. Net Worth — `/wealth/net-worth`

```
┌───────────────────────────────────┐
│ ‹ Kekayaan Bersih                 │
│                                   │
│  Rp187.450.000                   │
│  ↗ +Rp4.200.000 (2,3%) bulan ini │
│                                   │
│  ╭──────╮╭──────╮╭──────╮╭─────╮ │
│  │  3B  ││  6B  ││  1T  ││Semua│ │
│  ╰──────╯╰──────╯╰──────╯╰─────╯ │
│  ╭───────────────────────────────╮│
│  │        ╱‾‾╲    ╱‾‾‾‾          ││  area chart
│  │   ╱‾‾‾╯    ╲__╱               ││
│  ╰───────────────────────────────╯│
│                                   │
│  Komposisi Aset                   │
│  ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░            │  stacked bar horizontal
│  ■ Deposito  Rp75,0 jt    37%   │  (bukan pie — lebih
│  ■ Emas      Rp65,5 jt    32%   │   mudah dibaca di mobile)
│  ■ Tabungan  Rp38,0 jt    19%   │
│  ■ Kas       Rp24,0 jt    12%   │
│                                   │
│  Liabilitas                       │
│  ■ Hutang    Rp15,0 jt          │
│                                   │
│  Piutang (tidak dihitung)         │
│    Rp3,0 jt          [Sertakan]  │
└───────────────────────────────────┘
```

Setiap baris komposisi dapat ditap untuk menuju modulnya — inilah "penelusuran" yang membuat net worth dapat dipercaya. Kalau angkanya terasa aneh, user bisa menelusurinya sampai transaksi asal.

Stacked bar dipilih ketimbang pie: pada lebar 360px, pie chart dengan 5 irisan dan legenda tidak terbaca, sementara bar horizontal ditambah daftar berlabel terbaca sempurna.

## 9. Reports — `/reports`

Bagian, semuanya dalam periode terpilih:
1. **Income vs Expense** — bar chart berkelompok, 6 bulan terakhir.
2. **Pengeluaran per kategori** — bar horizontal terurut menurun, dengan persentase. Bukan pie.
3. **Kategori terbesar** — 3 teratas dengan perbandingan terhadap bulan lalu.
4. **Arus kas** — line chart saldo kumulatif.
5. **Pertumbuhan tabungan** — total tabungan dari waktu ke waktu.

**Aturan chart di mobile:**
- Tidak ada horizontal scroll. Kalau data tidak muat, kurangi kategorinya (kelompokkan ekor menjadi "Lainnya"), jangan gulir.
- Maksimal 6 seri; sisanya digabung.
- Label sumbu dirotasi 0°. Kalau tidak muat, persingkat (`Sep` bukan `September`).
- Selalu ada tabel data di bawah chart. Chart untuk pola, angka untuk kepastian.

## 10. Dompet — `/wallets`

Daftar kartu dompet berkelompok per jenis, dengan total per kelompok. Tekan-lama untuk mengurutkan ulang. Kartu kredit dikelompokkan terpisah dan diberi label "Liabilitas".

Detail dompet menampilkan saldo, transaksi dompet itu, dan aksi: Edit · Sesuaikan Saldo · Arsipkan.

"Sesuaikan Saldo" untuk saat saldo asli berbeda dengan yang tercatat. Ia membuat `adjustment` ledger entry sebesar selisihnya — bukan menimpa saldo. Selisihnya terlihat di riwayat sebagai "Penyesuaian saldo", jujur soal adanya koreksi.

## 11. Budgets — `/budgets`

Daftar budget periode berjalan dengan progress bar, diurut dari persentase terpakai tertinggi. Yang lewat batas di atas. Ringkasan di header: total dianggarkan, total terpakai, sisa.

Tap → sheet edit. Toggle "Ulangi setiap bulan" aktif secara default.

## 12. Ringkasan Keluarga — `/household/[id]`

```
┌───────────────────────────────────┐
│ [🏠 Keluarga Wahid ▾]        [⚙️] │  context switcher
│                                   │
│  September 2026        ‹    ›     │
│ ╭───────────────────────────────╮ │
│ │ Pengeluaran Keluarga          │ │
│ │ Rp7.000.000                  │ │
│ │ Masuk Rp22,0 jt · Sisa 15,0jt│ │
│ ╰───────────────────────────────╯ │
│                                   │
│  Siapa Membayar Apa               │
│  Wahid   ▓▓▓▓▓▓▓▓▓▓▓░░  Rp4,0 jt │
│  Istri   ▓▓▓▓▓▓▓▓░░░░░  Rp3,0 jt │
│                                   │
│  Per Kategori            Lihat →  │
│  🏠 Tagihan             Rp2,4 jt │
│  🍜 Makan & Minum       Rp2,1 jt │
│  🛒 Belanja             Rp1,6 jt │
│                                   │
│  Anggaran Keluarga       Lihat →  │
│  ╭───────────────────────────────╮│
│  │ Makan & Minum ▓▓▓▓▓▓▓░░  84%  ││
│  │ Rp2,1 jt dari Rp2,5 jt      ││
│  ╰───────────────────────────────╯│
│                                   │
│  Tabungan Bersama        Lihat →  │
│  ╭───────────────────────────────╮│
│  │ ◐ Liburan Keluarga    40%     ││
│  │   Rp8,0 jt / Rp20,0 jt      ││
│  │   Wahid 5,0jt · Istri 3,0jt   ││
│  ╰───────────────────────────────╯│
│                                   │
│  Kekayaan Keluarga       Lihat →  │
│  Wahid  165,0 jt · Istri  80,0 jt │
│  Total (2 dari 3)  Rp245.000.000 │
│                                   │
│  Anggota (3)             Lihat →  │
│  👤 Wahid · 👤 Istri · 👤 Adi     │
└───────────────────────────────────┘
```

**Aturan tampil:**
- Bagian yang belum punya data disembunyikan, kecuali pada household yang baru dibuat — di sana justru semuanya ditampilkan sebagai daftar langkah (lihat [10-ux-states.md](10-ux-states.md)).
- "Siapa Membayar Apa" hanya menampilkan anggota yang punya transaksi bertanda household pada periode itu.
- Kekayaan keluarga ditampilkan **per anggota lebih dulu**; totalnya selalu disertai cakupan. Tidak ada kondisi di mana totalnya berdiri sendiri.
- Bagian "Per Kategori" menampilkan **seluruh** kategori — bawaan yang dikelompokkan lintas anggota, dan kustom sebagai barisnya sendiri disertai nama pemilik.

## 13. Pengeluaran Keluarga — `/household/[id]/transactions`

Struktur sama dengan riwayat transaksi pribadi, dengan tiga perbedaan:

- Setiap item menampilkan **nama pembayar** sebagai baris meta tambahan.
- Chip filter tambahan: **Anggota**.
- Saldo dompet tidak pernah ditampilkan, bahkan untuk dompet yang dibagikan — halaman ini tentang aliran uang keluarga, bukan tentang isi rekening siapa pun.

```
  Kemarin                −2.850.000
  🏠 Listrik & air
     Wahid · BCA        −Rp500.000
  🛒 Belanja bulanan
     Istri · BRI      −Rp2.000.000
  🍜 Makan siang keluarga
     Wahid · GoPay      −Rp350.000
```

Halaman ini hanya menampilkan transaksi bertanda `household_id`. Karena tidak ada mekanisme berbagi dompet, tidak ada jalur lain yang dapat memasukkan transaksi ke sini — definisi "pengeluaran keluarga" jadi tepat satu hal, bukan gabungan beberapa sumber.

## 14. Aktivitas — `/activity`

Menampung transaksi yang **ditulis anggota lain** untuk Anda. Sejauh ini hanya satu bentuk: transfer masuk yang mereka catat.

```
┌───────────────────────────────────┐
│ ‹ Aktivitas                       │
│                                   │
│  Belum ditinjau                   │
│  ╭───────────────────────────────╮│
│  │ 👤 Wahid mencatat             ││
│  │ ⇄  Transfer masuk             ││
│  │    ke 🏦 BRI    +Rp1.000.000 ││
│  │    2 Sep · Keluarga Wahid     ││
│  │                               ││
│  │  [Oke]  [Pindahkan]  [Hapus]  ││
│  ╰───────────────────────────────╯│
│                                   │
│  Sebelumnya                       │
│  ⇄  Wahid · 28 Agt   +Rp500.000  │
│  ⇄  Wahid · 15 Agt   +Rp750.000  │
└───────────────────────────────────┘
```

**Saldo sudah berubah sebelum halaman ini dibuka.** Ini bukan antrean persetujuan — uangnya memang sudah pindah di dunia nyata, dan catatannya sudah benar. Halaman ini memastikan tidak ada yang masuk ke buku Anda tanpa Anda ketahui.

| Aksi | Efek |
|------|------|
| **Oke** | `acknowledged_at` terisi; pindah ke "Sebelumnya"; lencana berkurang |
| **Pindahkan** | Sheet pemilih dompet; entry berpindah rekening. Edit biasa atas transaksi sendiri |
| **Hapus** | Void sisi Anda; tautan dilepas; pengirim melihatnya di Aktivitasnya |

Ketiganya adalah operasi atas transaksi **milik Anda**. Tidak ada persetujuan yang perlu diminta dari siapa pun.

Halaman ini tidak muncul di navigasi bila pengguna tidak punya household — sama seperti seluruh elemen household lainnya.

## 15. Anggota — `/household/[id]/members`

```
┌───────────────────────────────────┐
│ ‹ Anggota                 [Undang]│
│                                   │
│  Aktif                            │
│  ╭───────────────────────────────╮│
│  │ 👤 Wahid              Pemilik ││
│  │    Anda                       ││
│  ╰───────────────────────────────╯│
│  ╭───────────────────────────────╮│
│  │ 👤 Istri             Anggota ⋮││
│  │    Bergabung 12 Agt 2026      ││
│  ╰───────────────────────────────╯│
│  ╭───────────────────────────────╮│
│  │ 👤 Adi               Anggota ⋮││
│  │    Bergabung 20 Agt 2026      ││
│  ╰───────────────────────────────╯│
│                                   │
│  Menunggu                         │
│  ╭───────────────────────────────╮│
│  │ ✉️ ibu@contoh.com             ││
│  │    Kedaluwarsa 4 hari lagi    ││
│  │              [Kirim ulang][✕] ││
│  ╰───────────────────────────────╯│
└───────────────────────────────────┘
```

Menu `⋮` hanya muncul bagi `owner`, berisi "Jadikan pemilik" dan "Keluarkan". Bagi `member`, tidak ada menu sama sekali — tidak ada aksi keanggotaan yang boleh ia lakukan selain keluar sendiri.

Halaman ini **tidak** menampilkan angka finansial anggota mana pun. Ia tentang keanggotaan, bukan tentang uang.

## 16. Kekayaan Keluarga — `/household/[id]/net-worth`

```
┌───────────────────────────────────┐
│ ‹ Kekayaan Keluarga               │
│                                   │
│  Per Anggota                      │
│  ╭───────────────────────────────╮│
│  │ 👤 Wahid       Rp165.000.000 ││
│  │    Aset 175,0jt · Utang 10,0jt││
│  ╰───────────────────────────────╯│
│  ╭───────────────────────────────╮│
│  │ 👤 Istri        Rp80.000.000 ││
│  │    Aset 80,0jt · Utang 0      ││
│  ╰───────────────────────────────╯│
│  ╭───────────────────────────────╮│
│  │ 👤 Adi          Belum berbagi ││
│  ╰───────────────────────────────╯│
│  ─────────────────────────────────│
│  Total (2 dari 3 anggota)         │
│  Rp245.000.000                   │
│                                   │
│  ╭───────────────────────────────╮│
│  │      ╱‾‾╲    ╱‾‾‾‾            ││
│  │ ╱‾‾‾╯    ╲__╱      ▲          ││
│  ╰───────────────────────────────╯│
│         ▲ Istri mulai berbagi     │
│                                   │
│  Komposisi                        │
│  ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░            │
│  ■ Deposito   Rp120,0 jt   47%  │
│  ■ Emas        Rp65,5 jt   26%  │
│  ■ Tabungan    Rp38,0 jt   15%  │
│  ■ Kas         Rp31,5 jt   12%  │
│                                   │
│  Liabilitas                       │
│  ■ Hutang      Rp10,0 jt        │
└───────────────────────────────────┘
```

**Rincian per anggota adalah tampilan utama, bukan totalnya.** Angka gabungan dari berbagi sebagian — "Rp245 juta dari 2 dari 3 anggota" — sulit dipakai untuk keputusan apa pun, sementara "Wahid 165 juta, Istri 80 juta, Adi belum berbagi" tidak ambigu sama sekali. Total tetap ada, tetapi sebagai baris sekunder yang selalu menyebut cakupannya.

Anggota yang belum berbagi tetap ditampilkan. Menyembunyikannya akan membuat total tampak lebih lengkap daripada sebenarnya.

**Penanda pada grafik tren** menunjukkan titik di mana cakupan berubah. Kenaikan Rp80 juta karena Istri mulai berbagi bukanlah pertumbuhan kekayaan, dan grafik yang tidak menandainya akan menyiratkan sebaliknya. Datanya berasal dari `contributing_count` pada snapshot.

**Transfer antar anggota tidak pernah menyebabkan selisih di sini.** Kedua sisinya ditulis dalam satu transaction, jadi kekayaan keluarga tidak berubah — bahkan sesaat pun. Tidak ada keadaan "baru satu sisi tercatat" yang perlu dijelaskan.

## 17. Apa yang Saya Bagikan — `/settings/sharing`

Layar kecil dengan peran besar: satu tempat untuk menjawab *"data saya yang mana yang bisa dilihat orang lain?"*

```
┌───────────────────────────────────┐
│ ‹ Yang Saya Bagikan               │
│                                   │
│  Keluarga Wahid                   │
│  ╭───────────────────────────────╮│
│  │ Kekayaan saya       [ Aktif ] ││
│  │ Aset, dompet, dan hutang saya ││
│  │ dihitung di kekayaan keluarga.││
│  │                               ││
│  │ Dikecualikan (2)      [Kelola]││
│  │ 💳 BCA Pribadi                ││
│  │ 🏦 Deposito Warisan           ││
│  ╰───────────────────────────────╯│
│                                   │
│  ╭───────────────────────────────╮│
│  │ Transaksi bertanda keluarga   ││
│  │ 42 bulan ini      [Lihat semua]│
│  ╰───────────────────────────────╯│
│                                   │
│  Rumah Orang Tua                  │
│  ╭───────────────────────────────╮│
│  │ Kekayaan saya    [ Nonaktif ] ││
│  │ Transaksi bertanda: 3         ││
│  ╰───────────────────────────────╯│
│                                   │
│  ╭───────────────────────────────╮│
│  │  Berhenti berbagi semuanya    ││
│  ╰───────────────────────────────╯│
└───────────────────────────────────┘
```

Dengan hanya dua mekanisme berbagi, seluruh jawaban atas *"apa yang bisa dilihat orang lain?"* muat dalam satu layar tanpa scroll — bukan daftar panjang grant per objek yang harus ditelusuri satu per satu.

"Berhenti berbagi semuanya" mematikan `share_wealth` di seluruh household dan menawarkan melepas tag transaksi. Ia meminta konfirmasi dan menyebutkan angkanya.

**Tidak ada** tombol "bagikan semuanya" sebagai pasangannya. Asimetri ini disengaja: memudahkan penarikan dan menyulitkan pembukaan massal adalah sikap yang tepat untuk data finansial.

## 18. Settings — `/settings`

Kelompok: Profil · Preferensi (zona waktu, dompet default, piutang sebagai aset) · **Yang Saya Bagikan** · **Keluarga** · Kategori · Dompet · Data (ekspor CSV, hapus akun) · Tentang.

Hapus akun memerlukan pengetikan alamat email untuk konfirmasi, dan menyatakan dengan jelas bahwa seluruh data finansial akan hilang permanen.

Bila user adalah `owner` sebuah household, penghapusan akun diblokir sampai kepemilikan dialihkan atau household diarsipkan. Layarnya menyebutkan household mana yang menghalangi, dengan tautan langsung ke tindakan yang diperlukan — bukan sekadar pesan penolakan.
