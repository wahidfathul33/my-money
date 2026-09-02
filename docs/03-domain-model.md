# 03 — Domain Model

Entitas finansial, siklus hidup, aturan bisnis, dan formula. Ini adalah dokumen paling penting untuk kebenaran aplikasi.

## 1. Tiga Aturan Dasar

### 1.1 Semua adalah Ledger Entry

> **Setiap rupiah yang berpindah menghasilkan minimal satu `ledger_entry`. Saldo tidak pernah diubah tanpa entry.**

`wallets.balance` tetap ada sebagai *cache turunan*, bukan sumber kebenaran. Kebenaran adalah `SUM(ledger_entries.amount)`. Cache diperbarui dalam DB transaction yang sama dengan penulisan entry, dan diverifikasi job rekonsiliasi.

### 1.2 Kepemilikan selalu pada user

> **Setiap dompet, transaksi, aset, hutang, dan piutang dimiliki tepat satu user. Household tidak pernah memiliki saldo.**

Household adalah lapisan **organisasi, pelaporan, dan kolaborasi**. Tidak ada `wallets.household_id`, tidak ada `household_wallets`, tidak ada kolom saldo di `households`.

### 1.3 Menulis ke buku besar orang lain: tepat satu pengecualian

> **Hanya satu operasi yang boleh menulis `ledger_entry` ke dompet milik user lain: mencatat transfer ke sesama anggota household. Operasi itu teratribusi, terbatas pada dompet default penerima, dan dapat dibatalkan sepihak oleh pemiliknya.**

Selain itu, tidak ada. Tidak ada izin yang dapat diberikan, tidak ada peran yang membukanya, tidak ada endpoint lain yang menerima dompet orang lain sebagai target.

Premisnya: **aplikasi ini tidak memindahkan uang, ia mencatat bahwa uang berpindah.** Ketika Wahid mengirim Rp1 juta ke Istri lewat BCA, perpindahan itu sudah terjadi. Kedua saldo memang seharusnya berubah — jadi keduanya dicatat sekaligus, lalu Istri diberi tahu.

Pengaman yang membuat pengecualian ini dapat diterima:

| Pengaman | Bentuknya |
|----------|-----------|
| Teratribusi | `transactions.created_by` mencatat siapa yang menulis |
| Sempit | Hanya `ledger_entry` transfer masuk, ke dompet yang dipilih dari daftar dompet penerima yang terlihat |
| Dapat dibatalkan sepihak | Penerima dapat mem-void atau memindahkannya ke dompet lain, tanpa persetujuan pengirim |
| Terlihat | Muncul di Aktivitas penerima dengan lencana sampai ia melihatnya |
| Terbatas anggota aktif | Diverifikasi di dalam transaction, dua arah |

Kepemilikan tidak berpindah: `ledger_entries.user_id` selalu pemilik dompet, bukan penulisnya. Invarian I11 tetap berlaku utuh.

## 2. Peta Entitas

```
┌───────────────────────────────────────────────────────────┐
│                    LAPISAN HOUSEHOLD                      │
│  households ── household_members ── household_invitations │
│       │              │ share_wealth (per keanggotaan)     │
│       ├── savings_goals (household_id NOT NULL)           │
│       └── budgets       (household_id NOT NULL)           │
└───────────────┬───────────────────────────────────────────┘
                │ household_id nullable = TAG, bukan kepemilikan
┌───────────────▼───────────────────────────────────────────┐
│                      LAPISAN USER                         │
│                        users                              │
│   ┌────────┬────────────┬──────────┬────────┬──────────┐  │
│ dompet categories transactions assets  debts  receivables│
│   │        │            │          │        │          │  │
│   │        │       ┌────┴────┐ ┌───┴───┐    │          │  │
│   │        │       │ledger_  │ gold_lots    │          │  │
│   └────────┴──────►│entries  │ deposits     │          │  │
│                    └────┬────┘              │          │  │
│                         ├── savings_contributions      │  │
│                         ├── debt_payments ─────────────┘  │
│                         └── receivable_payments ──────────┘
│                                                           │
│   savings_goals · budgets (household_id nullable)         │
│   net_worth_snapshots · household_net_worth_snapshots     │
└───────────────────────────────────────────────────────────┘
```

Perhatikan yang **tidak ada**: tabel `transfer_groups`, tabel `wallet_access`. Keduanya dihapus — alasannya di [16-decision-log](16-decision-log.md#adr-023--transfer-antar-anggota-dicatat-masing-masing).

## 3. Uang: Representasi

**`BIGINT` dalam satuan minor skala 2** (sen). `Rp1.500.000` → `150000000`. Di TypeScript selalu `bigint`, tidak pernah `number`. Tidak ada `float` menyentuh nominal uang di mana pun.

**Kenapa skala 2 padahal IDR praktis tanpa sen?** Perhitungan *menghasilkan* pecahan — bunga deposito, pembagian budget, cost basis emas. Skala 2 memberi ruang pembulatan yang jujur dan tetap eksak.

**Kenapa BIGINT dan bukan NUMERIC?** Aritmetika `bigint` di JavaScript eksak tanpa library desimal. `NUMERIC` dipetakan Drizzle ke `string` dan memaksa parsing di setiap operasi.

**Kuantitas non-uang** memakai `NUMERIC` berskala eksplisit — berat emas `NUMERIC(18,4)` gram, suku bunga `NUMERIC(7,4)` persen.

**Pembulatan** *half-up* ke satuan minor terdekat, hanya di batas (menulis ke DB atau menampilkan).

## 4. Household

### 4.1 Entitas

**`households`** — wadah organisasi. Nama, mata uang, zona waktu, pembuat. Tanpa saldo.

**`household_members`** — hubungan user ↔ household dengan `role`, `status`, dan `share_wealth`. `UNIQUE (household_id, user_id)`.

**`household_invitations`** — undangan berbasis email dengan token ter-hash, sekali pakai, kedaluwarsa 7 hari, dapat dicabut.

Satu user boleh menjadi anggota beberapa household.

### 4.2 Dua peran

| Aksi | owner | member |
|------|:-----:|:------:|
| Melihat laporan agregat household | ✓ | ✓ |
| Menandai transaksi sendiri ke household | ✓ | ✓ |
| Berbagi kekayaan sendiri (`share_wealth`) | ✓ | ✓ |
| Membuat & mengubah budget household | ✓ | ✓ |
| Membuat & berkontribusi ke shared goal | ✓ | ✓ |
| Mencatat transfer ke anggota | ✓ | ✓ |
| Mengundang & mencabut undangan | ✓ | ✗ |
| Mengeluarkan anggota | ✓ | ✗ |
| Mengubah nama / zona waktu / arsipkan | ✓ | ✗ |
| Mengalihkan kepemilikan | ✓ | ✗ |

**Dua peran, bukan empat.** Household biasanya berisi 2–5 orang yang saling percaya. `admin` hanya berbeda pada "boleh mengundang", dan `viewer` tetap punya dompet sendiri serta tetap dapat berbagi datanya — ia hanya *member* yang kebetulan tidak mencatat. Peran tambahan menciptakan matriks izin yang harus diuji dan dipelihara di setiap action, untuk pembedaan yang tidak dibutuhkan siapa pun di rumah tangga.

> Prinsip yang lebih penting daripada tabel di atas: **peran hanya mengatur objek milik household. Peran tidak pernah memberi akses ke data pribadi anggota lain.** Seorang `owner` tidak dapat melihat dompet pribadi anggotanya.

### 4.3 Undangan

```
                  kedaluwarsa (7 hari)
  pending ────────┬──────────► expired
     │            └──────────► revoked
     └── diterima ───────────► accepted ──► household_members (active)
```

- Token disimpan **ter-hash** (SHA-256). Yang dikirim lewat email adalah token asli; database hanya menyimpan hash-nya.
- Sekali pakai: transisi dijaga `WHERE status = 'pending'` dalam transaction yang sama dengan pembuatan keanggotaan.
- Hanya dapat diterima user dengan email terverifikasi yang cocok.
- Penerima tanpa akun mendaftar dulu; undangan dicocokkan setelah verifikasi email.
- Undangan ke email yang sudah menjadi anggota aktif ditolak saat pembuatan.

### 4.4 Keluar dan mengarsipkan

Anggota keluar atau dikeluarkan: `status` → `removed`. Data tidak dihapus, kepemilikan tidak berubah, `share_wealth` untuk household itu dicabut.

Saat keluar, user memilih nasib transaksi yang sudah ia tandai:
- **Pertahankan tag** (default) — laporan household historis tetap akurat.
- **Lepas tag** — `household_id` di-set `NULL` pada transaksinya.

Menawarkan pilihan lebih baik daripada memilihkan: akurasi historis dan kendali atas data pribadi keduanya sah, dan hanya penggunanya yang tahu mana yang lebih penting baginya.

**Household diarsipkan, tidak dihapus keras.**

## 5. Model Berbagi

**Default: semua data finansial privat.** Bergabung ke household tidak membagikan apa pun.

Ada **dua** mekanisme berbagi:

| # | Mekanisme | Cakupan | Cara mengaktifkan |
|---|-----------|---------|-------------------|
| 1 | **Tag transaksi** (`transactions.household_id`) | Satu transaksi: nominal, kategori, tanggal, catatan, nama pembayar. **Bukan** saldo wallet. | Toggle 🏠 saat mencatat |
| 2 | **Berbagi kekayaan** (`household_members.share_wealth`) | Nilai aset & liabilitas yang muncul di rincian kekayaan keluarga | Satu toggle per keanggotaan |

Keduanya menjawab pertanyaan berbeda: yang pertama tentang **arus kas keluarga**, yang kedua tentang **kekayaan keluarga**. Keduanya opt-in, independen, dan dapat dicabut kapan saja.

Di luar keduanya ada **satu paparan sempit yang melekat pada keanggotaan** dan tidak dapat diberikan atau dicabut per orang:

> **Nama dan jenis dompet** milik anggota aktif terlihat oleh sesama anggota, khusus di pemilih tujuan transfer.

Tanpa itu, pengirim tidak dapat mencatat transfer ke rekening yang benar. Yang **tidak** ikut terlihat: saldo, riwayat transaksi, dan dompet mana pun yang ditandai `exclude_from_household`.

Cakupannya berhenti di dua field. Bagi yang punya rekening yang keberadaannya pun ingin dirahasiakan, `exclude_from_household` menyembunyikannya dari pemilih **sekaligus** dari kekayaan keluarga.

### 5.1 Berbagi kekayaan: satu toggle, bukan per item

`household_members.share_wealth` (default `false`) mengatur apakah kekayaan anggota itu ikut dihitung di household tersebut.

Untuk pengecualian, setiap dompet, aset, hutang, piutang, dan savings goal punya `exclude_from_household` (default `false`) — dipakai untuk menyembunyikan satu-dua item tertentu setelah `share_wealth` aktif.

**Kenapa opt-in di tingkat anggota, bukan per item?** Model per-item terlihat lebih aman di atas kertas, tetapi dalam praktik menghasilkan dua hasil: pengguna tidak mengaktifkan apa pun (fitur mati), atau ingin semuanya ikut dan harus menekan dua belas toggle. Satu keputusan eksplisit dengan deskripsi yang jelas, ditambah jalan keluar per item, memberi privasi yang setara dengan friksi yang jauh lebih kecil.

**Keterbatasan yang diketahui:** `exclude_from_household` bersifat global, bukan per household. Anggota yang tergabung di dua household dan ingin membagikan item berbeda ke masing-masing belum terlayani. Ditunda ke v1.x; kasusnya jarang dan menyelesaikannya sekarang berarti mengembalikan kompleksitas per-item yang baru saja dihapus.

### 5.2 Tidak ada akses baca ke isi dompet

Nama dompet terlihat (§5). **Isinya tidak.** Sistem tidak menyediakan cara memberi orang lain akses baca ke saldo sebuah dompet beserta seluruh transaksinya.

Itu grant paling berbahaya yang bisa dibuat — membuka saldo dan setiap transaksi di dompet itu, termasuk yang belum terjadi — sementara kebutuhan nyatanya sudah terpenuhi mekanisme #1 dan #2. Menyediakannya berarti membangun ACL penuh (per-wallet × per-user) yang harus diaudit terpisah dari household, demi kasus penggunaan yang tidak jelas.

Perbedaannya tajam dan disengaja:

| Terlihat anggota | Tidak terlihat |
|------------------|----------------|
| Nama & jenis dompet | Saldo dompet |
| Transaksi yang ditandai household | Transaksi yang tidak ditandai |
| Nilai aset bila `share_wealth` aktif | Riwayat di balik nilai itu |

Kalau akses baca penuh kelak terbukti dibutuhkan, ia masuk lewat ADR baru dengan desain izin yang utuh — bukan sebagai kolom permission yang menumpang.

## 6. Dompet

### 6.1 Jenis dan semantik tanda

| `type` | Saldo normal | Termasuk |
|--------|--------------|----------|
| `cash` · `bank` · `ewallet` | positif | Aset |
| `credit_card` | **negatif** | **Liabilitas** |

**Kartu kredit adalah liabilitas.** Saldonya ≤ 0 (dijaga `CHECK`), dikecualikan dari "Total Kas", masuk liabilitas sebesar `ABS(balance)`. Belanja membuatnya makin negatif; membayar tagihan menggerakkannya ke arah nol.

### 6.2 Kepemilikan

`wallets.user_id` `NOT NULL` dan **tidak pernah berubah**. Tidak ada mekanisme pengalihan kepemilikan dompet, tidak ada `household_id` di tabel ini, dan tidak ada tabel izin yang menempel padanya.

### 6.3 Saldo awal dan siklus hidup

Dompet dengan saldo awal ≠ 0 memicu `ledger_entry` bertipe `opening_balance`, sehingga invarian "saldo = jumlah entry" berlaku tanpa pengecualian.

```
active ──arsip──> archived ──pulihkan──> active
```

Dompet dengan ledger entry tidak pernah dihapus keras.

## 7. Kategori

### 7.1 Katalog kanonis

Sistem punya **satu daftar kategori bawaan** yang di-seed identik untuk setiap pengguna baru. Setiap kategori bawaan punya `system_key` yang stabil dan tidak pernah berubah.

```
Pengeluaran                        Pemasukan
  food_drinks    Makan & Minum       salary      Gaji
  transport      Transportasi        freelance   Freelance
  shopping       Belanja             business    Bisnis
  bills          Tagihan             investment  Investasi
  entertainment  Hiburan             gift        Hadiah
  health         Kesehatan           other_in    Lainnya
  education      Pendidikan
  insurance      Asuransi
  donation       Donasi
  other_out      Lainnya
```

`system_key` inilah yang membuat agregasi household menjadi **eksak**. "Makan & Minum" milik Wahid dan milik Istri punya `system_key = 'food_drinks'` yang sama, sehingga berkumpul pada satu baris laporan tanpa perlu mencocokkan teks.

Mencocokkan lewat nama akan gagal diam-diam pada "Makan dan Minum" atau "Makanan" — dan kegagalannya berupa angka yang salah tanpa tanda apa pun.

### 7.2 Kategori kustom

Kategori buatan pengguna punya `system_key = NULL`.

**Di laporan household, kategori kustom tetap ditampilkan** — tidak dibuang, tidak dilebur ke "Lainnya". Ia muncul sebagai barisnya sendiri disertai nama pemiliknya:

```
Pengeluaran Keluarga — September

  🏠 Tagihan                    Rp2.400.000    ← system_key: bills
  🍜 Makan & Minum              Rp2.100.000    ← system_key: food_drinks
  🛒 Belanja                    Rp1.600.000    ← system_key: shopping
  ☕ Kopi Spesialti (Wahid)       Rp450.000    ← kustom, milik Wahid
  🎨 Kursus Lukis (Istri)         Rp300.000    ← kustom, milik Istri
```

Semua terlihat, tidak ada yang dicocokkan secara kabur, dan tidak ada yang hilang.

### 7.3 Aturan

- `type` tidak dapat diubah setelah dibuat — mengubahnya membuat transaksi lama tidak konsisten.
- `system_key` tidak dapat diubah dan tidak dapat diisi oleh pengguna.
- Kategori bawaan dapat diarsipkan atau diganti namanya (`system_key` tetap), tetapi tidak dapat dihapus.
- Sub-kategori dibatasi kedalaman 1.
- Kategori yang dipakai transaksi tidak dapat dihapus; bisa diarsipkan.

Mengganti nama kategori bawaan tidak merusak agregasi household, karena yang dipakai adalah `system_key`, bukan namanya.

## 8. Transaksi

### 8.1 Jenis

| `type` | Efek dompet | Agregasi income | Agregasi expense | Net worth |
|--------|-------------|:---------------:|:----------------:|-----------|
| `income` | `+amount` | Ya | Tidak | naik |
| `expense` | `−amount` | Tidak | Ya | turun |
| `transfer` | lihat §9 | **Tidak** | **Tidak** | lihat §9 |

### 8.2 Konteks household

`transactions.household_id` bersifat nullable dan merupakan **tag konteks**, bukan kepemilikan.

```
household_id IS NULL      → transaksi pribadi murni
household_id IS NOT NULL  → ikut dalam laporan & budget household
```

Kepemilikan tetap: `transactions.user_id` dan `ledger_entries.wallet_id` tidak berubah.

```
Wahid mencatat listrik Rp500.000 dari BCA, ditandai household "Keluarga"

Pribadi Wahid:  saldo BCA −Rp500.000, pengeluaran pribadi +Rp500.000
Laporan keluarga: pengeluaran +Rp500.000, dibayar oleh Wahid
Kepemilikan:    tidak berubah
```

**Validasi:** pembuat harus anggota aktif household tersebut, diperiksa di dalam DB transaction.

**Anti-double-count:** satu transaksi punya tepat satu `household_id`. Agregasi household menjumlahkan baris transaksi dan menyaring `type`, sehingga transfer tidak pernah terhitung sebagai pengeluaran.

### 8.3 Siklus hidup

**Edit** tidak mengubah entry yang ada — ia mem-void entry lama dan menulis entry baru dalam satu transaction.

**Void** (di UI: "Hapus") menandai `voided_at` dan menulis entry pembalik. Transaksi ter-void dikecualikan dari seluruh agregasi.

**Hard delete tidak pernah tersedia untuk pengguna.**

### 8.4 Validasi

| Aturan | Berlaku pada |
|--------|-------------|
| `amount > 0`; tanda ditentukan tipe, bukan input user | Semua |
| `transaction_date` ≤ besok | Semua |
| Kategori ada dan `category.type` cocok | income, expense |
| Kategori null | transfer |
| Dompet milik user yang login | Semua |
| Bila `household_id` diisi: user anggota aktif | Semua |
| Bila `counterparty_user_id` diisi: keduanya anggota aktif household yang sama | transfer |

## 9. Transfer

### 9.1 Dua bentuk

| Bentuk | Dompet asal → tujuan | Baris transaksi | Ledger entry |
|--------|----------------------|-----------------|--------------|
| **Antar dompet sendiri** | Keduanya milik user yang sama | 1 | 2, keduanya di dompet sendiri |
| **Ke anggota household** | Dompet lawan milik orang lain | 2, satu per orang | 2, masing-masing di dompet pemiliknya |

Keduanya adalah fitur setara, bukan yang satu turunan yang lain. Yang pertama menjawab *"saya pindahkan uang dari BCA ke GoPay"*; yang kedua *"saya kirim uang ke Istri"*. Keduanya sama-sama bukan pemasukan maupun pengeluaran.

### 9.2 Transfer sendiri

```
Rp500.000 dari BCA ke GoPay (keduanya milik Wahid):

transactions
  T1  type=transfer  user=Wahid  amount=50000000  counterparty_user_id=NULL

ledger_entries
  L1  dompet=BCA     amount=-50000000  transaction_id=T1
  L2  dompet=GoPay   amount=+50000000  transaction_id=T1
```

**Invarian:** untuk transaksi `type='transfer'` dengan `counterparty_user_id IS NULL`, `SUM(ledger_entries.amount) = 0`.

Tidak ada tabel grup. Kedua entry sudah terhubung lewat `transaction_id` — menambahkan tabel penghubung di atasnya hanya akan menduplikasi informasi yang sudah ada.

### 9.3 Transfer ke anggota household

Satu pencatatan menghasilkan dua sisi sekaligus. Kedua saldo langsung benar.

```
Wahid mencatat transfer Rp1.000.000 ke Istri
(uangnya sudah pindah lewat BCA → BRI di dunia nyata)

transactions
  T1  user=Wahid  type=transfer  amount=100000000
      counterparty_user_id=Istri  created_by=Wahid  linked_transaction_id=T2
  T2  user=Istri  type=transfer  amount=100000000
      counterparty_user_id=Wahid  created_by=Wahid  linked_transaction_id=T1
      acknowledged_at=NULL                    ← belum dilihat Istri

ledger_entries
  L1  dompet=BCA Wahid   −100000000  user_id=Wahid  transaction_id=T1
  L2  dompet=BRI Istri   +100000000  user_id=Istri  transaction_id=T2

Satu DB transaction. Saldo Wahid −1jt, saldo Istri +1jt.
Kekayaan keluarga: tidak berubah.
```

**Pengirim memilih dompet tujuan**, dari daftar dompet aktif milik penerima — supaya catatannya jatuh di rekening yang benar-benar menerima uangnya. Kalau uangnya masuk ke BRI, catatannya harus di BRI; menebak lewat dompet default akan menaruhnya di tempat yang salah dan memaksa penerima memindahkannya setiap kali.

Pemilih itu menampilkan **nama dan jenis saja** — tanpa saldo, tanpa riwayat. Cakupannya diatur §5.0.

**Penerima diberi tahu, bukan dimintai persetujuan.** Transaksi muncul di halaman Aktivitas dengan lencana. Dari sana ia dapat:

| Aksi | Efek |
|------|------|
| Tandai sudah dilihat | `acknowledged_at` terisi; lencana hilang |
| Pindahkan ke dompet lain | Edit biasa atas transaksinya sendiri; entry berpindah dompet |
| Hapus | Void sisi miliknya; tautan dilepas; pengirim diberi tahu |

Ketiganya adalah operasi normal atas transaksi miliknya sendiri. Tidak ada mekanisme khusus untuk "menolak".

**Kalau penerima belum punya dompet aktif yang terlihat**, pencatatan ditolak dengan pesan yang menyebut namanya. Sistem tidak membuat dompet atas nama orang lain.

**Invarian:** untuk transaksi transfer ber-`counterparty_user_id`, pasangannya selalu ada dan `SUM(entry.amount)` kedua sisi = 0. Tidak ada keadaan "baru satu sisi tercatat".

### 9.4 Klasifikasi

Transfer — dalam bentuk apa pun — **tidak pernah** dihitung sebagai income maupun expense, di laporan pribadi maupun household. Perlakuan visualnya netral, bukan merah atau hijau.

**Efek pada net worth:**

| | Net worth pengirim | Net worth penerima | Net worth household |
|-|--------------------|--------------------|---------------------|
| Transfer antar dompet sendiri | tidak berubah | — | tidak berubah |
| Transfer ke anggota | −amount | +amount | **tidak berubah** |

Tidak ada keadaan antara. Karena kedua sisi ditulis dalam satu transaction, kekayaan keluarga tidak pernah salah — bahkan sesaat pun.

### 9.5 Validasi

| Aturan | Catatan |
|--------|---------|
| `amount > 0` | |
| Dompet asal ≠ tujuan | transfer sendiri |
| Kedua dompet aktif dan milik pencatat | transfer sendiri |
| Dompet asal milik pencatat, aktif | transfer ke anggota |
| Lawan adalah anggota aktif household yang sama | transfer ke anggota |
| Dompet tujuan milik lawan, aktif, dan tidak ber-`exclude_from_household` | transfer ke anggota |
| `idempotency_key` wajib | Semua |
| Satu transaksi hanya dapat ditautkan sekali | unique index |
| Hanya pemilik transaksi yang dapat mengedit atau mem-void-nya | Semua, termasuk sisi yang ditulis orang lain |

## 10. Savings Goal

### 10.1 Satu mode: dana yang benar-benar disisihkan

Kontribusi savings memindahkan uang: saldo dompet berkurang, pos tabungan bertambah, keduanya dalam satu transaction. `savings_contributions.ledger_entry_id` bersifat `NOT NULL`.

```
Kontribusi Rp1.000.000 dari BCA ke goal "Dana Darurat":

ledger_entries      dompet=BCA  −100000000   ← saldo BENAR-BENAR turun
savings_contributions  goal      +100000000

Net worth: Kas −1jt, Tabungan +1jt ⇒ berubah 0. Benar.
```

`NOT NULL` pada `ledger_entry_id` membuat penghitungan ganda **mustahil secara struktural**: tidak ada cara menambah angka tabungan tanpa mengurangi saldo wallet.

**Tidak ada mode "komitmen".** Mencatat niat yang tidak didukung dana yang bergerak akan menambahkan angka ke pos tabungan sementara uangnya masih terhitung di saldo dompet — jalur penghitungan ganda paling halus yang bisa ada di sistem ini, dan satu-satunya yang memerlukan pertahanan berlapis untuk menahannya.

Niat sudah terwakili dengan cukup oleh `target_amount` dan saran kontribusi bulanan. Kalau kelak terbukti dibutuhkan, ia masuk di v1.x sebagai catatan non-finansial yang tidak pernah menyentuh perhitungan aset.

### 10.2 Goal pribadi dan bersama

```
household_id IS NULL      → goal pribadi
household_id IS NOT NULL  → goal bersama, seluruh anggota aktif melihat
```

Pada goal bersama, kontribusi tiap anggota terlihat dengan namanya, dan **selalu berasal dari dompet pribadi kontributor**. Sistem tidak pernah membuat saldo bersama.

```
🎯 Liburan Keluarga — target Rp20.000.000

   Wahid   Rp5.000.000
   Istri   Rp3.000.000
   ─────────────────────
   Total   Rp8.000.000   → 40%
```

**Penarikan hanya atas kontribusi sendiri, ke dompet sendiri.** Tidak ada anggota yang dapat menarik dana anggota lain — konsekuensi langsung dari aturan 1.3.

### 10.3 Formula

```
current_amount    = Σ kontribusi (non-void)
progress_pct      = current_amount / target_amount × 100     (dibatasi 100)
remaining_amount  = MAX(0, target_amount − current_amount)
months_remaining  = ceil(hari(target_date − hari_ini) / 30.44)
suggested_monthly = months_remaining > 0
                      ? ceil(remaining_amount / months_remaining)
                      : remaining_amount
```

Pada goal bersama, saran juga ditampilkan dibagi jumlah anggota aktif.

Kalau `target_date` lewat dan goal belum tercapai, status menjadi terlewat dan UI menampilkan "Target terlewat" — bukan angka negatif.

### 10.4 Siklus hidup

```
active ──current ≥ target──> completed
   └──arsip──> archived
```

Mengarsipkan goal bersama tidak menghapus kontribusi siapa pun — dana itu tetap aset pemiliknya sampai ditarik.

## 11. Aset

### 11.1 Sumber kebenaran

`assets` menyimpan atribut umum. Nilai **selalu diturunkan** dari tabel spesifik jenisnya; `assets.cached_value` ditandai sebagai cache dan diperbarui oleh proses yang sama yang menulis data sumber.

Setiap aset punya `user_id` `NOT NULL` dan `exclude_from_household` (default `false`).

### 11.2 Emas

**Model lot.** Setiap pembelian membuat satu lot dengan `remaining_grams`.

**Cost basis: rata-rata tertimbang.**

```
avg_cost_per_gram = Σ(remaining_grams × purchase_price_per_gram) / Σ(remaining_grams)
current_value     = total_grams × buyback_price_per_gram
unrealized_gain   = current_value − Σ(remaining_grams × purchase_price_per_gram)

Saat menjual:
proceeds      = grams_sold × buyback_price_at_sale
realized_gain = proceeds − (grams_sold × avg_cost_per_gram)
```

Dipilih daripada FIFO karena emas fisik *fungible*, dan FIFO menuntut UI menjelaskan lot mana yang dijual — kompleksitas tanpa manfaat bagi pengguna personal.

**Harga beli vs buyback.** Emas retail Indonesia punya dua harga dengan selisih 5–12%. **Valuasi memakai harga buyback** — itulah yang benar-benar akan diterima. `CHECK gold_buyback_lte_sell` mengunci realitas ini ke dalam skema.

**Provider harga** pluggable: `ManualPriceProvider` selalu terdaftar dan menjadi default; `ExternalPriceProvider` opsional di belakang env flag dan wajib mundur ke harga manual terakhir bila gagal. Harga bersifat per user.

### 11.3 Deposito

```
tenor_hari        = maturity_date − start_date
bunga_kotor       = principal × (interest_rate_annual/100) × (tenor_hari / 365)
pajak             = bunga_kotor × tax_rate          ← default 0,20
bunga_bersih      = bunga_kotor − pajak
nilai_jatuh_tempo = principal + bunga_bersih
```

**PPh final 20%** default untuk pokok di atas Rp7,5 juta; otomatis 0 di bawahnya. Mengabaikannya membuat estimasi imbal hasil terlalu tinggi ~20%.

**`at_maturity`** (default): nilai berjalan tetap sebesar pokok sampai cair. Bunga terakumulasi ditampilkan sebagai estimasi terpisah dan **tidak masuk net worth** — mengklaim bunga yang belum diterima sebagai kekayaan adalah kebohongan kecil yang menumpuk.

**ARO** — praktik standar di Indonesia. Deposito jatuh tempo membuat penerus otomatis; `rolled_from_id` menautkannya.

## 12. Hutang & Piutang

| | Hutang | Piutang |
|-|--------|---------|
| Arti | Saya meminjam | Orang lain meminjam dari saya |
| Saat dibuat | Dompet **+** | Dompet **−** |
| Saat dibayar | Dompet **−**, sisa turun | Dompet **+**, sisa turun |
| Net worth | Liabilitas | Aset (dapat dikonfigurasi) |

**`affects_wallet`** — tidak semua hutang melibatkan kas masuk (teman membelikan sesuatu untuk Anda). Bendera ini mengatur apakah pembuatan menulis ledger entry.

**Piutang default tidak dihitung sebagai aset**, ditampilkan terpisah. Piutang personal punya tingkat gagal bayar tinggi dan net worth sebaiknya konservatif. Setting `count_receivables_as_asset` tersedia.

**Status** `active` → `partially_paid` → `paid`. `overdue` bersifat turunan, bukan kolom tersimpan — kalau disimpan ia akan basi setiap tengah malam.

**Antar anggota:** `counterparty_user_id` menandai lawan sesama anggota. Bila kedua sisi dicatat dan keduanya masuk kekayaan keluarga, agregasi menjumlahkan `+X` aset dan `−X` liabilitas sehingga saling meniadakan. Bila hanya satu sisi dicatat, UI menampilkan catatan pengingat.

## 13. Budget

```
household_id IS NULL      → budget pribadi (milik user_id, per category_id)
household_id IS NOT NULL  → budget household (per system_key)
```

**Budget pribadi** menghitung transaksi user itu, terlepas dari tag household.

**Budget household** menghitung transaksi seluruh anggota yang ditandai household tersebut, dicocokkan lewat `categories.system_key` — **eksak, bukan pencocokan teks**:

```
spent = Σ expense WHERE household_id = H
                    AND category.system_key = budget.category_key
                    AND transaction_date ∈ periode AND voided_at IS NULL
```

Budget household hanya dapat dibuat untuk kategori bawaan. Kategori kustom tidak dapat dicocokkan lintas anggota — ia tetap **ditampilkan** di laporan sebagai barisnya sendiri (§7.2), tetapi tidak dianggarkan bersama.

**Satu transaksi dapat terhitung pada budget pribadi dan household sekaligus.** Ini bukan double counting: keduanya menjawab pertanyaan berbeda dan tidak pernah dijumlahkan bersama.

**Tidak pernah terhitung terhadap budget mana pun:** transfer, kontribusi savings, pembayaran hutang. Semuanya bukan konsumsi.

**Ambang status:** `safe` < 80% ≤ `warning` < 100% ≤ `over`.

**`is_recurring`** default `true` — tanpanya user harus membuat ulang seluruh budget setiap tanggal 1.

## 14. Net Worth

### 14.1 Pribadi

```
TOTAL_ASET =
    Σ wallet.balance  WHERE type ∈ (cash, bank, ewallet) AND balance > 0
  + Σ savings_contributions.amount  (non-void)
  + nilai_emas          (Σ gram × harga_buyback)
  + nilai_deposito      (Σ pokok deposito aktif)
  + Σ aset_lain.current_value
  [+ Σ receivable.remaining_amount   jika count_receivables_as_asset]

TOTAL_LIABILITAS =
    Σ ABS(wallet.balance)  WHERE type = credit_card AND balance < 0
  + Σ debt.remaining_amount  WHERE status ≠ paid

NET_WORTH = TOTAL_ASET − TOTAL_LIABILITAS
```

Tidak ada "dana dalam perjalanan" — dengan model §9.3, tidak ada momen di mana uang berada di antara dua wallet.

### 14.2 Household

```
HOUSEHOLD_NET_WORTH = Σ (aset)  −  Σ (liabilitas)
```

dari anggota aktif dengan `share_wealth = true`, mengecualikan item ber-`exclude_from_household`.

**Tampilan utama adalah per anggota, bukan total.**

```
Kekayaan Keluarga

  👤 Wahid                       Rp165.000.000
     Aset 175,0 jt · Liabilitas 10,0 jt
  👤 Istri                        Rp80.000.000
     Aset 80,0 jt · Liabilitas 0
  👤 Adi                          Belum berbagi
  ─────────────────────────────────────────────
  Total (2 dari 3 anggota)       Rp245.000.000
```

Angka gabungan dari berbagi sebagian tidak menjawab keputusan apa pun dengan sendirinya — "Rp245 juta dari 2 dari 3 anggota" adalah angka yang sulit dipakai. Rincian per anggota tidak ambigu, sementara totalnya tetap tersedia sebagai baris sekunder yang selalu menyebut cakupannya.

Anggota yang belum berbagi tetap tampil berlabel "Belum berbagi" — ketidakhadirannya adalah informasi.

### 14.3 Invarian anti-double-count

Diuji lewat property test:

1. Dompet bersaldo negatif bertipe cash/bank/ewallet masuk liabilitas, bukan aset negatif.
2. Kontribusi savings mengurangi saldo dompet sebesar kenaikan pos tabungan. Net worth berubah 0.
3. Pembelian emas mengurangi saldo dompet sebesar cost basis lot baru. Net worth berubah hanya sebesar spread.
4. Pembayaran hutang mengurangi dompet dan sisa hutang sama besar. Net worth berubah 0.
5. Transfer sendiri meninggalkan net worth tepat tidak berubah.
6. Transfer ke anggota meninggalkan net worth household tidak berubah — selalu, tanpa keadaan antara.
7. Bunga deposito belum diterima tidak terhitung sebagai aset.
8. Satu transaksi tidak pernah terhitung dua kali dalam satu agregasi household.

### 14.4 Snapshot

Cron harian 23:55 WIB menulis satu baris per user aktif dan satu baris per household aktif.

Snapshot household disimpan terpisah dan **tidak direkonstruksi** dari snapshot pribadi — cakupan berbagi berubah kapan saja, dan menghitung ulang belakangan menghasilkan angka historis yang tidak pernah benar-benar ditampilkan ke siapa pun.

`contributing_count` disimpan agar grafik dapat menandai titik perubahan cakupan. Lonjakan karena seorang anggota mulai berbagi bukan pertumbuhan kekayaan.

## 15. Zona Waktu

- Semua timestamp `TIMESTAMPTZ` dalam UTC.
- `users.timezone` (default `Asia/Jakarta`) menentukan batas hari untuk data pribadi.
- `households.timezone` menentukan batas hari dan bulan untuk seluruh agregasi household — bukan zona waktu masing-masing anggota. Kalau tidak, dua anggota di zona berbeda akan melihat total bulanan berbeda untuk household yang sama, dan tidak ada jawaban yang benar soal mana yang harus dipercaya.

Tanpa penanganan ini, transaksi pukul 07:00 WIB (00:00 UTC) akan muncul di tanggal berbeda dari yang dilihat pengguna, dan pengeluaran bocor melewati batas bulan.
