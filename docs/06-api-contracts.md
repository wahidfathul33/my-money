# 06 — API Contracts

Kontrak antara UI dan lapisan data. Next.js App Router, Server Actions sebagai mekanisme utama.

## 1. Pilihan Mekanisme

| Kebutuhan | Mekanisme | Alasan |
|-----------|-----------|--------|
| Mutasi dari form | **Server Action** | Type-safe end-to-end, progressive enhancement, tanpa boilerplate route |
| Baca data awal halaman | **Server Component** (query langsung) | Nol JS terkirim, tanpa waterfall |
| Baca inkremental (infinite scroll, filter) | **Route Handler** `GET /api/…` | Bisa di-cache, bisa dibatalkan, bekerja dengan SWR/React Query |
| Cron (snapshot, jatuh tempo, harga) | **Route Handler** `GET /api/cron/…` | Dipanggil Vercel Cron |
| Webhook auth | **Route Handler** | Auth.js |

**Server Action bukan API publik.** Kalau nanti dibutuhkan klien mobile, tambahkan lapisan REST di atas fungsi service yang sama. Fungsi service (`src/lib/services/**`) adalah kontrak sesungguhnya; Server Action hanyalah adaptor tipis.

## 2. Bentuk Standar

Semua Server Action mengembalikan bentuk yang seragam. Tidak pernah melempar exception ke klien.

```ts
// src/lib/api/result.ts
export type ActionResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: ActionError }

export interface ActionError {
  code: ErrorCode
  message: string                          // aman ditampilkan ke user, bahasa Indonesia
  fieldErrors?: Record<string, string[]>   // untuk error validasi per field
}

export type ErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'VALIDATION' | 'CONFLICT' | 'INSUFFICIENT_FUNDS'
  | 'OVERPAYMENT' | 'RATE_LIMITED' | 'INTERNAL'
  // Household
  | 'NOT_A_MEMBER' | 'OWNER_ONLY' | 'INVITATION_INVALID'
  | 'ALREADY_MEMBER' | 'LAST_OWNER' | 'WALLET_NOT_ELIGIBLE'
```

**Kenapa result object dan bukan throw?** Error yang dilempar dari Server Action di produksi tersamarkan menjadi "An error occurred in the Server Components render" — pesan yang tidak berguna bagi user maupun bagi kita. Result eksplisit membuat penanganan error menjadi bagian dari tipe, bukan sesuatu yang mudah dilupakan.

## 3. Anatomi Server Action

Setiap action mengikuti struktur yang sama persis:

```ts
'use server'

import { z } from 'zod'
import { requireUser } from '@/lib/auth/require-user'
import { action } from '@/lib/api/action'
import { createTransaction } from '@/lib/services/transactions'

const CreateTransactionInput = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.string().regex(/^\d+$/),        // bigint sebagai string
  walletId: z.string().uuid(),
  categoryId: z.string().uuid(),
  transactionDate: z.coerce.date(),
  note: z.string().max(280).optional(),
  idempotencyKey: z.string().uuid(),
})

export const createTransactionAction = action
  .input(CreateTransactionInput)
  .handler(async (input, { user }) => {
    const tx = await createTransaction({
      userId: user.id,
      ...input,
      amount: BigInt(input.amount),
    })
    revalidatePath('/')
    revalidatePath('/transactions')
    return serializeTransaction(tx)
  })
```

Wrapper `action` menangani, dalam urutan ini:
1. Autentikasi (`requireUser`) — 401 kalau tidak ada sesi.
2. Parsing input Zod — mengubah `ZodError` menjadi `fieldErrors`.
3. Rate limiting per user.
4. Memanggil handler.
5. Memetakan error yang dikenal ke `ErrorCode`; error tak dikenal menjadi `INTERNAL` dan dicatat lengkap di log server, tetapi hanya pesan generik ke klien.

## 4. Serialisasi

`bigint` tidak dapat melewati batas serialisasi React. Aturannya:

- **Ke klien:** semua nominal `bigint` → `string` desimal satuan minor. `Date` → ISO string.
- **Dari klien:** kebalikannya, divalidasi Zod.
- Tipe DTO diberi nama `…Dto` dan hidup di `src/lib/dto/`, terpisah dari tipe domain.

```ts
export interface TransactionDto {
  id: string
  type: 'income' | 'expense' | 'transfer'
  amount: string            // ← satuan minor, contoh "150000000" = Rp1.500.000
  walletId: string
  walletName: string
  categoryId: string | null
  categoryName: string | null
  categoryIcon: string | null
  transactionDate: string   // ISO 8601
  note: string | null
  counterpartyUserId: string | null    // transfer ke anggota household
  counterpartyName: string | null
  linkedTransactionId: string | null
  counterWalletName: string | null     // transfer antar dompet sendiri
}
```

Konvensi penamaan `amount: string` disertai komentar satuan di setiap DTO. Ambiguitas satuan uang adalah sumber bug yang mahal.

## 5. Katalog Server Action

Dikelompokkan per modul. Semua menerima `idempotencyKey` untuk mutasi finansial.

### Transaksi
| Action | Input | Mengembalikan |
|--------|-------|---------------|
| `createTransactionAction` | type, amount, walletId, categoryId, date, note, **householdId?** | `TransactionDto` |
| `updateTransactionAction` | id + field yang diubah (termasuk `householdId`) | `TransactionDto` |
| `voidTransactionAction` | id | `{ id }` |
| `setTransactionHouseholdAction` | id, householdId \| null | `TransactionDto` |

`householdId` bersifat opsional. Bila diisi, service memverifikasi bahwa pemanggil adalah anggota aktif dengan peran minimal `member` — di dalam transaction yang sama dengan penulisannya.

### Transfer
| Action | Input | Menulis ledger ke |
|--------|-------|-------------------|
| `createSelfTransferAction` | amount, fromWalletId, toWalletId, date, note | **2 dompet milik sendiri** |
| `createMemberTransferAction` | amount, fromWalletId, counterpartyUserId, **toWalletId**, householdId, date, note | **2 dompet: milik sendiri + milik penerima** |
| `acknowledgeTransactionAction` | id | — (tanpa tulisan finansial) |

`createMemberTransferAction` adalah **satu-satunya** action yang menulis ke dompet milik user lain. `toWalletId` wajib milik `counterpartyUserId`, aktif, dan tidak ber-`exclude_from_household` — diverifikasi di dalam transaction.

Penerima tidak butuh action khusus untuk mengoreksi: memindahkan ke dompet lain adalah `updateTransactionAction` biasa, menghapus adalah `voidTransactionAction` biasa. Keduanya atas transaksi miliknya sendiri.

### Household
| Action | Peran | Input |
|--------|:-----:|-------|
| `createHouseholdAction` | — | name, timezone |
| `updateHouseholdAction` | owner | id, name, timezone |
| `archiveHouseholdAction` | owner | id |
| `inviteMemberAction` | owner | householdId, email |
| `revokeInvitationAction` | owner | invitationId |
| `acceptInvitationAction` | — | token |
| `removeMemberAction` | owner | householdId, userId |
| `leaveHouseholdAction` | — | householdId, keepTransactionTags: boolean |
| `transferOwnershipAction` | owner | householdId, newOwnerUserId |

`inviteMemberAction` tidak menerima `role` — anggota baru selalu `member`. Peran `owner` hanya berpindah lewat `transferOwnershipAction`.

`leaveHouseholdAction` menerima `keepTransactionTags` karena keduanya pilihan yang sah dan hanya penggunanya yang tahu mana yang lebih penting baginya.

### Berbagi
| Action | Input |
|--------|-------|
| `setShareWealthAction` | householdId, share: boolean |
| `setExcludeFromHouseholdAction` | entityType, entityId, exclude: boolean |
| `getSharingSummaryAction` | — → status berbagi + daftar item yang dikecualikan |

Hanya tiga action, dan tidak ada satu pun yang memberi akses kepada orang tertentu. Berbagi selalu ke household sebagai lapisan, tidak pernah ke individu — itu yang menjaga pertanyaan "siapa dapat melihat apa" tetap dapat dijawab tanpa menelusuri graf izin.

### Dompet
`createWalletAction` · `updateWalletAction` · `archiveWalletAction` · `reorderWalletsAction` · `adjustWalletBalanceAction` (rekonsiliasi manual → `adjustment` entry)

### Kategori
`createCategoryAction` · `updateCategoryAction` · `archiveCategoryAction` · `reorderCategoriesAction`

### Budget
`upsertBudgetAction` · `deleteBudgetAction`

### Savings
`createGoalAction` (dengan `householdId?`) · `updateGoalAction` · `archiveGoalAction` · `contributeAction` · `withdrawAction`

`contributeAction` selalu memindahkan uang: saldo dompet berkurang, pos tabungan bertambah, satu transaction. Tidak ada mode "komitmen" — alasannya di [16-decision-log](16-decision-log.md#adr-026--savings-hanya-kontribusi-yang-memindahkan-uang).

`withdrawAction` hanya dapat menarik kontribusi milik pemanggil sendiri, ke dompet miliknya sendiri.

### Aset — Emas
`buyGoldAction` · `sellGoldAction` · `recordGoldPriceAction`

### Aset — Deposito
`createDepositAction` · `updateDepositAction` · `withdrawDepositAction`

### Hutang & Piutang
`createDebtAction` · `recordDebtPaymentAction` · `writeOffDebtAction` · dan tiga padanannya untuk piutang

### Settings
`updateProfileAction` · `updatePreferencesAction` · `exportDataAction` · `deleteAccountAction`

## 6. Route Handler untuk Pembacaan

Hanya dipakai untuk data yang dimuat inkremental setelah render awal.

### `GET /api/transactions`

```
Query params:
  cursor?     string   opaque, base64 dari "{iso_date}|{id}"
  limit?      number   default 30, maks 100
  walletId?   uuid
  categoryId? uuid
  type?       income | expense | transfer
  from?, to?  date (YYYY-MM-DD, dalam zona waktu user)
  q?          string   pencarian pada catatan, min 2 karakter

Response 200:
{
  "items": TransactionDto[],
  "nextCursor": string | null,
  "dayTotals": { "2026-09-02": { "income": "…", "expense": "…" } }
}
```

**Pagination memakai cursor, bukan offset.** Dengan offset, transaksi baru yang masuk saat user sedang scroll akan menggeser halaman dan menyebabkan item terlewat atau terduplikasi. Cursor keyset `(transaction_date DESC, id DESC)` stabil dan langsung cocok dengan `tx_user_date_idx`.

`dayTotals` dihitung server-side untuk rentang yang dikembalikan, supaya klien tidak perlu menjumlah dan tidak bisa salah menjumlah.

### `GET /api/reports/summary`
```
period=YYYY-MM  atau  from=&to=
→ { income, expense, net, byCategory[], dailySeries[] }
```

### `GET /api/net-worth/history`
```
range=3m|6m|1y|all
→ { snapshots: [{ date, netWorth, totalAssets, totalLiabilities, breakdown }] }
```

### `GET /api/households/[id]/transactions`
```
Sama seperti /api/transactions, tetapi disaring household_id dan mencakup
seluruh anggota. Menambahkan:
  memberId?  uuid   filter per anggota

Response item menyertakan payerName. Nominal, kategori, tanggal, dan catatan
ikut serta; saldo dompet TIDAK PERNAH ikut.
```

### `GET /api/households/[id]/summary`
```
period=YYYY-MM
→ {
    income, expense, net,
    byCategory: [
      { kind: 'system', systemKey, label, amount, share },
      { kind: 'custom', categoryId, label, ownerName, amount, share }
    ],
    byMember: [{ userId, name, expensePaid, incomeContributed, savingsContributed }],
    budgets:  [{ categoryKey, label, amount, spent, status, byMember[] }]
  }
```

`byCategory` memuat **dua bentuk baris**. Kategori bawaan dikelompokkan lewat `systemKey` — eksak, lintas anggota. Kategori kustom tampil sebagai barisnya sendiri disertai `ownerName`, karena ia tidak dapat dicocokkan antar anggota.

Semua kategori ditampilkan; tidak ada yang dilebur menjadi "Lainnya" dan tidak ada pencocokan teks.

Agregasi memakai `households.timezone` untuk batas periode, bukan zona waktu masing-masing anggota.

### `GET /api/households/[id]/net-worth`
```
→ {
    byMember: [{ userId, name, sharing: bool, assets, liabilities, netWorth }],
    totals:   { totalAssets, totalLiabilities, netWorth },
    coverage: { memberCount, contributingCount }
  }
```

`byMember` sengaja diletakkan lebih dulu — itulah tampilan utamanya. Anggota yang tidak berbagi tetap muncul dengan `sharing: false` dan nilai nol; menghilangkannya akan membuat totalnya tampak lebih lengkap daripada sebenarnya.

`coverage` bersifat wajib pada respons ini.

Semua endpoint `/api/households/[id]/*` memanggil `requireHouseholdMember` dan mengembalikan `404` (bukan `403`) bila pemanggil bukan anggota — membedakan keduanya membocorkan keberadaan household orang lain.

## 7. Endpoint Cron

Semua berada di `/api/cron/*`, dilindungi header `Authorization: Bearer ${CRON_SECRET}`.

| Endpoint | Jadwal (WIB) | Fungsi |
|----------|--------------|--------|
| `/api/cron/net-worth-snapshot` | 23:55 harian | Snapshot per user aktif **dan** per household aktif |
| `/api/cron/deposit-maturity` | 01:00 harian | `active` → `matured`; proses ARO; bunga bulanan |
| `/api/cron/gold-price` | 02:00 harian | Ambil dari provider eksternal jika diaktifkan |
| `/api/cron/reconcile` | 03:00 harian | Cek invarian I1–I19, laporkan selisih (read-only — tidak pernah memperbaiki data, lihat [05 §5](05-financial-integrity.md#5-invarian)) |
| `/api/cron/budget-rollover` | 00:05 tanggal 1 | Materialisasi budget berulang (pribadi + household) |
| `/api/cron/expire-invitations` | setiap jam | Kedaluwarsakan undangan household > 7 hari |

`expire-invitations` **tidak menulis apa pun yang bersifat finansial** — ia hanya mengubah status undangan. Dengan model transfer di [03 §9.3](03-domain-model.md#93-transfer-ke-anggota-household), tidak ada transfer menggantung yang perlu dibalikkan, sehingga cron ini tidak dapat merusak saldo siapa pun meskipun dijalankan berulang.

**Cron harus idempoten.** Vercel dapat memanggil ulang saat gagal. Snapshot memakai `ON CONFLICT (user_id, snapshot_date) DO UPDATE`; perubahan status (undangan, deposito) dijaga klausa `WHERE` atas status sekarang, sehingga panggilan kedua tidak menemukan baris untuk diubah.

**Batas waktu eksekusi.** Route handler Vercel punya batas durasi. Cron memproses user secara batch dengan cursor tersimpan, bukan sekali jalan untuk semua user. Untuk skala MVP ini berlebihan, tetapi biaya menuliskannya sekarang mendekati nol dibanding menulis ulang nanti.

## 8. Validasi

Zod di batas, aturan bisnis di service.

**Validasi batas (Zod)** — bentuk, tipe, rentang, format.
**Aturan bisnis (service)** — "kategori harus milik user ini", "nominal tidak melebihi sisa hutang", "dompet asal ≠ tujuan".

Alasan pemisahan: aturan bisnis butuh akses database dan harus berjalan di dalam transaction yang sama dengan penulisannya. Menaruhnya di Zod berarti memeriksa sesuatu yang bisa berubah antara pemeriksaan dan penulisan.

```ts
// Aturan bisnis di dalam transaction — pemeriksaan dan penulisan tidak terpisah
await dbWrite.transaction(async (tx) => {
  const [debt] = await tx.select().from(debts)
    .where(and(eq(debts.id, debtId), eq(debts.userId, userId)))
    .for('update')

  if (!debt) throw new NotFoundError('Hutang tidak ditemukan')
  if (amount > debt.remainingAmount) throw new OverpaymentError(debt.remainingAmount)
  // … tulis
})
```

## 9. Pesan Error

Pesan error tampil ke pengguna dan ditulis dalam bahasa Indonesia. Aturannya: sebutkan apa yang salah dan apa yang harus dilakukan.

| Kode | Pesan |
|------|-------|
| `VALIDATION` | Spesifik per field: "Nominal harus lebih dari 0" |
| `INSUFFICIENT_FUNDS` | "Saldo {dompet} tidak cukup. Tersedia {saldo}." |
| `OVERPAYMENT` | "Pembayaran melebihi sisa hutang. Sisa: {sisa}." |
| `NOT_FOUND` | "Data tidak ditemukan. Mungkin sudah dihapus." |
| `CONFLICT` | "Data sudah berubah. Muat ulang lalu coba lagi." |
| `RATE_LIMITED` | "Terlalu banyak permintaan. Tunggu sebentar." |
| `INTERNAL` | "Terjadi kesalahan. Data Anda aman — coba lagi." |
| `NOT_A_MEMBER` | "Data tidak ditemukan." — sengaja sama dengan `NOT_FOUND` |
| `OWNER_ONLY` | "Hanya pemilik keluarga yang dapat melakukan ini." |
| `INVITATION_INVALID` | "Undangan tidak berlaku, sudah dipakai, atau kedaluwarsa." |
| `ALREADY_MEMBER` | "Orang ini sudah menjadi anggota." |
| `LAST_OWNER` | "Alihkan kepemilikan dulu sebelum keluar." |
| `WALLET_NOT_ELIGIBLE` | "Rekening tujuan tidak tersedia. Minta {nama} memeriksa daftar rekeningnya." |

`NOT_A_MEMBER` sengaja memakai pesan yang identik dengan `NOT_FOUND`. Kodenya berbeda untuk keperluan log internal, tetapi pesannya tidak boleh membedakan "household ini tidak ada" dari "household ini ada tapi Anda bukan anggota" — perbedaan itu membocorkan keberadaan household orang lain.

`INVITATION_INVALID` juga sengaja digabungkan: menyebutkan secara spesifik bahwa sebuah token "sudah dipakai" mengonfirmasi bahwa token itu pernah sah.

Pesan `INTERNAL` sengaja menyebut "data Anda aman". Di aplikasi keuangan, kekhawatiran pertama saat melihat error adalah apakah uangnya hilang. Menjawabnya di depan lebih murah daripada tiket support.

## 10. Revalidasi Cache

Setiap mutasi menyatakan secara eksplisit apa yang jadi basi:

| Mutasi | `revalidatePath` |
|--------|------------------|
| Transaksi (tanpa tag household) | `/`, `/transactions`, `/reports`, `/wallets` |
| Transaksi (dengan tag household) | ditambah `/household/[id]` dan sub-rutenya |
| Transfer antar dompet sendiri | `/`, `/transactions`, `/wallets` |
| Transfer ke anggota | `/`, `/transactions`, `/wallets`, `/household/[id]` — untuk pencatat; penerima melihatnya saat memuat ulang |
| Savings pribadi | `/`, `/wealth`, `/wealth/savings` |
| Savings bersama | ditambah `/household/[id]/savings` |
| Emas / Deposito | `/`, `/wealth`, `/wealth/assets`, `/wealth/net-worth` |
| Hutang / Piutang | `/`, `/wealth`, `/wealth/debts`, `/wealth/net-worth` |
| Budget pribadi | `/`, `/budgets` |
| Budget household | `/household/[id]`, `/household/[id]/budgets` |
| Dompet | `/`, `/wallets`, `/transactions` |
| Keanggotaan / undangan | `/household/[id]`, `/household/[id]/members` |
| Perubahan berbagi | `/household/*` seluruhnya, `/settings/sharing` |

Mutasi yang mengubah net worth **selalu** merevalidasi `/` dan `/wealth/net-worth`. Melihat net worth basi setelah mencatat sesuatu langsung terasa seperti bug.

**Batasan yang perlu diketahui:** `revalidatePath` hanya memengaruhi cache pemanggil dan tidak dapat menyentuh sesi pengguna lain. Ketika Wahid mencatat transfer ke Istri, layar Istri tidak berubah sampai ia memuat ulang.

Datanya sendiri sudah benar seketika — yang tertunda hanya tampilannya. Lencana Aktivitas memberi tahu Istri saat ia kembali. Pembaruan waktu nyata dijadwalkan v1.x sebagai kenyamanan, bukan perbaikan kebenaran.
