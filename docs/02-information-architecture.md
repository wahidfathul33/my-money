# 02 — Information Architecture

Sitemap, struktur navigasi, dan pemetaan rute.

## 1. Sitemap

```
KONTEKS PRIBADI
/                             Home (Dashboard pribadi)
/transactions                 Riwayat transaksi
  /transactions/[id]          Detail & edit transaksi
/activity                     Transaksi yang dicatat anggota lain untuk Anda
/wealth                       Hub kekayaan
  /wealth/savings             Daftar savings goal (pribadi + bersama)
    /wealth/savings/[id]      Detail goal + riwayat kontribusi
  /wealth/assets              Ringkasan aset
    /wealth/assets/gold       Kepemilikan emas
    /wealth/assets/gold/[id]  Detail lot emas
    /wealth/assets/deposits   Deposito
    /wealth/assets/deposits/[id]
  /wealth/debts               Hutang & piutang (tab)
    /wealth/debts/[id]
    /wealth/receivables/[id]
  /wealth/net-worth           Rincian & tren net worth pribadi
/reports                      Laporan & analitik pribadi
/wallets                      Kelola dompet
  /wallets/[id]               Detail dompet + transaksinya
/budgets                      Budget pribadi

KONTEKS HOUSEHOLD
/household                    Daftar household saya (redirect bila hanya satu)
/household/new                Buat household
/household/[id]               Ringkasan keluarga
  /household/[id]/transactions  Pengeluaran keluarga (semua anggota)
  /household/[id]/budgets       Budget keluarga
  /household/[id]/savings       Shared savings goals
    /household/[id]/savings/[goalId]
  /household/[id]/members       Anggota + undangan
  /household/[id]/net-worth     Kekayaan keluarga + cakupan
  /household/[id]/settings      Nama, zona waktu, arsipkan

PENGATURAN & AKUN
/settings                     Pengaturan
  /settings/categories        Kelola kategori
  /settings/profile           Profil & preferensi
  /settings/sharing           **Apa yang saya bagikan** — status per household + pengecualian
  /settings/data              Ekspor & hapus data
/signin                       Autentikasi
/invite/[token]               Terima undangan (dapat diakses tanpa sesi)
/onboarding                   Setup pertama kali
```

**Konteks ditentukan oleh rute, bukan oleh mode tersembunyi.** `/` selalu berarti pribadi; `/household/[id]` selalu berarti keluarga itu. URL-nya dapat di-bookmark, dapat dibagikan, dan tidak ada query yang perlu bertanya "sedang di mode apa". Alternatifnya — satu set rute yang isinya berubah tergantung state tersimpan — menciptakan risiko menampilkan data konteks yang salah, dan itu risiko yang tidak sepadan pada aplikasi keuangan.

`/settings/sharing` menjawab satu pertanyaan dalam satu layar: *"data saya yang mana yang bisa dilihat orang lain?"* Dengan dua mekanisme berbagi ditambah satu paparan sempit (nama dompet), jawabannya muat dalam beberapa baris — bukan daftar panjang grant per objek.

`/activity` menampung transaksi yang **ditulis anggota lain** untuk Anda — sejauh ini hanya transfer masuk yang mereka catat. Ia terpisah dari `/transactions` karena menuntut tindakan berbeda: meninjau, bukan menelusuri.

## 2. Navigasi Mobile

Bottom navigation, 5 slot, FAB di tengah:

```
┌─────────────────────────────────────────────┐
│                                             │
│                  CONTENT                    │
│                                             │
├─────────────────────────────────────────────┤
│   🏠        📋      ╭───╮      💎      ⋯    │
│  Home     Trans    │ + │    Kekayaan    More  │
│                    ╰───╯                    │
└─────────────────────────────────────────────┘
```

| Slot | Label | Rute | Catatan |
|------|-------|------|---------|
| 1 | Home | `/` | |
| 2 | Transaksi | `/transactions` | |
| 3 | **+** | — | Membuka bottom sheet, **bukan** navigasi rute |
| 4 | Kekayaan | `/wealth` | |
| 5 | Lainnya | `/settings` | Sheet menu → Keluarga, Dompet, Budget, Laporan, Pengaturan |

**Aturan:**
- FAB tidak mengubah URL. Sheet Add Transaction adalah state UI, sehingga menutupnya tidak mengganggu riwayat navigasi.
- Bottom nav memiliki `padding-bottom: env(safe-area-inset-bottom)`.
- Konten diberi `padding-bottom` = tinggi nav + safe area, supaya item terakhir tidak tertutup.
- Nav disembunyikan pada layar full-screen (edit transaksi, onboarding).

### Kenapa 5 slot dan bukan 4?

Kekayaan adalah pembeda produk ini. Menyembunyikannya di balik "Lainnya" membuat aplikasi ini sekadar expense tracker. Dan menaruh Laporan di bottom nav tidak sepadan — laporan dibuka bulanan, bukan harian.

### Kenapa Keluarga tidak mendapat slot sendiri?

Menambah slot keenam akan mempersempit setiap target sentuh pada layar 360px, dan household bukan sesuatu yang dibuka setiap hari oleh setiap orang — sebagian pengguna tidak akan pernah membuat household sama sekali.

Sebagai gantinya, Keluarga dapat dijangkau lewat dua jalur yang keduanya cepat:
1. **Context switcher di header** (§4) — selalu terlihat, satu tap.
2. Menu "Lainnya" — untuk yang mencarinya di tempat konvensional.

Kalau kelak data pemakaian menunjukkan household dibuka sesering Kekayaan, keputusan ini layak ditinjau ulang. Sampai saat itu, mempertahankan lima slot lebih menguntungkan mayoritas.

## 3. Context Switcher

Berada di header, kiri atas, di seluruh rute konteks pribadi dan household.

```
┌───────────────────────────────────┐
│ [ 👤 Personal ▾ ]           [🔔] │
└───────────────────────────────────┘
        │ ditekan
        ▼
┌───────────────────────────────────┐
│  PRIBADI                          │
│  ✓ 👤 Keuangan Saya               │
│                                   │
│  KELUARGA                         │
│    🏠 Keluarga Wahid       3 org  │
│    🏠 Rumah Orang Tua      4 org  │
│                                   │
│  ＋ Buat keluarga baru            │
└───────────────────────────────────┘
```

**Perilaku:**
- Memilih item melakukan navigasi biasa: ke `/` atau ke `/household/[id]`.
- Switcher **tidak** menyimpan state global apa pun. Konteks selalu terbaca dari URL.
- Bila user belum punya household, switcher tidak ditampilkan — hanya ada satu entri "Buat keluarga" di menu Lainnya. Menampilkan pemilih dengan satu pilihan hanya menambah beban visual.
- Lencana pada ikon menunjukkan jumlah undangan tertunda dan aktivitas yang belum ditinjau.

**Berpindah konteks tidak pernah mengubah kepemilikan data.** Ini perlu disebut karena switcher pada aplikasi lain sering berarti "bertindak atas nama entitas ini". Di sini ia murni lensa tampilan: mencatat transaksi tetap dilakukan sebagai diri sendiri, di dompet sendiri, dari konteks mana pun.

## 4. Navigasi Desktop (≥ 1024px)

Sidebar kiri persisten, lebar 240px. Urutan item mempertahankan hierarki mobile:

```
┌──────────────┬──────────────────────────────┐
│ [👤 Personal▾]│                              │
│              │                              │
│  🏠 Home     │        CONTENT               │
│  📋 Transaksi│        (max-w-5xl)           │
│  💎 Kekayaan   │                              │
│  💳 Dompet   │                              │
│  🎯 Budget   │                              │
│  📊 Laporan  │                              │
│  👨‍👩‍👧 Keluarga │                              │
│  ⚙️  Settings │                              │
│              │                              │
│  [+ Tambah]  │                              │
└──────────────┴──────────────────────────────┘
```

Di desktop, ruang vertikal berlimpah sehingga Keluarga mendapat item sidebar sendiri. Context switcher tetap berada di atas sidebar; ketika konteks household aktif, daftar item sidebar berganti menjadi menu household (Ringkasan, Pengeluaran, Budget, Tabungan, Anggota, Kekayaan).

Tablet (768–1023px): sidebar menjadi rail ikon selebar 72px, atau bottom nav tetap dipakai — dipilih rail agar area konten maksimal.

Tombol "+ Tambah" di desktop membuka **dialog** (bukan bottom sheet), memakai komponen yang sama dengan varian presentasi berbeda.

## 5. Hub Kekayaan

`/wealth` bukan halaman kosong berisi tautan. Ia menampilkan ringkasan yang bisa dipakai:

```
Net Worth                     Rp187.450.000   ↗ +2,3% bulan ini
─────────────────────────────────────────────
Aset                          Rp202.450.000
  Kas & Dompet                 Rp  24.000.000
  Tabungan                     Rp  38.000.000
  Emas                         Rp  65.450.000
  Deposito                     Rp  75.000.000
Liabilitas                    Rp  15.000.000
  Hutang                       Rp  15.000.000
─────────────────────────────────────────────
Piutang (tidak dihitung)      Rp   3.000.000
```

Setiap baris dapat ditap untuk menuju modul terkait. Ini menghilangkan satu tingkat navigasi tanpa biaya apa pun.

## 6. Pola URL & State

| Kebutuhan | Mekanisme | Alasan |
|-----------|-----------|--------|
| Filter riwayat transaksi | Search param (`?dompet=…&type=…&from=…&to=…`) | Bisa di-bookmark, di-share, dan bertahan saat back |
| Sheet Add Transaction | State React lokal | Sheet transien; menaruhnya di URL membuat tombol back terasa aneh |
| Tab hutang/piutang | Search param (`?tab=debts`) | Kembali ke tab yang sama saat back |
| Periode laporan | Search param (`?period=2026-09`) | Bisa di-share |
| Pagination | Cursor di search param (`?cursor=…`) | Lihat [06-api-contracts.md](06-api-contracts.md) |
| **Konteks pribadi vs household** | **Segmen path** (`/` vs `/household/[id]`) | Konteks tidak boleh ambigu; path membuatnya eksplisit dan tidak bisa salah baca |
| Filter anggota di laporan household | Search param (`?member=…`) | |

**Aturan umum:** kalau state layak dibagikan atau layak bertahan saat refresh, taruh di URL. Kalau tidak, jangan.

**Konteks adalah pengecualian yang lebih keras dari aturan itu:** ia diletakkan di *path*, bukan search param, karena search param mudah hilang saat navigasi internal, dan kehilangan konteks pada aplikasi keuangan berarti menampilkan angka orang lain di layar yang mengaku milik Anda.

## 7. Perilaku Back

Aplikasi finansial hukumannya berat kalau navigasi bikin kehilangan data.

- Menutup sheet Add Transaction dengan data terisi → dialog konfirmasi "Buang input?".
- Back dari form edit dengan perubahan belum disimpan → dialog yang sama.
- Setelah menyimpan transaksi dari sheet → sheet tertutup, tidak ada navigasi. User tetap di konteks semula.
- Deep link ke `/transactions/[id]` dari notifikasi → back menuju `/transactions`, bukan keluar aplikasi.
- Back dari `/household/[id]/...` menuju `/household/[id]`, lalu ke `/`. Konteks household tidak pernah "bocor" menjadi konteks pribadi di tengah tumpukan navigasi.

## 8. Onboarding

Tiga langkah, dapat dilewati setelah langkah 1.

```
1. Buat dompet pertama    (wajib — aplikasi tanpa dompet tidak bisa apa-apa)
   nama + jenis + saldo awal
2. Konfirmasi kategori    (opsional — kategori bawaan sudah di-seed)
3. Catat transaksi pertama (opsional — tapi didorong kuat)
```

Setelah langkah 1, user mendarat di dashboard fungsional dengan satu dompet dan kategori lengkap. Tidak ada tembok kosong.

**Household sengaja tidak ada di onboarding.** Menawarkan "buat keluarga" kepada orang yang belum pernah mencatat satu transaksi pun adalah menawarkan fitur kolaborasi sebelum ada apa pun untuk dikolaborasikan. Ajakan membuat household muncul belakangan, setelah pengguna punya data — misalnya sebagai kartu ringan di dashboard setelah 10 transaksi tercatat.

### Onboarding lewat undangan

Alurnya berbeda dan harus ditangani terpisah:

```
Klik tautan undangan → /invite/[token]
  │
  ├── belum punya akun → daftar → verifikasi email → undangan otomatis dicocokkan
  │                    → onboarding dompet (langkah 1) → masuk household
  │
  └── sudah punya akun → login → layar konfirmasi undangan → masuk household
```

Yang penting: orang yang bergabung lewat undangan tetap melalui pembuatan wallet. Ia butuh dompet sendiri untuk bisa mencatat apa pun — dan tidak akan pernah mendapat dompet dari household, karena dompet bersama memang tidak ada.

Layar konfirmasi undangan menyatakan dengan jelas apa yang **tidak** terjadi saat bergabung: *"Bergabung tidak membagikan data keuangan Anda. Anda memilih sendiri apa yang ingin dibagikan, kapan saja."* Ini kekhawatiran pertama siapa pun yang menerima undangan keuangan keluarga, dan menjawabnya di depan lebih murah daripada kehilangan mereka di layar itu.
