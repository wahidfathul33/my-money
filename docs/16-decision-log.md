# 16 — Decision Log

Architecture Decision Records. Setiap entri: konteks, keputusan, alternatif yang ditolak, konsekuensi.

Status: `diterima` · `digantikan` (keputusannya dibatalkan) · `direvisi oleh` (keputusan intinya bertahan, rinciannya berubah)

ADR yang digantikan **tidak dihapus**. Ia tetap ada sebagai nisan agar penomoran berkelanjutan dan alasan pembatalannya dapat ditelusuri.

---

## ADR-001 — Multi-user dengan Auth.js v5

**Status:** diterima · 2026-09-02

**Konteks.** Model data memuat `user_id` di setiap tabel, sehingga aplikasi bersifat multi-user. Target deploy adalah Vercel dengan URL publik.

**Keputusan.** Multi-user dengan Auth.js v5, Google OAuth sebagai provider utama, magic link email sebagai cadangan, **database session** bukan JWT.

**Alternatif yang ditolak:**
- *Single-user tanpa auth.* Paling cepat dibangun. Ditolak karena aplikasi yang menyimpan gambaran finansial lengkap seseorang, di URL publik, tanpa autentikasi, tidak dapat dipertanggungjawabkan. Menambahkan auth belakangan akan menyentuh setiap query.
- *Clerk / Stack Auth.* Setup lebih cepat. Ditolak karena vendor lock-in pada lapisan identitas dan biaya di atas free tier, sementara Auth.js + Drizzle sudah memadai.
- *Sesi JWT.* Lebih murah (tanpa query sesi). Ditolak karena JWT tidak dapat dicabut sebelum kedaluwarsa; "keluar dari semua perangkat" harus bekerja seketika pada aplikasi finansial.

**Konsekuensi.** Satu query sesi per request. Setiap query harus di-scope `user_id` — permukaan kerentanan terbesar aplikasi, ditangani dengan penegakan berlapis dan test isolasi lintas-user wajib.

---

## ADR-002 — Drizzle ORM di atas Neon PostgreSQL

**Status:** diterima · 2026-09-02

**Konteks.** Butuh akses database yang type-safe, migrasi yang dapat di-review, dan transaksi eksplisit untuk operasi finansial, pada runtime serverless.

**Keputusan.** Drizzle ORM dengan `drizzle-kit` untuk migrasi.

**Alternatif yang ditolak:**
- *Prisma.* Ekosistem lebih matang, Prisma Studio bagus. Ditolak karena bobot di serverless dan lapisan tambahan (driver adapter/Accelerate) yang dibutuhkan untuk Neon, sementara keunggulannya tidak relevan untuk kebutuhan kita.
- *Raw SQL + node-postgres.* Kontrol penuh. Ditolak karena hilangnya type-safety pada skema sebesar ini, dan migrasi harus dikelola sendiri.

**Konsekuensi.** SQL-first berarti query kompleks tetap terbaca. Drizzle memetakan `NUMERIC` ke `string`, memperkuat keputusan memakai `BIGINT` untuk uang (ADR-003).

---

## ADR-003 — Uang sebagai BIGINT satuan minor

**Status:** diterima · 2026-09-02

**Konteks.** Representasi uang perlu ditetapkan. Default bahasa (`number` / `float8`) tidak eksak untuk desimal.

**Keputusan.** `BIGINT` satuan minor skala 2 (sen). `bigint` di TypeScript. Larangan mutlak `float` untuk uang.

**Alternatif yang ditolak:**
- *`NUMERIC(20,2)`.* Eksak di database. Ditolak karena Drizzle memetakannya ke `string`, memaksa parsing di setiap operasi, dan aritmetika butuh library desimal.
- *Skala 0 (rupiah utuh).* IDR praktis tidak punya sen. Ditolak karena perhitungan *menghasilkan* pecahan — bunga deposito, pembagian budget, cost basis rata-rata — dan membulatkan terlalu dini mengakumulasi galat.
- *Library desimal (decimal.js).* Presisi arbitrer. Ditolak karena `bigint` sudah eksak untuk kebutuhan kita, tanpa dependensi dan tanpa biaya runtime.

**Konsekuensi.** `bigint` tidak dapat di-JSON; batas serialisasi harus mengonversi ke string. Setiap DTO menyebutkan satuan di komentar. Jangkauan cukup sampai ~Rp92 kuadriliun.

---

## ADR-004 — Ledger sebagai sumber kebenaran, saldo sebagai cache

**Status:** diterima · 2026-09-02

**Konteks.** Catatan finansial harus dapat ditelusuri dan tidak berubah, sementara dashboard membutuhkan saldo beberapa dompet sekaligus dengan cepat. Dua kebutuhan ini menarik ke arah berlawanan.

**Keputusan.** `ledger_entries` adalah sumber kebenaran. `wallets.balance` tetap ada sebagai cache turunan, hanya ditulis di dalam transaction yang sama dengan entry-nya, memakai `balance = balance + delta` di SQL, dan diverifikasi job rekonsiliasi harian.

**Alternatif yang ditolak:**
- *Hitung saldo dari ledger setiap saat.* Selalu benar menurut konstruksi. Ditolak karena dashboard butuh saldo beberapa dompet sekaligus; `SUM` di setiap render tidak dapat diterima seiring bertambahnya riwayat.
- *Materialized view.* Otomatis konsisten. Ditolak karena refresh-nya tidak seketika, sehingga saldo terlihat basi tepat setelah user mencatat sesuatu — persis momen ketika kebenaran paling terasa.

**Konsekuensi.** Cache dapat menyimpang bila ada kode yang melanggar aturan. Karena itu rekonsiliasi harian bersifat wajib, dan ia **melaporkan** tanpa memperbaiki otomatis — perbaikan senyap akan menyembunyikan bug penyebabnya.

---

## ADR-005 — Transfer sebagai ledger entry, tanpa tabel grup

**Status:** direvisi oleh [ADR-023](#adr-023--transfer-antar-anggota-dicatat-masing-masing) · 2026-09-02

**Konteks.** Transfer dapat dimodelkan sebagai transaksi yang saling terhubung, atau sebagai tabel `transfers` tersendiri di luar ledger.

**Keputusan.** Transfer antar dompet sendiri adalah satu baris `transactions` dengan dua `ledger_entries`. Ledger tetap satu tabel untuk seluruh pergerakan uang.

**Alternatif yang ditolak:**
- *Tabel `transfers` yang menggantikan ledger entry.* Ditolak karena setiap query riwayat harus meng-UNION dua tabel berbentuk berbeda.
- *Tabel `transfer_groups` sebagai penghubung.* Sempat diadopsi, lalu dibatalkan ADR-023: kedua entry sudah terhubung lewat `transaction_id`, sehingga tabel di atasnya hanya menduplikasi informasi yang ada.

**Konsekuensi.** Satu tabel untuk dipindai pada riwayat. Invarian `SUM(entries) = 0` per transaksi transfer dapat diuji langsung.

---

## ADR-006 — Kontribusi savings sebagai transfer internal sungguhan

**Status:** diterima · 2026-09-02 · dipertegas oleh [ADR-026](#adr-026--savings-hanya-kontribusi-yang-memindahkan-uang)

**Konteks.** Pergerakan dana ke tabungan adalah alokasi aset, bukan pengeluaran. Menerjemahkan itu secara harfiah — dengan tidak menyentuh saldo dompet sama sekali — membuka jalan ke penghitungan ganda.

**Keputusan.** Kontribusi yang memindahkan uang mengurangi saldo dompet lewat ledger entry dan menambah jumlah tersimpan pada goal, keduanya dalam satu transaction.

**Alternatif yang ditolak:**
- *Savings goal sebagai dompet bertipe khusus.* Otomatis menghindari double counting dan menyatukan model. Ditolak karena mencampuradukkan "di mana uang berada" dengan "untuk apa uang disisihkan", dan membuat savings goal muncul di pemilih dompet saat mencatat transaksi harian — friksi persis di alur terpenting.

**Konsekuensi.** `savings_contributions.ledger_entry_id NOT NULL` membuat penghitungan ganda mustahil secara struktural: tidak ada cara menambah angka tabungan tanpa mengurangi saldo wallet.

---

## ADR-007 — Valuasi emas memakai harga buyback

**Status:** diterima · 2026-09-02

**Konteks.** Emas retail Indonesia punya harga jual dan harga buyback dengan selisih 5–12%. Memodelkannya sebagai satu "harga saat ini" memaksa memilih salah satunya.

**Keputusan.** Simpan keduanya. Valuasi kepemilikan memakai `buyback_price_per_gram`. Constraint `CHECK (buyback <= sell)`.

**Alternatif yang ditolak:**
- *Pakai harga jual.* Angka yang lebih besar dan lebih menyenangkan. Ditolak karena melebih-lebihkan kekayaan secara sistematis; itu bukan uang yang akan Anda terima.
- *Pakai spot XAU global.* Tersedia gratis lewat API. Ditolak karena spot ≠ harga retail Indonesia, dan mengonsumsinya menuntut konversi FX yang sudah dikeluarkan dari MVP (ADR-009).

**Konsekuensi.** Pembelian emas sedikit menurunkan net worth (sebesar spread). Ini benar secara ekonomi, tetapi mengejutkan — UI menjelaskannya sekali lewat tooltip.

---

## ADR-008 — Provider harga emas yang pluggable, manual sebagai default

**Status:** diterima · 2026-09-02

**Konteks.** Riset (September 2026) menemukan API XAU spot gratis (`goldprice.dev`, `gold-api.com`, `goldapi.io`), tetapi harga Antam/UBS/Pegadaian hanya tersedia lewat API komunitas hasil scraping tanpa SLA.

**Keputusan.** Interface `GoldPriceProvider`. `ManualPriceProvider` selalu terdaftar dan menjadi default. `ExternalPriceProvider` opsional di belakang env flag, dijadwalkan Vercel Cron, wajib fallback ke harga manual terakhir bila gagal.

**Alternatif yang ditolak:**
- *Manual saja.* Paling sederhana. Ditolak karena permintaan eksplisit untuk mencari API gratis, dan karena interface-nya hampir tanpa biaya untuk ditulis sekarang.
- *API eksternal saja.* Otomatis penuh. Ditolak karena menjadikan modul emas bergantung pada scraper pihak ketiga yang bisa mati kapan saja.

**Konsekuensi.** Kepemilikan emas selalu dapat dinilai. Harga lebih tua dari 30 hari memicu peringatan di UI.

---

## ADR-009 — IDR saja untuk MVP

**Status:** diterima · 2026-09-02

**Konteks.** Skema memuat `currency` pada dompet dan `default_currency` pada user, sehingga multi-currency secara teknis terbuka.

**Keputusan.** IDR saja. Kolom `currency` tetap ada di skema untuk masa depan, tanpa konversi FX.

**Alternatif yang ditolak:**
- *Multi-currency penuh.* Lebih umum. Ditolak karena menuntut tabel kurs, keputusan rate historis vs terkini pada setiap agregasi, dan gain/loss selisih kurs — satu kelas kompleksitas dan bug yang besar, untuk kebutuhan yang tidak ada di MVP.

**Konsekuensi.** Agregasi net worth cukup menjumlahkan tanpa konversi. Menambah multi-currency nanti membutuhkan migrasi, tetapi kolomnya sudah tersedia.

---

## ADR-010 — Piutang tidak dihitung sebagai aset secara default

**Status:** diterima · 2026-09-02

**Konteks.** Apakah piutang dihitung sebagai aset adalah pilihan yang sah bagi kedua jawabannya — tetapi defaultnya tetap harus ditetapkan.

**Keputusan.** Default `false`. Piutang ditampilkan terpisah di bawah pemisah. Setting `count_receivables_as_asset` tersedia.

**Alternatif yang ditolak:**
- *Hitung sebagai aset secara default.* Benar secara akuntansi formal. Ditolak karena piutang personal (pinjaman ke teman/keluarga) punya tingkat gagal bayar tinggi, dan net worth yang menyertakannya terasa optimistis dengan cara yang tidak membantu pengambilan keputusan.

**Konsekuensi.** Net worth lebih konservatif. Pengguna yang tidak setuju dapat mengubahnya, dan angka rincian selalu terlihat.

---

## ADR-011 — Tanpa Row Level Security PostgreSQL

**Status:** diterima · 2026-09-02

**Konteks.** RLS akan memberi lapisan penegakan otorisasi di level database.

**Keputusan.** Tidak memakai RLS. Otorisasi ditegakkan di aplikasi lewat empat lapisan, didukung test isolasi lintas-user wajib.

**Alternatif yang ditolak:**
- *Aktifkan RLS dengan `SET LOCAL app.user_id`.* Pertahanan berlapis yang sesungguhnya. Ditolak karena connection pooling Neon membuat setting per-transaction menjadi rapuh — koneksi yang dipakai ulang dapat membawa setting sebelumnya, yang justru menciptakan bug otorisasi alih-alih mencegahnya.

**Konsekuensi.** Beban penegakan sepenuhnya ada di kode aplikasi. Karena itu test isolasi lintas-user bersifat wajib untuk setiap modul, dan diperiksa di setiap review. Keputusan ini layak ditinjau ulang bila Drizzle/Neon memperbaiki ergonomi RLS.

---

## ADR-012 — Tanpa antrean tulis offline di MVP

**Status:** diterima · 2026-09-02

**Konteks.** Aplikasi ditargetkan installable sebagai PWA, dan PWA menyiratkan kemampuan offline.

**Keputusan.** Cache-baca offline saja. Menyimpan saat offline diblokir dengan pesan yang jelas.

**Alternatif yang ditolak:**
- *Antrean tulis dengan sinkronisasi latar.* Pengalaman lebih baik saat sinyal buruk. Ditolak karena tulisan tertunda memerlukan resolusi konflik, dan konflik pada data finansial dapat menghasilkan angka yang salah atau transaksi ganda. Menolak menyimpan lebih jujur daripada berjanji tersimpan lalu gagal diam-diam.

**Konsekuensi.** Aplikasi kurang berguna dalam kondisi tanpa sinyal. Dapat ditinjau ulang setelah ada strategi resolusi konflik yang benar.

---

## ADR-013 — Bunga akrual tidak masuk net worth

**Status:** diterima · 2026-09-02

**Konteks.** Deposito dengan pembayaran bunga di akhir mengakumulasi bunga yang belum diterima.

**Keputusan.** Untuk `payout_schedule = at_maturity`, nilai berjalan deposito tetap sebesar pokok. Bunga akrual ditampilkan terpisah dengan label estimasi.

**Alternatif yang ditolak:**
- *Sertakan bunga akrual.* Nilai ekonomi yang lebih akurat. Ditolak karena bunga belum diterima dan mungkin tidak jadi diterima — pencairan dini umumnya menghanguskannya. Net worth yang memuat uang yang belum ada adalah kebohongan kecil yang menumpuk.

**Konsekuensi.** Net worth naik melonjak saat deposito cair, bukan bertambah bertahap. UI menjelaskannya lewat estimasi yang terlihat sepanjang waktu.

---

## ADR-014 — Server Action sebagai mekanisme mutasi utama

**Status:** diterima · 2026-09-02

**Konteks.** Butuh mekanisme mutasi type-safe dari UI.

**Keputusan.** Server Action untuk mutasi, Server Component untuk pembacaan awal, Route Handler hanya untuk pembacaan inkremental dan cron.

**Alternatif yang ditolak:**
- *REST API penuh.* Siap untuk klien mobile. Ditolak karena tidak ada klien mobile yang direncanakan, dan boilerplate-nya nyata. Fungsi service adalah kontrak sesungguhnya; menambahkan REST di atasnya nanti bersifat mekanis.
- *tRPC.* Type-safety bagus. Ditolak karena Server Action sudah menyediakannya secara native di App Router tanpa dependensi.

**Konsekuensi.** Server Action mengembalikan `ActionResult` alih-alih melempar, karena error yang dilempar di produksi tersamarkan menjadi pesan yang tidak berguna.

---

## ADR-015 — Kartu kredit sebagai liabilitas dengan saldo negatif

**Status:** diterima · 2026-09-02

**Konteks.** Kartu kredit dipakai untuk transaksi harian seperti dompet lain, tetapi secara ekonomi ia liabilitas, bukan aset.

**Keputusan.** Saldo `credit_card` ≤ 0, dijaga `CHECK`. Dikecualikan dari Total Kas. Masuk liabilitas sebesar nilai absolutnya.

**Alternatif yang ditolak:**
- *Modelkan kartu kredit sebagai `debts`.* Benar secara akuntansi. Ditolak karena kartu kredit dipakai untuk transaksi harian; memaksa pencatatan lewat modul hutang akan merusak alur input yang cepat.
- *Saldo positif berarti utang.* Menghindari angka negatif. Ditolak karena tanda menjadi bergantung pada jenis dompet, sehingga setiap agregasi harus mengingat aturannya. Satu konvensi tanda yang konsisten lebih aman.

**Konsekuensi.** Kartu kredit tampil di daftar dompet untuk pencatatan, tetapi dikelompokkan terpisah dan berlabel liabilitas.


---

## ADR-016 — Household sebagai lapisan, bukan pemilik

**Status:** diterima · 2026-09-02

**Konteks.** Kebutuhan baru: beberapa orang dapat melihat dan merencanakan keuangan bersama. Cara paling langsung memodelkannya adalah membuat household memiliki dompet bersama.

**Keputusan.** Household tidak memiliki apa pun. Tidak ada `wallets.household_id`, tidak ada tabel `household_wallets`, tidak ada kolom saldo di `households`. Semua angka keluarga adalah hasil agregasi saat query atas data milik anggota yang secara eksplisit dibagikan.

**Alternatif yang ditolak:**
- *Shared dompet / rekening bersama.* Terdengar alami untuk aplikasi keluarga, dan ini yang paling sering diminta. Ditolak karena meruntuhkan invarian dasar model data: satu dompet satu pemilik, saldo = jumlah ledger entry. Begitu dua orang dapat menulis ke satu dompet, muncul pertanyaan yang semuanya mahal — siapa boleh menghapus transaksi siapa, apa yang terjadi pada saldo saat seseorang keluar, bagaimana membagi saldo saat household bubar.
- *Household memiliki dompet, anggota diberi akses.* Memindahkan masalah, tidak menyelesaikannya: kepemilikan tetap ambigu saat keanggotaan berubah.

**Konsekuensi.** Beberapa kebutuhan harus dipenuhi dengan cara lain: "uang bersama untuk liburan" menjadi shared savings goal, "aku bayarkan dulu" menjadi transfer antar anggota. Keduanya lebih akurat menggambarkan apa yang benar-benar terjadi pada uangnya.

Keputusan ini **ditolak sebagai arah produk**, bukan sekadar ditunda. Menambahkannya kelak akan meruntuhkan invarian yang menjadi dasar seluruh model data.

---

## ADR-017 — `transfer_groups` sebagai entitas penuh

**Status:** **digantikan** oleh [ADR-023](#adr-023--transfer-antar-anggota-dicatat-masing-masing) · 2026-09-02

**Keputusan asal.** Tabel `transfer_groups` sebagai entitas penuh dengan `kind`, `status`, `household_id`, kedua dompet, kedua user, dan `expires_at`. `ledger_entries.transfer_group_id` menjadi foreign key ke sana.

**Kenapa dibatalkan.** Tabel itu ada untuk menampung status alur konfirmasi transfer. Ketika ADR-023 menghapus alur tersebut, tidak ada lagi yang perlu ditampung: transfer antar dompet sendiri sudah terhubung lewat `transaction_id`, dan transfer ke anggota lewat `linked_transaction_id`. Tabel penghubung di atasnya hanya menduplikasi informasi yang sudah ada.

Enum `transfer_kind` dan `transfer_status` ikut dihapus bersamanya.

---

## ADR-018 — Dua mode kontribusi savings: `committed` & `funded`

**Status:** **digantikan** oleh [ADR-026](#adr-026--savings-hanya-kontribusi-yang-memindahkan-uang) · 2026-09-02

**Keputusan asal.** Dua mode kontribusi. `funded` memindahkan uang dan menulis ledger entry; `committed` hanya mencatat niat tanpa ledger entry. Dua kolom cache terpisah (`funded_amount`, `committed_amount`), dijaga `CHECK sc_mode_consistency`.

**Kenapa dibatalkan.** Mode `committed` menambahkan angka ke pos tabungan sementara uangnya masih terhitung penuh di saldo dompet — jalur penghitungan ganda paling halus di sistem, dan satu-satunya yang memerlukan tiga lapis pertahanan hanya untuk menahannya. Nilainya, setelah ditimbang, tidak sepadan dengan risiko struktural permanen di jantung perhitungan aset.

---

## ADR-019 — Transfer antar anggota wajib dikonfirmasi penerima

**Status:** **digantikan** oleh [ADR-023](#adr-023--transfer-antar-anggota-dicatat-masing-masing) · 2026-09-02

**Keputusan asal.** Alur dua tahap. Pengirim membuat transfer berstatus `pending` dan saldonya langsung berkurang; penerima menerima, lalu saldonya bertambah. Menolak, membatalkan, atau kedaluwarsa (7 hari) menulis entry pembalik. Selisih di antara keduanya diwakili baris aset **"Dana dalam perjalanan"**.

**Kenapa dibatalkan.** Seluruh mekanisme itu berdiri di atas premis bahwa aplikasi **memindahkan** uang. Ia tidak — perpindahannya sudah terjadi lewat bank sebelum aplikasi menyentuhnya. Begitu premisnya dikoreksi, status, entry pembalik, kedaluwarsa, dan dana transit semuanya menjadi tidak diperlukan.

Jaminan yang hendak dicapai ADR ini — tidak ada yang menulis ke buku besar orang lain — justru menjadi **lebih kuat** setelah digantikan: ia kini ditegakkan bentuk API, bukan oleh alur persetujuan yang bisa dilewati.

---

## ADR-020 — `wallet_access` hanya `view` di MVP

**Status:** **digantikan** oleh [ADR-024](#adr-024--tidak-ada-acl-per-objek) · 2026-09-02

**Keputusan asal.** Tabel izin per-wallet per-user dipertahankan, tetapi dibatasi permission `view` lewat `CHECK wa_view_only_mvp`. `manage` disiapkan untuk masa depan.

**Kenapa dibatalkan.** Membatasi ke `view` mengurangi risikonya tetapi tetap membawa seluruh biaya konseptual sebuah ACL: permukaan berbagi ketiga yang harus diaudit terpisah, dan pertanyaan "siapa dapat melihat apa" yang berubah menjadi penelusuran graf. Pembenaran teknis terakhirnya — agar pengirim transfer dapat memilih dompet tujuan — hilang bersama ADR-023.

---

## ADR-021 — Konteks household berada di path URL

**Status:** diterima · 2026-09-02

**Konteks.** Pengguna berpindah antara melihat keuangan pribadinya dan keuangan keluarga. Konteks aktif harus disimpan di suatu tempat.

**Keputusan.** Konteks berada di path: `/` untuk pribadi, `/household/[id]` untuk keluarga. Context switcher adalah navigasi biasa, tanpa state global.

**Alternatif yang ditolak:**
- *Mode global di cookie/sesi.* Terasa seperti workspace switcher dan menghemat duplikasi rute. Ditolak karena setiap query harus sadar konteks, URL menjadi ambigu, dan muncul risiko nyata menampilkan data konteks yang salah — pada aplikasi keuangan, itu berarti menampilkan angka orang lain di layar yang mengaku milik Anda.
- *Konteks sebagai search param.* Ditolak karena search param mudah hilang saat navigasi internal.

**Konsekuensi.** Beberapa rute terduplikasi secara konseptual (transaksi pribadi vs pengeluaran keluarga), tetapi keduanya memang menampilkan hal berbeda dengan aturan visibilitas berbeda — menyatukannya akan menyembunyikan perbedaan itu, bukan menghilangkannya.

---

---

## ADR-022 — Snapshot household disimpan terpisah, tidak direkonstruksi

**Status:** diterima · 2026-09-02

**Konteks.** Kekayaan keluarga adalah agregasi. Secara teori ia dapat dihitung ulang kapan saja dari snapshot pribadi para anggota.

**Keputusan.** Tabel `household_net_worth_snapshots` tersendiri, ditulis cron harian, bersifat append-only, tidak pernah dihitung ulang.

**Alternatif yang ditolak:**
- *Hitung dari snapshot pribadi saat dibutuhkan.* Menghemat satu tabel. Ditolak karena cakupan berbagi berubah kapan saja — merekonstruksi kekayaan keluarga bulan lalu memakai aturan berbagi hari ini akan menghasilkan angka yang tidak pernah benar-benar dilihat siapa pun.

**Konsekuensi.** Snapshot menyimpan `contributing_count`, sehingga grafik tren dapat menandai titik di mana cakupan berubah. Lonjakan karena seorang anggota mulai berbagi bukan pertumbuhan kekayaan, dan grafik yang tidak menandainya akan menyiratkan sebaliknya.

---

## ADR-023 — Transfer antar anggota dicatat masing-masing

**Status:** **digantikan** oleh [ADR-030](#adr-030--transfer-ke-anggota-mencatat-kedua-sisi-sekaligus) · 2026-09-02 · merevisi [ADR-005](#adr-005--transfer-sebagai-ledger-entry-tanpa-tabel-grup)

> **Catatan pembatalan.** Koreksi premisnya benar dan tetap berlaku — aplikasi mencatat, bukan memindahkan. Yang keliru adalah kesimpulan turunannya: dari "premisnya salah" saya melompat ke "karena itu tiap orang harus mencatat sendiri", padahal premis yang sama justru berarti **kedua saldo memang seharusnya berubah sekaligus**. Alur saran satu tap adalah friksi yang tidak dibayar oleh manfaat apa pun.

**Konteks.** Rancangan sebelumnya memodelkan transfer antar anggota sebagai operasi dua tahap dengan status `pending`, entry pembalik, kedaluwarsa, dan konsep "dana dalam perjalanan" sebagai baris aset.

Peninjauan ulang menemukan bahwa seluruh mesin itu berdiri di atas premis yang keliru: **aplikasi ini diperlakukan seolah memindahkan uang.** Padahal tidak. Ketika Wahid mengirim Rp1 juta ke Istri lewat BCA, perpindahan itu sudah terjadi di dunia nyata sebelum aplikasi menyentuhnya. Yang dibutuhkan hanyalah dua catatan yang saling menunjuk.

**Keputusan.** Setiap orang mencatat sisinya sendiri:

- Wahid mencatat transfer keluar → satu ledger entry di dompet **miliknya**, `counterparty_user_id = Istri`.
- Istri mendapat **saran** untuk mencatat sisinya → satu ledger entry di dompet **miliknya**, dan `linked_transaction_id` menautkan keduanya dua arah.
- Saran bersifat **turunan dari query**, bukan tabel: transaksi ber-`counterparty_user_id = me` yang `linked_transaction_id IS NULL`.

Pengirim memilih **orang**, bukan dompet tujuan. Penerima memilih wallet-nya sendiri saat mencatat.

**Yang dihapus sebagai konsekuensi:**

| Dihapus | Alasan tidak lagi dibutuhkan |
|---------|------------------------------|
| Tabel `transfer_groups` | Entry transfer sendiri sudah terhubung lewat `transaction_id`; transfer antar anggota lewat `linked_transaction_id` |
| Enum `transfer_kind`, `transfer_status` | Tidak ada status untuk dilacak |
| Konsep "dana dalam perjalanan" | Tidak ada momen uang berada di antara dua dompet |
| Entry pembalik pada tolak/batal/kedaluwarsa | Tidak ada yang perlu dibalikkan |
| Cron kedaluwarsa transfer | Saran yang diabaikan cukup ditandai |
| Invarian I14, I15 (versi lama) | Keadaannya tidak dapat terjadi |
| Kebutuhan `wallet_access` bagi pengirim | Pengirim tidak perlu melihat dompet penerima |

**Alternatif yang ditolak:**
- *Alur pending + konfirmasi (rancangan sebelumnya).* Menjamin kedua sisi selalu seimbang. Ditolak karena menjamin sesuatu yang tidak perlu dijamin — dan biayanya adalah enam konsep tambahan yang semuanya harus benar.
- *Menulis kedua entry saat penerima menyetujui.* Lebih sederhana dari pending, tetapi tetap berarti satu operasi menulis ke dua ledger milik dua orang.

**Konsekuensi.** Bila sisi lawan tidak pernah mencatat, kekayaan keluarga turun sebesar nominal itu sampai ia mencatat. Ini disengaja dan jujur: dari sisi data keluarga, uang itu memang belum tercatat sampai di mana pun. UI menandainya eksplisit di dua tempat — badge pada transaksi pengirim, dan catatan penjelas di halaman kekayaan keluarga.

Yang diperoleh sebagai gantinya adalah jaminan yang jauh lebih kuat: **tidak ada satu pun jalur kode yang menerima dompet milik user lain sebagai target tulis.** Ia ditegakkan bentuk API, bukan oleh pemeriksaan izin yang bisa terlewat.

---

## ADR-024 — Tidak ada ACL per objek

**Status:** diterima · 2026-09-02

**Konteks.** Rancangan sebelumnya menyediakan `wallet_access` — tabel izin per-wallet per-user dengan permission `view`/`manage`, dibatasi `view` di MVP.

**Keputusan.** Tabel itu dihapus sepenuhnya. Berbagi hanya lewat dua mekanisme: tag transaksi ke household, dan `share_wealth` per keanggotaan.

**Alasan penolakan ACL:**

1. **Grant paling berbahaya dengan use case paling tidak jelas.** Berbagi dompet membuka saldo dan *setiap* transaksi di dalamnya — termasuk yang belum terjadi. Kebutuhan nyata keluarga ("kita lihat pengeluaran keluarga") sudah terpenuhi tag transaksi.
2. **Ortogonal terhadap household.** Izin dapat diberikan ke siapa saja, sehingga menjadi permukaan berbagi ketiga yang harus diaudit terpisah dari model household.
3. **Membuat "siapa dapat melihat apa" menjadi penelusuran graf.** Model izin yang tidak dapat dijawab dalam satu kalimat adalah model izin yang tidak dapat diaudit.
4. **Pembenaran terakhirnya hilang.** Satu-satunya kebutuhan teknis yang tersisa adalah agar pengirim transfer dapat memilih dompet tujuan — dan ADR-023 menghapusnya.

**Alternatif yang ditolak:**
- *Pertahankan `view` saja.* Lebih aman dari `manage`, tetapi tetap membawa seluruh biaya konseptual dan audit sebuah ACL.
- *Berbagi dompet ke seluruh household.* Berarti anggota yang bergabung belakangan otomatis mendapat akses yang tidak pernah disetujui pemiliknya.

**Konsekuensi.** Query visibilitas transaksi menyusut menjadi dua klausa tanpa subquery. Prosedur mengeluarkan anggota menyusut dari enam langkah menjadi tiga.

**Amandemen (ADR-030).** Agar transfer dapat dicatat ke rekening yang benar, **nama dan jenis** dompet anggota aktif terlihat oleh sesama anggota di pemilih tujuan. Itu bukan ACL — tidak dapat diberikan atau dicabut per orang, dan cakupannya berhenti di dua field. Saldo dan riwayat tetap tertutup; keputusan menolak ACL tidak berubah.

Kalau kebutuhan berbagi dompet terbukti nyata kelak, ia masuk lewat ADR baru dengan desain izin yang utuh — bukan sebagai kolom permission yang menumpang.

---

## ADR-025 — Dua peran household

**Status:** diterima · 2026-09-02

**Konteks.** Rancangan sebelumnya memakai empat peran: `owner`, `admin`, `member`, `viewer`.

**Keputusan.** Dua peran: `owner` dan `member`. Hanya empat aksi yang dibatasi peran — mengundang, mengeluarkan, mengubah identitas household, dan mengalihkan kepemilikan. Semuanya menyangkut keanggotaan, bukan uang.

**Alternatif yang ditolak:**
- *Empat peran.* RBAC skala perusahaan untuk 2–5 orang yang saling percaya. `admin` hanya berbeda pada "boleh mengundang". `viewer` tetap punya dompet sendiri dan tetap dapat berbagi datanya — ia hanya *member* yang kebetulan tidak mencatat, dan itu bukan sesuatu yang perlu ditegakkan sistem izin.
- *Satu peran (semua setara).* Menghilangkan kemampuan mengendalikan siapa boleh mengundang orang ke dalam konteks keuangan keluarga — kendali yang wajar untuk ada.

**Konsekuensi.** Matriks izin menyusut dari 11×4 menjadi 11×2 dan dapat diuji habis. `requireHouseholdMember` cukup menerima boolean `requireOwner`, tanpa tabel peringkat peran yang bisa salah dibaca. Anggota baru selalu `member`; peran `owner` hanya berpindah lewat pengalihan eksplisit.

---

## ADR-026 — Savings hanya kontribusi yang memindahkan uang

**Status:** diterima · 2026-09-02 · mempertegas [ADR-006](#adr-006--kontribusi-savings-sebagai-transfer-internal-sungguhan)

**Konteks.** Rancangan sebelumnya menambahkan mode `committed` — mencatat komitmen menabung tanpa memindahkan uang — untuk mendukung shared goal di mana dana tetap berada di rekening masing-masing.

**Keputusan.** Mode itu dihapus. Setiap kontribusi memindahkan uang: saldo dompet berkurang, pos tabungan bertambah, satu transaction, `ledger_entry_id NOT NULL`.

**Alasan penghapusan.** `committed` menambahkan angka ke pos tabungan sementara uangnya masih terhitung penuh di saldo wallet. Itu jalur penghitungan ganda paling halus yang bisa ada di sistem ini — dan satu-satunya yang memerlukan tiga lapis pertahanan (aturan tertulis, `CHECK` constraint, dan property test) hanya untuk menahannya.

Nilainya, setelah ditimbang, kecil: ia mencatat niat di aplikasi yang tugasnya mencatat uang. Niat sudah terwakili `target_amount` dan saran kontribusi bulanan.

**Alternatif yang ditolak:**
- *Pertahankan dua mode dengan pertahanan berlapis.* Bisa dibuat benar, tetapi menempatkan risiko struktural permanen di jantung perhitungan aset demi fitur pelengkap.
- *`committed` hanya untuk goal bersama.* Dua model savings yang harus dijelaskan terpisah ke pengguna, dengan risiko yang sama.

**Konsekuensi.** Shared goal tetap berfungsi tanpa saldo bersama: tiap anggota menyisihkan dana ke pos tabungan miliknya sendiri yang ditandai untuk goal itu. `savings_goals` kembali punya satu kolom `current_amount`, komponen `SplitProgress` tidak dibutuhkan, dan tiga invarian hilang bersama risikonya.

Bila pelacakan komitmen terbukti dibutuhkan, ia masuk di v1.x sebagai catatan non-finansial yang **tidak pernah** menyentuh perhitungan aset.

---

## ADR-027 — Kategori kanonis ber-`system_key`

**Status:** diterima · 2026-09-02

**Konteks.** Laporan dan budget household perlu mengelompokkan kategori milik anggota berbeda. Rancangan sebelumnya mencocokkan lewat nama ternormalisasi (`lower(btrim(name))`).

**Keputusan.** Kategori bawaan di-seed dari satu katalog kanonis di kode, masing-masing dengan `system_key` yang stabil. Agregasi dan budget household memakai kunci itu — pencocokan menjadi eksak.

Kategori kustom (`system_key IS NULL`) **tetap ditampilkan** di laporan household sebagai barisnya sendiri disertai nama pemiliknya; tidak dilebur ke "Lainnya" dan tidak dibuang.

**Alternatif yang ditolak:**
- *Pencocokan nama ternormalisasi.* "Makan & Minum" vs "Makan dan Minum" vs "Makanan" tidak akan cocok, dan kegagalannya berupa angka salah tanpa tanda apa pun — kelas bug terburuk untuk aplikasi keuangan.
- *Kategori milik household yang dipilih saat menandai.* Eksak, tetapi menambah satu langkah pada alur tersibuk aplikasi.
- *Budget household total saja.* Menghindari masalah dengan menghapus fiturnya; tidak perlu setelah pencocokan menjadi eksak.

**Konsekuensi.** Mengganti nama kategori bawaan tidak merusak agregasi, karena yang dipakai adalah kuncinya. Budget household hanya dapat dibuat untuk kategori bawaan — kategori kustom tidak dapat dicocokkan lintas anggota, tetapi tetap terlihat di laporan.

Kunci yang sudah dirilis tidak pernah diubah atau dipakai ulang. Menambah kategori bawaan berarti menambah entri katalog **dan** migrasi yang menyisipkannya untuk pengguna yang sudah ada.

---

## ADR-028 — Berbagi kekayaan: satu sakelar per anggota

**Status:** diterima · 2026-09-02

**Konteks.** Rancangan sebelumnya memakai `include_in_household` sebagai boolean di enam tabel — dompet, aset, deposito, hutang, piutang, savings goal — masing-masing default `false`.

**Keputusan.** Satu `household_members.share_wealth` (default `false`) per keanggotaan, ditambah `exclude_from_household` per item untuk pengecualian.

**Alternatif yang ditolak:**
- *Opt-in per item.* Terlihat lebih aman di atas kertas. Ditolak karena dalam praktik menghasilkan dua hasil: pengguna tidak mengaktifkan apa pun (fitur mati), atau ingin semuanya ikut dan harus menekan dua belas toggle di layar berbeda-beda. Privasinya sama; friksinya jauh lebih besar.
- *Berbagi otomatis saat bergabung.* Melanggar prinsip privat secara default.

**Konsekuensi.** Satu keputusan eksplisit dengan dialog yang menyebutkan persis apa yang akan dan **tidak** akan terlihat. Pengecualian tersedia untuk satu-dua item sensitif.

**Keterbatasan yang diketahui:** `exclude_from_household` bersifat global, bukan per household. Anggota yang tergabung di dua household dan ingin membagikan item berbeda ke masing-masing belum terlayani. Ditunda ke v1.x — kasusnya jarang, dan menyelesaikannya sekarang berarti mengembalikan kompleksitas per-item yang baru saja dihapus.

---

## ADR-029 — Kekayaan keluarga ditampilkan per anggota

**Status:** diterima · 2026-09-02

**Konteks.** Kekayaan keluarga adalah agregasi dari anggota yang berbagi. Rancangan sebelumnya menampilkan satu total besar disertai `CoverageNote` ("dari 2 dari 3 anggota").

**Keputusan.** Tampilan utama adalah rincian **per anggota**. Total muncul sebagai baris sekunder yang selalu menyebut cakupannya.

**Alasan.** "Rp245 juta dari 2 dari 3 anggota" adalah angka yang sulit dipakai untuk keputusan apa pun — cakupan yang dilampirkan menandai ketidaklengkapannya tanpa menjadikannya berguna. "Wahid 165 juta, Istri 80 juta, Adi belum berbagi" tidak ambigu sama sekali, dan pembacanya dapat menyimpulkan sendiri apa yang relevan baginya.

**Alternatif yang ditolak:**
- *Total besar + cakupan (rancangan sebelumnya).* Menambal gejala, bukan sebabnya.
- *Tidak menampilkan total sama sekali.* Terlalu jauh — "keluarga kita punya berapa" adalah pertanyaan yang sah, selama jawabannya menyebutkan cakupannya.

**Konsekuensi.** Anggota yang belum berbagi tetap ditampilkan berlabel — ketidakhadirannya adalah informasi. `breakdown.perAnggota` menjadi bagian utama snapshot household, dan respons API meletakkan `byMember` sebelum `totals`.

---

## ADR-030 — Transfer ke anggota mencatat kedua sisi sekaligus

**Status:** diterima · 2026-09-02 · menggantikan [ADR-023](#adr-023--transfer-antar-anggota-dicatat-masing-masing), mengamandemen [ADR-024](#adr-024--tidak-ada-acl-per-objek)

**Konteks.** ADR-023 mengoreksi premis dengan benar: aplikasi ini mencatat perpindahan uang, tidak melakukannya. Tetapi kesimpulan turunannya keliru — ia menyimpulkan bahwa tiap orang karena itu harus mencatat sisinya sendiri, dengan saran satu tap sebagai penghubung.

Premis yang sama justru mengarah ke tempat lain: kalau uangnya sudah benar-benar pindah, **kedua saldo memang seharusnya berubah** — dan menunda salah satunya sampai orang lain menekan tombol adalah menunda kebenaran yang sudah diketahui.

**Keputusan.** Satu pencatatan menulis kedua sisi dalam satu DB transaction:

- Dua baris `transactions`, satu per orang, `created_by` = pencatat pada keduanya, saling tertaut.
- Dua `ledger_entries`, masing-masing di dompet pemiliknya, `user_id` = pemilik wallet.
- **Pengirim memilih rekening tujuan** dari daftar dompet penerima yang terlihat.
- Penerima diberi tahu lewat halaman Aktivitas, bukan dimintai persetujuan.

Aturan 1.3 berubah dari absolut menjadi **satu pengecualian bernama**, dengan empat pengaman: teratribusi (`created_by`), terbatas bentuk (`CHECK tx_created_by_rule`), terlihat (Aktivitas + lencana), dan dapat dibatalkan sepihak oleh pemiliknya.

**Alternatif yang ditolak:**
- *Masing-masing mencatat sendiri (ADR-023).* Menjaga aturan 1.3 tetap absolut. Ditolak karena membeli kemurnian aturan dengan harga yang dibayar pengguna setiap kali: satu tap tambahan, satu daftar saran untuk dijaga, dan — sampai tap itu terjadi — kekayaan keluarga yang salah.
- *Sistem memakai dompet default penerima.* Menghindari paparan nama wallet. Ditolak karena uang masuk ke rekening tertentu; menebaknya berarti catatan jatuh di tempat salah dan penerima harus memindahkannya setiap kali.
- *Alur pending + konfirmasi (ADR-019).* Sudah ditolak sebelumnya; menambahkan status, entry pembalik, dan kedaluwarsa untuk jaminan yang tidak sepadan.

**Konsekuensi.**

Yang membaik: kekayaan keluarga tidak pernah salah, bahkan sesaat pun. Invarian menguat — `SUM` kedua entry selalu 0, tidak ada lagi keadaan "baru satu sisi tercatat". Satu halaman, satu query, dan satu kolom (`counterpart_dismissed_at`) hilang.

Yang menjadi tanggungan: seorang anggota dapat menulis entri masuk ke dompet anggota lain. Ini dicatat sebagai ancaman **H5b** di [12-security §5](12-security-and-auth.md#5-ancaman-khusus-household) — bukan karena diharapkan terjadi, tetapi agar mitigasinya tidak diam-diam dilepas kelak.

Yang perlu dijaga saat mengimplementasikan: `postEntries` kini dapat menerima entry milik dua pemilik berbeda dalam satu panggilan. Penyaring `userId` pada `UPDATE dompet` **wajib** diambil per entry — memakai `entries[0]` akan membuat UPDATE kedua tidak cocok baris mana pun, dan saldonya diam-diam tidak berubah.

---

## ADR-031 — Fintech modern dengan kerajinan iOS, bukan tiruan iOS

**Status:** diterima · 2026-09-02

**Konteks.** Aplikasi ini harus terasa modern, terutama di iOS. Bahasa desain iOS saat ini (Liquid Glass, iOS 26) mengandalkan material translusen, kontrol mengambang, dan kedalaman berlapis. Pertanyaannya: seberapa dekat kita menirunya.

Dua batasan nyata membentuk jawabannya. Ini **web app/PWA**, bukan SwiftUI — tidak ada akses ke material sistem, dan tiruannya hanya bisa lewat `backdrop-filter`. Dan pasar sasarannya Indonesia, yang mayoritas Android, dengan anggaran performa diukur di perangkat menengah.

**Keputusan.** Identitas visual milik sendiri; yang diadopsi adalah **kerajinan** iOS — material berlapis, radius konsentris, gerak berbasis pegas, disiplin safe-area, target sentuh yang tidak meleset.

**Alternatif yang ditolak:**

- *Meniru chrome iOS senyata mungkin* — font sistem, inset grouped list, large title yang mengecil, tab bar standar. Ditolak karena web yang "hampir native" masuk *uncanny valley*: setiap ketidaksamaan kecil justru menonjolkan bahwa ini bukan aplikasi asli. Di Android, chrome iOS terasa asing tanpa memberi keuntungan apa pun.
- *Adaptif per platform* — iOS memakai chrome iOS, Android memakai Material 3. Paling benar secara teori, ditolak karena melipatgandakan pekerjaan UI, pengujian, dan pemeliharaan komponen untuk aplikasi yang layarnya identik di kedua platform.

**Keputusan turunan: kaca terukur.** `backdrop-filter` hanya pada elemen mengambang yang jumlahnya tetap — bottom nav, sheet, sticky header, dialog, toast. Tidak pernah pada kartu atau item daftar.

Alasannya terukur, bukan selera: `backdrop-filter` memaksa rasterisasi ulang area di belakangnya setiap frame. Pada elemen berjumlah tetap, biayanya dapat diprediksi; pada daftar yang tumbuh seiring data, tidak. Anggaran maksimal **dua** elemen berkaca di layar ditegakkan review.

**Keputusan turunan kedua: hanya fitur yang ada di kedua mesin.** Basisnya Safari 17.4+ dan Chrome 120+, dan seluruh efek dikerjakan CSS — tanpa polyfill, tanpa library animasi, tanpa jalur khusus per platform.

Aturannya: **kalau sebuah efek butuh fitur yang timpang, efeknya yang diganti — bukan platformnya yang dikorbankan.** Yang dibuang karena itu: `corner-shape` (sudut kontinu), View Transitions, `animation-timeline: scroll()`, `field-sizing`, dan Vibration API.

Alternatif yang ditolak di sini: *pakai fitur unggul di platform yang mendukungnya, degradasi di platform lain.* Terdengar wajar, ditolak karena menghasilkan dua kualitas rasa untuk aplikasi yang sama — dan yang mendapat versi lebih rendah justru mayoritas pengguna kita.

Yang menggantikan mereka semuanya ada di kedua mesin: `@starting-style` + `transition-behavior: allow-discrete` untuk animasi masuk/keluar tanpa JS, Popover API untuk top layer tanpa `z-index`, `:has()` untuk state turunan tanpa event listener, container query untuk komponen yang benar di lebar wadah mana pun.

**Konsekuensi.** Beberapa hal dinyatakan sebagai batas, bukan kekurangan:

| Batasan | Konsekuensi desain |
|---------|--------------------|
| Tanpa haptik | Umpan balik selalu visual, < 100 ms |
| Tanpa sudut kontinu | Radius biasa, konsisten, sedikit lebih besar |
| Tanpa transisi elemen bersama antar halaman | Fade + geser 8px |
| Tanpa gestur back dari tepi layar | Tombol back selalu terlihat |
| `prefers-reduced-transparency` | Seluruh permukaan kaca punya varian solid |

Daftar ini pendek, dan itu disengaja: semua yang hilang bersifat tambahan. Tidak ada satu pun yang membuat aplikasi terasa kurang selesai bila tidak ada.

Keputusan ini layak ditinjau ulang bila aplikasi kelak dibungkus native — di sana material sistem dan haptik tersedia sungguhan, dan perhitungannya berubah.

---

## ADR-032 — SMTP (bukan Resend) untuk seluruh email transaksional

**Status:** diterima · 2026-09-02 (task 04) · didokumentasikan retroaktif task 23

**Konteks.** docs/12-security-and-auth.md §9 dan docs/13-deployment-vercel.md §3 aslinya menetapkan Resend sebagai penyedia email, dengan `RESEND_API_KEY` sebagai variabel wajib. Saat task 04 (autentikasi) diimplementasikan, kredensial yang sungguh-sungguh tersedia adalah akun Gmail sungguhan lewat SMTP, bukan akun Resend — dan `next-auth`'s `Nodemailer` provider sudah menerima konfigurasi SMTP langsung tanpa lapisan tambahan.

**Keputusan.** Seluruh email transaksional (magic link masuk, task 04; undangan household, task 11) memakai satu transport SMTP/nodemailer yang sama (`src/lib/email/magic-link.ts`, `src/lib/email/invitation.ts`), dikonfigurasi lewat `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_SECURE` di `src/lib/env.ts`. `RESEND_API_KEY` tetap ada di skema sebagai variabel opsional yang tidak dipakai — bukan dihapus, supaya migrasi ke Resend kelak (kalau volume email tumbuh melewati batas wajar akun Gmail pribadi) tidak butuh perubahan skema env.

**Alternatif yang ditolak:**
- *Menunggu kredensial Resend sebelum melanjutkan task 04.* Ditolak karena memblokir seluruh alur autentikasi pada dependensi eksternal yang tidak esensial — SMTP sudah memenuhi kebutuhan fungsional yang sama (kirim email transaksional sederhana) tanpa akun pihak ketiga baru.
- *Dua penyedia sekaligus (SMTP untuk auth, Resend untuk undangan).* Task 11 secara eksplisit menolak ini — satu transport lebih sedikit yang perlu diaudit untuk kebocoran data finansial (docs/12 §10), dan undangan bukan volume tinggi yang butuh infrastruktur pengiriman khusus.

**Konsekuensi.** docs yang menyebut Resend sebagai penyedia aktif (docs/12 §9, docs/13 §3) menyimpang dari implementasi sejak task 04 — diperbaiki di task 23 (lihat commit hardening task 23). Kalau volume email tumbuh sampai akun Gmail pribadi jadi tidak wajar (rate limit, deliverability), migrasi ke Resend atau penyedia transaksional lain adalah pekerjaan yang terisolasi ke `src/lib/email/**` dan `src/lib/env.ts` — tidak menyentuh domain logic.

---

## ADR-033 — Modul `obligations` menaungi hutang dan piutang

**Status:** diterima · 2026-09-02 (task 18) · didokumentasikan retroaktif task 23

**Konteks.** docs/11-tech-architecture.md's daftar folder awal menuliskan `features/debts` sebagai lokasi fitur hutang-piutang. Saat task 18 diimplementasikan, hutang (`debts`) dan piutang (`receivables`) ternyata berbagi hampir seluruh bentuk: kedua-duanya adalah kewajiban/pokok berkurang lewat pembayaran bertahap, kedua-duanya punya `remaining_amount` ter-cache yang direkonsiliasi lewat pola yang identik (`src/lib/db/reconcile.ts`'s `findDebtRemainingDrift`/`findReceivableRemainingDrift`), dan kedua-duanya butuh query visibilitas household yang sama bentuknya.

**Keputusan.** Satu modul `src/features/obligations/` (bukan dua modul `debts`/`receivables` terpisah) menaungi kedua entitas, dengan sub-bagian per jenis di dalamnya. `src/lib/finance/obligation.ts` menjadi satu tempat untuk kalkulasi sisa pokok yang dipakai kedua arah. `src/features/debts/` ditinggalkan sebagai folder `.gitkeep` kosong, bukan dihapus, sebagai penanda bahwa lokasi itu sengaja tidak dipakai — bukan terlewat.

**Alternatif yang ditolak:**
- *Dua modul terpisah, `features/debts` dan `features/receivables`.* Sesuai penamaan skema DB (`debts`, `receivables` adalah dua tabel terpisah, sengaja — lihat docs/04). Ditolak karena hampir seluruh logika UI dan service akan terduplikasi baris demi baris antara dua modul yang berbeda hanya pada satu bit arah (aku berutang vs orang berutang padaku).

**Konsekuensi.** docs/11-tech-architecture.md's daftar folder (dan referensi lain ke "modul debts") menyimpang dari struktur sungguhan sejak task 18 — diperbaiki di task 23. Skema DB tetap dua tabel terpisah (`debts`, `receivables`) — ADR ini hanya tentang pengelompokan di lapisan `features/`, bukan penggabungan skema.

---
