# 05 — Financial Integrity

Bagaimana sistem menjamin angkanya benar. Dokumen ini memuat aturan yang tidak boleh dilanggar dengan alasan apa pun.

## 1. Peringatan Driver Neon (baca sebelum menulis kode DB)

Neon menyediakan dua driver, dan **memilih yang salah akan diam-diam menghancurkan atomisitas.**

| Driver | Import Drizzle | Transaksi multi-statement | Kegunaan |
|--------|----------------|---------------------------|----------|
| `neon-http` | `drizzle-orm/neon-http` | ❌ **Tidak didukung** | Query read-only sederhana |
| `neon-serverless` (WebSocket, Pool) | `drizzle-orm/neon-serverless` | ✅ Didukung | **Semua penulisan finansial** |

Driver HTTP mengirim setiap statement sebagai request terpisah. `db.transaction(...)` di atas `neon-http` tidak memberi jaminan atomisitas yang Anda kira — dan kegagalan di tengah akan meninggalkan saldo yang tidak konsisten tanpa error apa pun.

**Aturan:** setiap operasi yang menyentuh lebih dari satu tabel memakai koneksi `neon-serverless`. Ini dipaksakan lewat pemisahan modul:

```ts
// src/lib/db/read.ts   — neon-http, cepat, hanya SELECT
export const dbRead = drizzle(neon(process.env.DATABASE_URL!), { schema })

// src/lib/db/write.ts  — neon-serverless, transaksional
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const dbWrite = drizzle(pool, { schema })
```

Aturan lint kustom melarang import `dbWrite` dari Server Component, dan melarang `insert`/`update`/`delete` melalui `dbRead`.

## 2. Representasi Uang

```ts
// src/lib/finance/money.ts

/** Nominal uang dalam satuan minor (sen). Selalu bigint, tidak pernah number. */
export type Money = bigint

/** Faktor skala: 1 rupiah = 100 satuan minor. */
export const MINOR_UNITS = 100n

export function fromRupiah(rupiah: number | string): Money {
  const [whole, frac = ''] = String(rupiah).split('.')
  const cents = (frac + '00').slice(0, 2)
  return BigInt(whole) * MINOR_UNITS + BigInt(cents)
}

export function formatIDR(amount: Money): string {
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const rupiah = abs / MINOR_UNITS
  return (negative ? '-' : '') + 'Rp ' +
    rupiah.toLocaleString('id-ID')
}

/** Perkalian dengan rasio, pembulatan half-up. Untuk bunga, persentase, alokasi. */
export function multiplyRatio(amount: Money, numerator: bigint, denominator: bigint): Money {
  const product = amount * numerator
  const half = denominator / 2n
  return product >= 0n
    ? (product + half) / denominator
    : (product - half) / denominator
}
```

**Larangan mutlak:**
- `number` untuk nominal uang di mana pun — termasuk props komponen, respons API, dan hasil query.
- `parseFloat` / `Number()` pada nilai uang.
- `.toFixed()` untuk memformat uang.
- Pembagian uang tanpa keputusan pembulatan yang eksplisit.

Batas serialisasi: `bigint` tidak dapat di-JSON. Semua boundary Server Action / route handler mengonversi ke `string`, dan komponen klien memparsinya kembali dengan `BigInt()`. Sebuah helper `serializeMoney` / `deserializeMoney` yang dibungkus tipe menjaga ini konsisten.

## 3. Aturan Emas: Semua Perubahan Saldo Lewat Ledger

```
┌──────────────────────────────────────────────────────────┐
│  wallets.balance TIDAK PERNAH di-UPDATE tanpa penulisan  │
│  ledger_entries di dalam DB transaction yang SAMA.        │
└──────────────────────────────────────────────────────────┘
```

Satu-satunya fungsi yang boleh menyentuh `wallets.balance`:

```ts
// src/lib/finance/ledger.ts

interface PostEntryInput {
  userId: string
  walletId: string
  amount: Money           // bertanda: negatif = keluar
  source: EntrySource
  entryDate: Date
  transactionId?: string
  sourceId?: string
}

/**
 * Menulis satu atau lebih ledger entry dan menyesuaikan saldo dompet
 * secara atomik. HARUS dipanggil di dalam tx aktif.
 */
export async function postEntries(
  tx: TransactionClient,
  entries: PostEntryInput[],
): Promise<LedgerEntry[]> {
  const inserted = await tx.insert(ledgerEntries).values(...).returning()

  // Agregasi per dompet supaya satu dompet cukup satu UPDATE
  const deltaByWallet = new Map<string, Money>()
  const ownerByWallet = new Map<string, string>()
  for (const e of entries) {
    deltaByWallet.set(e.walletId, (deltaByWallet.get(e.walletId) ?? 0n) + e.amount)
    ownerByWallet.set(e.walletId, e.userId)
  }

  for (const [walletId, delta] of deltaByWallet) {
    // Penyaring userId memakai pemilik entry ITU, bukan pemilik entry pertama.
    // Transfer ke anggota household menulis dua entry milik dua orang berbeda
    // dalam satu panggilan — memakai entries[0] akan membuat UPDATE kedua
    // tidak cocok baris mana pun, dan saldonya diam-diam tidak berubah.
    await tx.update(dompet)
      .set({ balance: sql`${wallets.balance} + ${delta}`, updatedAt: new Date() })
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, ownerByWallet.get(walletId)!)))
  }

  return inserted
}
```

Dua poin penting:

**`UPDATE` memakai `balance = balance + delta` di dalam SQL**, bukan membaca saldo ke aplikasi lalu menulis ulang. Pola baca-modifikasi-tulis akan kehilangan update saat ada dua permintaan bersamaan.

**Penyaring `userId` diambil per entry.** Klausa itu bukan sekadar pengaman kepemilikan — ia juga yang menjaga invarian I11 (`ledger_entries.user_id` = pemilik dompet). Pemanggil wajib mengisi `userId` setiap entry dengan **pemilik wallet-nya**, bukan dengan siapa yang sedang mencatat.

## 4. Batas Transaksi per Operasi

Setiap operasi berikut adalah **satu** DB transaction. Sebagian berhasil sebagian gagal adalah kondisi yang tidak boleh mungkin terjadi.

| Operasi | Tulisan di dalam transaction |
|---------|------------------------------|
| Catat income/expense | `transactions` INSERT · `ledger_entries` INSERT · `wallets.balance` UPDATE |
| Transfer antar dompet sendiri | `transactions` INSERT · **2×** `ledger_entries` INSERT · **2×** `wallets.balance` UPDATE |
| Catat transfer ke anggota | verifikasi keanggotaan **kedua** user + dompet tujuan terlihat · **2×** `transactions` INSERT (satu per orang, `created_by` = pencatat) · **2×** `ledger_entries` INSERT (masing-masing di dompet pemiliknya) · **2×** `wallets.balance` UPDATE · `linked_transaction_id` dua arah |
| Penerima memindahkan ke dompet lain | void entry lama · entry baru di dompet tujuan baru · **2×** saldo UPDATE — semuanya di ledger penerima sendiri |
| Penerima menghapus sisinya | `voided_at` SET · entry pembalik · saldo UPDATE · tautan dilepas dua arah |
| Tandai aktivitas sudah dilihat | `acknowledged_at` SET — tanpa tulisan finansial apa pun |
| Edit transaksi | void entry lama · pembalik INSERT · entry baru INSERT · saldo UPDATE |
| Void transaksi | `transactions.voided_at` SET · entry pembalik INSERT · saldo UPDATE |
| Kontribusi savings | `ledger_entries` INSERT · `wallets.balance` UPDATE · `savings_contributions` INSERT · `savings_goals.current_amount` UPDATE |
| Tarik dana savings | verifikasi kontribusi milik penarik · `savings_contributions` INSERT (negatif) · `ledger_entries` INSERT · saldo UPDATE · cache goal UPDATE |
| Beli emas | `gold_lots` INSERT · `ledger_entries` INSERT · `wallets.balance` UPDATE · `assets.cached_value` UPDATE |
| Jual emas | `gold_lots.remaining_grams` UPDATE (n baris) · `gold_sales` INSERT · `ledger_entries` INSERT · saldo UPDATE · `assets.cached_value` UPDATE |
| Bayar hutang | `debt_payments` INSERT · `ledger_entries` INSERT · `wallets.balance` UPDATE · `debts.remaining_amount` UPDATE · `debts.status` UPDATE |
| Cairkan deposito | `deposits.status` UPDATE · `ledger_entries` INSERT (pokok + bunga bersih) · saldo UPDATE · `assets.status` UPDATE |
| Terima undangan household | `household_invitations.status` → `accepted` (dijaga `WHERE status='pending'`) · `household_members` UPSERT (`active`) |
| Keluarkan anggota | `household_members.status` → `removed` · `share_wealth` → false · tag transaksi diproses sesuai pilihan |

**Baris "Catat transfer ke anggota" adalah satu-satunya operasi yang menyentuh dua ledger milik dua orang.** Ia dibatasi tiga hal: hanya bentuk transfer, hanya ke dompet yang terlihat milik anggota aktif, dan selalu teratribusi lewat `created_by`. Tiga baris berikutnya menunjukkan bahwa penerima tetap berdaulat atas sisinya — ia dapat memindahkan atau menghapusnya tanpa persetujuan siapa pun.

## 5. Invarian

Diuji lewat property-based test (fast-check) dan diverifikasi job rekonsiliasi di produksi.

| # | Invarian | Cara verifikasi |
|---|----------|-----------------|
| I1 | `wallet.balance = SUM(ledger_entries.amount WHERE wallet_id = w AND voided_at IS NULL)` | Job rekonsiliasi harian |
| I2 | Untuk transaksi `type='transfer'` dengan `counterparty_user_id IS NULL`: `SUM(entry.amount) = 0` | Query invarian |
| I3 | `savings_goal.current_amount = SUM(savings_contributions.amount WHERE voided_at IS NULL)` | Job rekonsiliasi |
| I4 | `debt.remaining_amount = initial_amount − SUM(debt_payments.amount WHERE voided_at IS NULL)` | Job rekonsiliasi |
| I5 | Setiap kontribusi savings punya `ledger_entry_id` non-null yang nominalnya berlawanan tanda dan sama besar | `NOT NULL` + test |
| I6 | Setiap transaksi non-void punya minimal satu ledger entry non-void | Query invarian |
| I7 | `gold_lots.remaining_grams` ≤ `weight_grams` dan ≥ 0 | `CHECK` constraint |
| I8 | Net worth berubah 0 pada: transfer antar dompet sendiri, kontribusi savings, pembayaran hutang | Property test |
| I9 | Dompet `credit_card` tidak pernah bersaldo positif | `CHECK` constraint |
| I10 | Bunga deposito belum diterima tidak muncul di total aset | Unit test kalkulasi net worth |
| **I11** | **`ledger_entries.user_id` selalu sama dengan `wallets.user_id` untuk `wallet_id`-nya** | Job rekonsiliasi |
| **I12** | Setiap transaksi transfer ber-`counterparty_user_id` punya pasangan tertaut, dan `SUM(amount)` kedua entry-nya = 0 | Query invarian |
| **I13** | Transfer ke anggota membuat net worth household tidak berubah — selalu, tanpa keadaan antara | Property test |
| **I14** | Satu transaksi terhitung paling banyak sekali dalam satu agregasi household | Query invarian + test |
| **I15** | Setiap transaksi ber-`household_id` dibuat oleh anggota yang aktif pada saat penandaan | Verifikasi di service + test |
| **I16** | Setiap household aktif punya tepat satu `owner` aktif | Unique index parsial |
| **I17** | Satu transaksi hanya dapat ditautkan sekali (`linked_transaction_id` unik) | Unique index parsial |
| **I18** | Tautan bersifat dua arah: bila A→B maka B→A | Query invarian |
| **I19** | `created_by <> user_id` hanya pada sisi penerima transfer antar anggota | `CHECK tx_created_by_rule` + query invarian |

**I11 adalah invarian struktural yang menegakkan aturan 1.3.** Bila ada satu baris saja di mana pemilik ledger entry berbeda dari pemilik wallet-nya, berarti ada kode yang menulis ke buku besar orang lain. Ia diperiksa setiap hari, dan temuannya adalah insiden — bukan sekadar selisih angka.

### Job rekonsiliasi

Vercel Cron harian (03:00 WIB) menjalankan query berikut per user dan melaporkan selisih apa pun:

```sql
SELECT w.id, w.name, w.balance AS cached,
       COALESCE(SUM(l.amount), 0) AS actual,
       w.balance - COALESCE(SUM(l.amount), 0) AS drift
FROM dompet w
LEFT JOIN ledger_entries l
       ON l.wallet_id = w.id AND l.voided_at IS NULL
GROUP BY w.id, w.name, w.balance
HAVING w.balance <> COALESCE(SUM(l.amount), 0);
```

Query invarian tambahan yang dijalankan job yang sama:

```sql
-- I11: pemilik ledger entry harus sama dengan pemilik wallet-nya.
-- Temuan di sini berarti ada kode yang menulis ke buku besar orang lain.
SELECT le.id, le.user_id AS entry_owner, w.user_id AS wallet_owner
FROM ledger_entries le
JOIN dompet w ON w.id = le.wallet_id
WHERE le.user_id <> w.user_id;

-- I12: transfer antar anggota harus berpasangan dan saling meniadakan
SELECT a.id, COALESCE(SUM(le.amount), 0) AS total
FROM transactions a
JOIN transactions b ON b.id = a.linked_transaction_id
LEFT JOIN ledger_entries le
       ON le.transaction_id IN (a.id, b.id) AND le.voided_at IS NULL
WHERE a.type = 'transfer' AND a.counterparty_user_id IS NOT NULL
  AND a.voided_at IS NULL
GROUP BY a.id
HAVING COALESCE(SUM(le.amount), 0) <> 0;

-- I19: hanya sisi penerima transfer yang boleh ditulis orang lain
SELECT id FROM transactions
WHERE created_by <> user_id
  AND NOT (type = 'transfer' AND counterparty_user_id = created_by);

-- I18: tautan transfer harus dua arah
SELECT a.id FROM transactions a
JOIN transactions b ON b.id = a.linked_transaction_id
WHERE b.linked_transaction_id IS DISTINCT FROM a.id;
```

**Perilaku saat menemukan selisih:** rekonsiliasi **melaporkan**, tidak memperbaiki otomatis. Perbaikan senyap akan menyembunyikan bug yang menyebabkannya. Selisih memicu alert dan ditangani manual dengan `adjustment` entry yang terdokumentasi.

**Temuan I11 diperlakukan sebagai insiden keamanan, bukan selisih angka.** Ia berarti ada jalur kode yang melanggar aturan paling dasar sistem ini, dan penanganannya dimulai dari menemukan jalur itu — bukan dari memperbaiki barisnya.

## 6. Idempotensi

Jaringan mobile tidak dapat diandalkan. Tanpa perlindungan, satu tap "Simpan" pada koneksi lambat dapat menghasilkan dua transaksi identik — kelas bug yang paling merusak kepercayaan pada aplikasi finansial.

**Mekanisme:** klien membuat UUID saat form dibuka dan mengirimkannya sebagai `idempotencyKey`. Unique index parsial di `transactions (user_id, idempotency_key)` menjadi penegaknya.

```ts
try {
  return await createTransaction({ ...input, idempotencyKey })
} catch (e) {
  if (isUniqueViolation(e, 'tx_idempotency_uniq')) {
    // Sudah pernah diproses — kembalikan hasil yang ada, bukan error
    return await findByIdempotencyKey(userId, idempotencyKey)
  }
  throw e
}
```

Kunci dibuat ulang setiap kali form dibuka, sehingga user yang memang berniat mencatat dua transaksi identik tetap bisa melakukannya.

Berlaku untuk: transaksi, transfer, kontribusi savings, pembayaran hutang/piutang, beli/jual emas.

## 7. Konkurensi

Neon berjalan pada `READ COMMITTED` secara default. Untuk operasi kami itu memadai, dengan syarat:

1. Update saldo memakai bentuk relatif (`balance + delta`), bukan absolut.
2. Operasi yang **membaca lalu memutuskan berdasarkan bacaan itu** memakai row lock:

```ts
// Pembayaran hutang harus memvalidasi nominal ≤ sisa. Baca-lalu-tulis
// tanpa lock bisa membuat total pembayaran melebihi hutangnya.
const [debt] = await tx.select().from(debts)
  .where(and(eq(debts.id, debtId), eq(debts.userId, userId)))
  .for('update')                                  // ← SELECT … FOR UPDATE

if (amount > debt.remainingAmount) throw new OverpaymentError()
```

Operasi yang butuh lock: pembayaran hutang/piutang, penarikan savings, penjualan emas (mengurangi `remaining_grams` beberapa lot), pencairan deposito.

Operasi yang **tidak** butuh lock: catat income/expense/transfer — tidak ada validasi yang bergantung pada saldo sekarang, karena cerukan diizinkan.

## 8. Kebijakan Void vs Delete

| Entitas | Bisa dihapus keras? | Mekanisme |
|---------|---------------------|-----------|
| Transaksi | Tidak | `voided_at` + entry pembalik |
| Ledger entry | Tidak | `voided_at`, tidak pernah `DELETE` |
| Tautan transfer | Ya (set `NULL` dua arah) | Bukan catatan finansial; kedua transaksi tetap utuh |
| Dompet | Hanya jika tanpa entry | Selain itu: arsip |
| Kategori bawaan | Tidak | Arsip; `system_key` dipertahankan |
| Kategori kustom | Hanya jika tanpa transaksi | Selain itu: arsip |
| Savings goal | Hanya jika `current_amount = 0` dan tanpa kontribusi | Selain itu: arsip |
| Kontribusi savings | Tidak | `voided_at` + entry pembalik |
| Budget | Ya | Bukan catatan finansial, hanya niat |
| Hutang/piutang | Hanya jika tanpa pembayaran | Selain itu: `written_off` |
| Lot emas | Tidak | Void beserta ledger entry-nya |
| **Keanggotaan household** | Tidak | `status` → `removed`, riwayat dipertahankan |
| **Undangan household** | Ya, setelah 90 hari sejak final | Sebelum itu: `revoked`/`expired` |
| **Household** | Tidak | `is_archived` — menghapusnya akan memutus tag transaksi milik banyak orang |
| **Tag household pada transaksi** | Ya (set `NULL`) | Bukan catatan finansial; nominal dan dompet tidak tersentuh |
| Akun user | Ya, cascade penuh | Butuh konfirmasi ketik-untuk-konfirmasi; owner harus mengalihkan household lebih dulu |

Di UI kata **"Hapus"** tetap dipakai — "void" adalah jargon akuntansi. Yang penting perilakunya benar, bukan istilahnya.

## 9. Menampilkan Nilai Turunan dengan Jujur

Angka hasil estimasi tidak boleh terlihat sama dengan angka pasti.

| Nilai | Sifat | Penyajian |
|-------|-------|-----------|
| Saldo dompet | Pasti | Angka biasa |
| Tabungan | Pasti — dana sudah disisihkan | Angka biasa |
| Nilai emas | Estimasi | Angka + "per {tanggal harga}" |
| Bunga deposito berjalan | Estimasi | Angka + label "estimasi", warna sekunder |
| Nilai jatuh tempo deposito | Estimasi | Angka + "estimasi, setelah pajak" |
| Net worth pribadi | Campuran | Angka + tautan "Lihat rincian" |
| Kekayaan keluarga | **Tidak lengkap menurut konstruksi** | **Per anggota dulu**, total sebagai baris sekunder + cakupan |
| Transaksi yang ditulis anggota lain | Pasti, tetapi belum ditinjau pemiliknya | Lencana di Aktivitas sampai `acknowledged_at` terisi |
| Piutang | Tidak pasti tertagih | Terpisah dari aset, kecuali user memilih sebaliknya |

Harga emas yang lebih tua dari 30 hari mendapat badge peringatan dan CTA untuk memperbarui.

**Kekayaan keluarga ditampilkan per anggota lebih dulu, bukan sebagai satu total.** Angka gabungan dari berbagi sebagian — "Rp245 juta dari 2 dari 3 anggota" — sulit dipakai untuk keputusan apa pun. Rincian per anggota tidak ambigu; totalnya tetap ada sebagai baris sekunder yang selalu menyebut cakupannya.

## 10. Checklist Sebelum Merge Kode Finansial

Setiap PR yang menyentuh `src/lib/finance/**` atau operasi tulis DB:

- [ ] Semua penulisan multi-tabel berada di dalam satu `dbWrite.transaction()`.
- [ ] Tidak ada `number` untuk nominal uang; `bigint` di mana pun.
- [ ] Update saldo memakai bentuk relatif SQL, bukan baca-modifikasi-tulis.
- [ ] Operasi yang memvalidasi terhadap state tersimpan memakai `FOR UPDATE`.
- [ ] Mutasi yang dipicu user menerima dan menghormati `idempotencyKey`.
- [ ] Setiap query di-scope `user_id` (lihat [12-security-and-auth.md](12-security-and-auth.md)).
- [ ] Invarian yang terdampak punya test yang gagal sebelum perbaikan dibuat.
- [ ] Efek pada net worth **pribadi dan household** sudah dipikirkan dan didokumentasikan di PR.
- [ ] Kalau menyentuh `household_id`: keanggotaan diverifikasi **di dalam** transaction.
- [ ] **Setiap `postEntries` baru menargetkan dompet milik pemanggil.** Tidak ada pengecualian.
- [ ] Tidak ada agregasi household yang bisa menghitung satu transaksi dua kali.
- [ ] Kalau menambah sumber aset baru: sudah masuk perhitungan net worth pribadi **dan** household.
