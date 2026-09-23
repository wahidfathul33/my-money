# 11 — Security & Auth

Aplikasi ini menyimpan gambaran lengkap kondisi keuangan seseorang, dan menghubungkan beberapa orang dalam satu household. Kebocorannya lebih merusak daripada kebocoran kebanyakan aplikasi konsumen.

Model otorisasinya sengaja dibuat sesederhana mungkin — bukan karena keamanannya tidak penting, justru sebaliknya. Model izin yang rumit adalah model izin yang tidak dapat diaudit.

## 1. Autentikasi

**Auth.js v5** dengan Drizzle adapter di Neon.

| Aspek | Pilihan |
|-------|---------|
| Provider | Google OAuth (utama) · Magic link email (cadangan) |
| Strategi sesi | **Database session**, bukan JWT |
| Durasi | 30 hari, bergulir |
| Cookie | `httpOnly`, `secure`, `sameSite: 'lax'`, prefix `__Secure-` |
| CSRF | Bawaan Auth.js, aktif |

**Kenapa database session:** JWT tidak dapat dicabut sebelum kedaluwarsa. Untuk aplikasi keuangan, "keluarkan saya dari semua perangkat" harus bekerja seketika — dan mengeluarkan anggota dari household harus langsung menutup aksesnya.

**Tanpa password:** tidak ada kebocoran hash, tidak ada credential stuffing, tidak ada alur reset password untuk diserang.

## 2. Model Otorisasi

Seluruh model muat dalam tiga kalimat:

```
1. Anda punya akses penuh atas data milik Anda.          (<tabel>.user_id = sesi)
2. Anda dapat melihat data yang pemiliknya bagikan       (tag transaksi · share_wealth)
   ke household tempat Anda menjadi anggota aktif,
   ditambah nama & jenis dompet anggota lain.
3. Peran household hanya mengatur objek milik household. (undangan, keanggotaan, nama)
4. Satu operasi boleh menulis ke ledger anggota lain:    (mencatat transfer ke anggota)
   teratribusi, terbatas, dan dapat dibatalkan pemiliknya.
```

**Tidak ada daftar kontrol akses.** Tidak ada tabel izin per objek per user. Tidak ada permission yang dapat diberikan seseorang kepada orang lain di luar dua mekanisme berbagi di [03 §5](03-domain-model.md#5-model-berbagi).

Ini keputusan sadar. ACL per objek (`wallet_access` dan sejenisnya) menjadikan pertanyaan *"siapa dapat melihat apa?"* sebagai penelusuran graf yang harus diaudit terpisah dari household — untuk kasus penggunaan yang sudah tertutupi oleh dua mekanisme yang ada.

### 2.1 Konsekuensi yang harus dipahami

- Seorang `owner` household **tidak dapat** melihat saldo dompet anggotanya. Ia hanya melihat namanya, di pemilih tujuan transfer.
- Seorang `owner` **tidak dapat** melihat transaksi anggota yang tidak ditandai household.
- **Tidak ada** cara memberi seseorang akses baca ke isi sebuah wallet.
- **Tepat satu** operasi menulis `ledger_entry` ke dompet milik user lain: mencatat transfer ke anggota. Ia tidak dapat diperluas — `CHECK tx_created_by_rule` menolak bentuk lain di level database.

Kalau muncul kebutuhan yang melanggar salah satunya, itu perubahan produk yang butuh ADR baru — bukan penyesuaian query.

### 2.2 Peran household

| Aksi | owner | member |
|------|:-----:|:------:|
| Melihat laporan agregat household | ✓ | ✓ |
| Menandai transaksi sendiri ke household | ✓ | ✓ |
| Mengaktifkan `share_wealth` untuk dirinya | ✓ | ✓ |
| Membuat & mengubah budget household | ✓ | ✓ |
| Membuat & berkontribusi ke shared goal | ✓ | ✓ |
| Mencatat transfer ke anggota | ✓ | ✓ |
| Mengundang & mencabut undangan | ✓ | ✗ |
| Mengeluarkan anggota | ✓ | ✗ |
| Mengubah nama / zona waktu / arsipkan | ✓ | ✗ |
| Mengalihkan kepemilikan | ✓ | ✗ |

Hanya empat aksi yang dibatasi peran, dan semuanya menyangkut keanggotaan atau identitas household — bukan uang. Matriks sekecil ini dapat diuji habis.

## 3. Penegakan Berlapis

**Lapisan 1 — Middleware.** Rute di bawah `(app)` menolak permintaan tanpa sesi.

```ts
export { auth as middleware } from '@/lib/auth'
export const config = {
  matcher: ['/((?!api/auth|api/cron|signin|invite|_next|favicon.ico).*)'],
}
```

**Lapisan 2 — `requireUser()`.** Baris pertama setiap Server Action dan route handler.

**Lapisan 3 — `requireHouseholdMember()`.** Setiap operasi yang menyentuh `household_id`, dipanggil **di dalam transaction** — keanggotaan dapat dicabut kapan saja.

```ts
// src/lib/auth/require-household.ts
export async function requireHouseholdMember(
  tx: TransactionClient,
  userId: string,
  householdId: string,
  requireOwner = false,
): Promise<HouseholdMembership> {
  const [membership] = await tx.select().from(householdMembers)
    .where(and(
      eq(householdMembers.householdId, householdId),
      eq(householdMembers.userId, userId),
      eq(householdMembers.status, 'active'),
    ))
    .limit(1)

  // NotFound, bukan Forbidden: membedakan "tidak ada" dari "bukan anggota"
  // membocorkan keberadaan household orang lain kepada penebak UUID.
  if (!membership) throw new NotFoundError('Household tidak ditemukan')
  if (requireOwner && membership.role !== 'owner') {
    throw new ForbiddenError('Hanya pemilik keluarga yang dapat melakukan ini')
  }
  return membership
}
```

Dengan dua peran, parameternya cukup boolean. Tidak ada peringkat peran untuk dibandingkan, tidak ada tabel peringkat untuk salah dibaca.

**Lapisan 4 — Scoping query.** Helper yang mewajibkan pemilik secara struktural:

```ts
export function ownedBy<T extends { userId: PgColumn }>(table: T, userId: string) {
  return eq(table.userId, userId)
}
```

**Lapisan 5 — Verifikasi referensi.** Setiap entitas yang dirujuk saat menulis (dompet, kategori, goal, household) diverifikasi kepemilikan atau keanggotaannya **di dalam** DB transaction.

## 4. Query Visibilitas

Hanya ada **dua** bentuk pembacaan lintas-user. Keduanya diimplementasikan sekali di `src/lib/visibility/**` dan tidak pernah ditulis ulang di tempat lain.

### 4.1 Transaksi yang boleh dilihat

```sql
SELECT t.* FROM transactions t
WHERE t.voided_at IS NULL
  AND (
    t.user_id = $me
    OR (t.household_id IS NOT NULL AND t.household_id = ANY($my_active_household_ids))
  )
```

Dua klausa, itu saja. Tidak ada subquery ke tabel izin, tidak ada `EXISTS` bertingkat.

### 4.3 Dompet yang boleh dipilih sebagai tujuan transfer

```sql
-- Nama & jenis saja. Kolom balance TIDAK PERNAH ikut di-SELECT di sini.
SELECT w.id, w.name, w.type, w.icon, w.color, w.user_id
FROM dompet w
JOIN household_members hm
  ON hm.user_id = w.user_id
 AND hm.household_id = $household
 AND hm.status = 'active'
WHERE w.is_archived = false
  AND w.exclude_from_household = false
  AND w.type <> 'credit_card'
```

Query ini dipisah dari query dompet biasa justru agar `balance` tidak ikut terbawa tanpa sengaja. Tipe kembaliannya (`TransferTargetDto`) tidak punya field saldo sama sekali — kebocoran saldo lewat jalur ini menjadi kesalahan tipe, bukan kesalahan review.

Kartu kredit dikecualikan: mentransfer *ke* kartu kredit adalah pembayaran tagihan, alur yang berbeda.

`$my_active_household_ids` diambil sekali per request dari sesi.

### 4.2 Item yang masuk kekayaan household

```sql
SELECT w.* FROM dompet w
JOIN household_members hm
  ON hm.user_id = w.user_id
 AND hm.household_id = $household
 AND hm.status = 'active'
 AND hm.share_wealth = true          -- opt-in di tingkat anggota
WHERE w.exclude_from_household = false
```

Pola yang sama berlaku untuk `assets`, `debts`, `receivables`, dan `savings_goals`.

`hm.status = 'active'` bukan formalitas: tanpanya, data anggota yang sudah keluar akan terus muncul di kekayaan keluarga.

**Coverage `lib/visibility/**` ditargetkan 100% cabang.** Modul ini kecil, murni, dan menentukan siapa boleh melihat data siapa — kombinasi yang membuat cakupan penuh terjangkau sekaligus wajib.

## 5. Ancaman Khusus Household

| # | Ancaman | Mitigasi |
|---|---------|----------|
| H1 | Menandai transaksi ke household yang bukan miliknya | `requireHouseholdMember` di dalam transaction saat menulis `household_id` |
| H2 | Membaca laporan household lewat tebakan UUID | `requireHouseholdMember` pada setiap query agregat; `NotFoundError`, bukan `ForbiddenError` |
| H3 | Undangan dipakai ulang atau oleh orang lain | Token ter-hash; sekali pakai lewat `WHERE status='pending'` dalam transaction; terikat email terverifikasi |
| H4 | Menaikkan peran sendiri | Hanya `owner` yang dapat mengalihkan kepemilikan; unique index menjamin satu owner aktif |
| H5 | Menulis ke ledger anggota lain di luar transfer | `CHECK tx_created_by_rule` menolak `created_by <> user_id` selain pada sisi penerima transfer |
| H5b | Menyuntik transfer palsu ke ledger anggota | Terbatas anggota aktif · teratribusi `created_by` · muncul di Aktivitas penerima · dapat di-void sepihak |
| H6 | Anggota yang dikeluarkan masih melihat data | `status = 'active'` di semua query visibilitas; dievaluasi per query, bukan per sesi |
| H7 | Enumerasi anggota lewat undangan | Respons tidak mengungkap apakah email sudah terdaftar |
| H8 | Menarik kontribusi anggota lain dari shared goal | Penarikan dibatasi kontribusi milik sendiri, ke dompet sendiri |
| H9 | Kebocoran nama lewat pesan error | Pesan error household tidak pernah memuat nama anggota atau nominal |
| H10 | Berbagi berlebihan tanpa sadar | Default privat; `share_wealth` sekali klik dengan deskripsi jelas; satu layar peninjauan |

**H5b adalah harga dari kesederhanaan model transfer.** Seorang anggota dapat menulis entri masuk ke dompet anggota lain. Yang membatasinya bukan pencegahan, melainkan **keterlihatan dan reversibilitas**: entri itu selalu terlihat di Aktivitas penerima, selalu menyebut siapa penulisnya, dan selalu dapat dihapus sepihak.

Dalam household yang keanggotaannya diundang dan disetujui, itu perimbangan yang wajar. Ia tetap dicatat sebagai ancaman agar mitigasinya tidak diam-diam dilepas kelak.

### Pencabutan saat keluar

Satu transaction:

```
1. household_members.status → 'removed', removed_at → now()
2. household_members.share_wealth → false
3. Terapkan pilihan user atas tag transaksi: pertahankan atau lepas
```

Tiga langkah. Sebelum ACL dihapus, langkah ini melibatkan pencabutan izin dua arah dan pembatalan transfer menggantung — pekerjaan yang kini tidak ada karena objeknya tidak ada.

## 6. Validasi Input

| Vektor | Mitigasi |
|--------|----------|
| SQL injection | Drizzle memparameterisasi seluruhnya; `sql.raw` dilarang aturan lint |
| XSS | React meng-escape bawaan; `dangerouslySetInnerHTML` dilarang |
| Manipulasi nominal | Zod di batas; aturan bisnis di service; `CHECK` constraint sebagai jaring terakhir |
| IDOR | Semua query di-scope pemilik/keanggotaan; UUID v7 tidak dapat ditebak berurutan |
| Mass assignment | Skema Zod memuat daftar field yang diizinkan |
| Nama household berisi markup | Di-escape saat render; panjang dibatasi 60 karakter |

## 7. Rate Limiting

| Endpoint | Batas |
|----------|-------|
| Percobaan login | 5 / 15 menit per IP |
| Mutasi (semua) | 60 / menit per user |
| Pencarian | 30 / menit per user |
| Mengirim undangan | 10 / hari per household, 3 / jam per user |
| Percobaan token undangan | 10 / jam per IP |
| Ekspor data | 3 / jam per user |

Batas undangan mencegah household dipakai sebagai saluran spam email; batas token mencegah penebakan brute force.

**Fail open** untuk mutasi biasa agar tidak memblokir pengguna sah; **fail closed** untuk login, undangan, dan ekspor.

## 8. Endpoint Cron

```ts
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  // …
}
```

`CRON_SECRET` minimal 32 karakter acak, hanya di environment variable Vercel.

## 9. Kerahasiaan

| Rahasia | Penyimpanan |
|---------|-------------|
| `DATABASE_URL` / `_UNPOOLED` | Env var Vercel, terpisah per environment |
| `AUTH_SECRET` | Env var Vercel, berbeda per environment |
| Kredensial OAuth | Env var Vercel |
| `CRON_SECRET` | Env var Vercel |
| Kredensial SMTP (`SMTP_USER`/`SMTP_PASSWORD`) | Env var Vercel |
| Kunci API harga emas | Env var Vercel, opsional |
| Token undangan | **Tidak disimpan** — hanya hash SHA-256 |

`.env*` masuk `.gitignore` kecuali `.env.example`. Tidak ada rahasia berprefiks `NEXT_PUBLIC_`. Pemindaian rahasia berjalan di CI.

## 10. Privasi Data

**Aturan logging:**

```ts
// SALAH
logger.info('transaksi dibuat', { amount, note, walletId })

// BENAR
logger.info('transaksi dibuat', { userId: user.id, transactionId: created.id, type })
```

Tidak pernah dicatat: nominal · catatan transaksi · saldo dompet · nilai net worth · nama kreditur/debitur · nama bank · kepemilikan aset · **nama household** · **nama anggota**.

Scrubber membuang field yang cocok dengan pola nominal dan nama field sensitif sebelum exception dikirim ke observability.

**Analytics** mode privasi: mencatat "transaksi dibuat" dan "undangan dikirim", tidak pernah nominal maupun identitas.

**Email undangan** hanya memuat nama household dan nama pengundang — tidak pernah data finansial. Email transit lewat pihak ketiga dan sering tersimpan tanpa enkripsi di sisi penerima.

## 11. Hak Pengguna atas Datanya

| Hak | Implementasi |
|-----|--------------|
| Ekspor | CSV seluruh transaksi, dompet, aset, hutang **milik user** |
| Hapus | Cascade delete penuh, segera dan permanen |
| Akses | Semua datanya sudah terlihat di aplikasi |
| Koreksi | Semua record dapat diedit atau di-void |
| Keluar dari household | Kapan saja, tanpa persetujuan siapa pun |
| Berhenti berbagi | Satu toggle, berlaku pada permintaan berikutnya |

**Menghapus akun saat menjadi owner household** memerlukan pengalihan kepemilikan atau pengarsipan household lebih dulu. Aplikasi menyatakannya jelas dengan tautan tindakan, bukan sekadar penolakan.

**Menghapus akun tidak menghapus transaksi anggota lain** yang ditandai ke household yang sama — data itu milik mereka.

## 12. Header Keamanan

```ts
const securityHeaders = [
  { key: 'X-Frame-Options',        value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://lh3.googleusercontent.com",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]
```

`Referrer-Policy` penting karena adanya tautan undangan — tanpanya token dapat bocor lewat header `Referer` ketika penerima mengklik tautan lain dari halaman undangan.

## 13. Model Ancaman Umum

| Ancaman | Kemungkinan | Dampak | Mitigasi |
|---------|-------------|--------|----------|
| IDOR — data user lain | Sedang | Kritis | Scoping berlapis + test lintas-user wajib |
| IDOR — data household lain | Sedang | Kritis | `requireHouseholdMember` + test lintas-household wajib |
| Pengambilalihan sesi | Rendah | Kritis | Cookie httpOnly/secure; sesi DB dapat dicabut |
| Kredensial DB bocor ke bundle klien | Rendah | Kritis | Aturan lint melarang import DB dari client |
| Rahasia ter-commit | Sedang | Tinggi | Secret scanning CI |
| SQL injection | Sangat rendah | Kritis | Drizzle terparameterisasi |
| CSRF pada mutasi | Rendah | Tinggi | CSRF Auth.js + `sameSite: lax` |
| Data finansial di log | Sedang | Tinggi | Aturan logging + scrubber |
| Cron dipicu pihak luar | Sedang | Sedang | Bearer `CRON_SECRET` |
| Korupsi data akibat balapan | Sedang | Kritis | DB transaction, `FOR UPDATE`, idempotency |
| Token undangan bocor | Sedang | Tinggi | Hash di DB, kedaluwarsa 7 hari, sekali pakai, dapat dicabut |
| **Berbagi berlebihan tanpa sadar** | **Sedang** | Sedang | Default privat; satu toggle dengan deskripsi jelas; layar peninjauan |
| Dependensi bermasalah | Sedang | Tinggi | Dependabot, `npm audit` di CI |

Baris "berbagi berlebihan" turun dari *tinggi* ke *sedang* dibanding rancangan sebelumnya: dengan satu sakelar dan deskripsi eksplisit, jauh lebih sulit membagikan sesuatu tanpa menyadarinya dibanding dengan belasan toggle yang tersebar di banyak layar.

## 14. Checklist Review Keamanan

Wajib sebelum merge apa pun yang menyentuh data, auth, atau household:

**Umum**
- [ ] Setiap query baru menyaring pemiliknya.
- [ ] Ada test yang membuktikan user B tidak dapat mengakses data user A.
- [ ] Tidak ada nilai finansial dalam pemanggilan log.
- [ ] Input divalidasi Zod di batas.
- [ ] Referensi entitas diverifikasi kepemilikannya di dalam transaction.
- [ ] Tidak ada rahasia baru di kode atau variabel `NEXT_PUBLIC_*`.
- [ ] Route handler baru punya rate limit.

**Household**
- [ ] Setiap operasi yang menyentuh `household_id` memanggil `requireHouseholdMember` **di dalam** transaction.
- [ ] Query visibilitas menyaring `household_members.status = 'active'`.
- [ ] Query kekayaan household juga menyaring `share_wealth = true`.
- [ ] Ada test yang membuktikan anggota household X tidak dapat membaca data household Y.
- [ ] Ada test yang membuktikan `member` tidak dapat melakukan aksi khusus `owner`.
- [ ] Ada test yang membuktikan anggota yang dikeluarkan langsung kehilangan akses.
- [ ] **Tidak ada operasi baru yang menerima dompet milik user lain sebagai target tulis** selain `createMemberTransfer`.
- [ ] Query pemilih tujuan transfer tidak pernah menyertakan kolom `balance`.
- [ ] Pesan error tidak mengungkap keberadaan household atau identitas anggota.
