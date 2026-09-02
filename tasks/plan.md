# Rencana Implementasi — MyMoney

Rencana teknis untuk membangun MyMoney sesuai [docs/](../docs/README.md). Dokumen ini menjelaskan **bagaimana** pekerjaan disusun; **apa** yang dibangun ada di docs, dan **rincian per langkah** ada di masing-masing `tasks/<n>-<slug>/`.

## 1. Bentuk Pekerjaan

24 task, dikelompokkan dalam 7 fase. Setiap task:

- adalah **irisan vertikal** — skema, service, action, dan UI sekaligus, bukan satu lapisan saja;
- menghasilkan sesuatu yang **dapat dicoba** di preview Vercel;
- menyentuh **≤ 5 berkas produksi** di luar berkas baru miliknya sendiri;
- punya kriteria penerimaan yang **dapat diuji**, bukan deskriptif;
- selesai dalam **satu sesi fokus**.

Kalau sebuah task terasa lebih besar dari itu saat dikerjakan, pecah dulu sebelum melanjutkan. Task yang membengkak adalah tanda ada keputusan yang belum diambil, bukan tanda perlu bekerja lebih lama.

## 2. Fase & Urutan

| Fase | Task | Hasil yang dapat dicoba |
|------|------|-------------------------|
| F0 Fondasi | 00–04 | Login berfungsi di preview, database bermigrasi lewat CI |
| F1 Ledger inti | 05–09 | **Aplikasi layak dipakai harian** — catat, transfer, tinjau |
| F2 Household | 10–13 | Dua akun berbagi konteks keuangan tanpa berbagi rekening |
| F3 Perencanaan | 14–15 | Budget & savings goal, pribadi dan bersama |
| F4 Kekayaan | 16–18 | Emas, deposito, hutang & piutang |
| F5 Insight | 19–21 | Net worth pribadi & keluarga, dashboard, laporan |
| F6 Rilis | 22–23 | Berbagi, PWA, pengerasan, peluncuran |

Graf dependensi lengkap: [docs/15-roadmap.md](../docs/15-roadmap.md#2-graf-dependensi).

### Kenapa household di F2

Household menyentuh hampir setiap modul sesudahnya — budget punya dua cakupan, savings goal punya `household_id`, aset dan hutang punya `exclude_from_household`, net worth punya dua bentuk. Membangun modul-modul itu lebih dulu tanpa kesadaran household berarti membangunnya dua kali.

Biayanya: aplikasi terasa "lengkap" lebih lambat. Sepadan, karena task 09 sudah menghasilkan aplikasi yang layak dipakai harian.

## 3. Yang Dapat Dikerjakan Paralel

| Dapat paralel | Syarat |
|---------------|--------|
| 01 & 03 | Setelah 00 |
| 05 & 06 | Setelah 04 |
| 08 & 09 | Setelah 07 |
| 12 & 13 | Setelah 11 |
| 14 & 15 | Setelah 11 |
| 16, 17, 18 | Setelah 12 |
| 20, 21, 22 | Setelah 19 |

**Jalur kritis:** 00 → 03 → 04 → 05 → 07 → 10 → 11 → 19 → 23. Keterlambatan di sini menggeser seluruh jadwal; keterlambatan di luar jalur ini tidak.

## 4. Risiko dan Penanganannya

| # | Risiko | Kemungkinan | Dampak | Penanganan |
|---|--------|-------------|--------|------------|
| R1 | Driver Neon HTTP dipakai untuk penulisan finansial | Tinggi | Kritis — atomisitas hilang diam-diam | Pisah modul `db/read` dan `db/write` di task 03; aturan lint; test rollback wajib |
| R2 | Uang direpresentasikan sebagai `number` di suatu tempat | Sedang | Kritis — galat pembulatan menumpuk | Tipe `Money = bigint` di task 03; aturan lint melarang `number` pada field nominal |
| R3 | Query lupa menyaring pemilik | Sedang | Kritis — data orang lain bocor | Helper `ownedBy`/`requireHouseholdMember`; test isolasi wajib per modul |
| R4 | Angka tabungan naik tanpa saldo dompet turun | Sedang | Tinggi — net worth membengkak palsu | `ledger_entry_id NOT NULL` di task 03; property test sebelum implementasi |
| R5 | Operasi lintas-ledger meluas di luar transfer ke anggota | Sedang | Kritis — model kepercayaan runtuh | `CHECK tx_created_by_rule` di task 03; invarian I11 & I19 diperiksa harian |
| R6 | Total kekayaan keluarga ditampilkan tanpa cakupan | Sedang | Sedang — angka menyesatkan | Per anggota sebagai tampilan utama; `coverage` prop non-opsional pada total |
| R7 | Zona waktu salah pada agregasi | Sedang | Tinggi — laporan bergeser sehari | Helper tanggal terpusat; test batas hari & bulan |
| R8 | Bundle membengkak melewati anggaran | Sedang | Sedang | Lighthouse CI sejak task 02, bukan menjelang rilis |
| R9 | Household bikin aplikasi terasa berat bagi pengguna solo | Sedang | Sedang | Tanpa household, tidak ada elemen household yang terlihat — diuji di task 10 |
| R10 | Email undangan tidak sampai | Sedang | Sedang | Domain terverifikasi SPF+DKIM di task 11; inbox uji di preview |

**R1 sampai R5 adalah risiko yang tidak boleh ditemukan di produksi.** Semuanya punya penangkap otomatis (constraint, lint, atau test) yang dipasang di task tempat risikonya pertama muncul — bukan di task pengerasan.

## 5. Checkpoint

Berhenti dan tinjau sebelum melanjutkan:

| Setelah | Yang diverifikasi |
|---------|-------------------|
| 04 | Login berfungsi di preview. Migrasi berjalan di CI. |
| 07 | Saldo berubah benar. Rekonsiliasi 0 selisih. |
| **09** | **Aplikasi layak dipakai sendiri setiap hari.** |
| 11 | Dua akun dalam satu household. Isolasi lintas-household hijau. |
| 12 | Bergabung tidak membagikan apa pun. Pencabutan seketika. Coverage `lib/visibility` 100%. |
| **13** | **Invarian I11 & I19 hijau — operasi lintas-ledger tidak bocor.** |
| 15 | Setiap kontribusi berpasangan ledger entry; net worth tidak berubah. |
| 18 | Semua sumber aset & liabilitas ada. |
| 19 | Rincian menjumlah tepat. Cakupan benar. |
| 23 | Seluruh DoD terpenuhi. |

## 6. Definisi Selesai per Task

Sebuah task selesai bila **semua** terpenuhi:

- [ ] Kriteria penerimaan di `spec.md` terpenuhi seluruhnya.
- [ ] `npm run verify` hijau (typecheck + lint + test).
- [ ] Test yang diminta `spec.md` ada, dan **pernah merah** sebelum implementasi.
- [ ] Untuk task finansial: invarian terdampak punya test.
- [ ] Untuk task household: test isolasi lintas-household dan penegakan peran ada.
- [ ] Berfungsi di preview Vercel, diperiksa manual di lebar 360px.
- [ ] Dokumen yang terdampak sudah diperbarui bila ada keputusan yang berubah.
- [ ] PR menyebut bagian spec yang diimplementasikan.

## 7. Kalau Spec dan Kenyataan Berbeda

Selama implementasi, pasti ada hal yang tidak terpikir saat menulis spec. Urutannya:

1. **Berhenti.** Jangan menyelesaikannya diam-diam di kode.
2. Putuskan: apakah spec yang salah, atau pemahamannya?
3. Kalau spec yang salah — **perbarui docs dulu**, baru lanjutkan.
4. Kalau keputusannya arsitektural — tambahkan ADR di [docs/16-decision-log.md](../docs/16-decision-log.md).
5. Sebutkan perubahan itu di PR.

Spec yang menyimpang dari kode lebih buruk daripada tidak ada spec, karena orang berikutnya akan memercayainya.
