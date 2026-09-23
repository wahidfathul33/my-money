# 10 — Technical Architecture

## 1. Tech Stack

| Lapisan | Pilihan | Catatan |
|---------|---------|---------|
| Framework | **Next.js (App Router)** `16.3.4` | Dipin eksak saat bootstrap (task 00) |
| Bahasa | **TypeScript** `6.0.3`, `strict: true` | `noUncheckedIndexedAccess` juga aktif |
| Styling | **Tailwind CSS v4** `4.1.11` | Token via `@theme`, lihat [07](07-design-system.md) |
| Primitif UI | **Radix UI** | Aksesibel secara bawaan; ditambahkan di task 01 |
| Ikon | **lucide-react** | Ditambahkan di task 01 |
| Database | **Neon PostgreSQL** | Ditambahkan di task 03 |
| ORM | **Drizzle ORM** + `drizzle-kit` | Ditambahkan di task 03; dipin eksak saat itu |
| Auth | **Auth.js v5** + Drizzle adapter | Ditambahkan di task 04 |
| Validasi | **Zod** | Batas Server Action + parsing env; ditambahkan saat modul pertama membutuhkannya |
| Chart | **Recharts** | Cukup ringan; hanya dimuat di rute laporan; ditambahkan di task laporan |
| Form | Native (`useState`/`useFormStatus`) | Server Action langsung; tidak jadi memakai react-hook-form — lihat catatan di bawah |
| Data klien | Hand-rolled (`fetch` + `useState`) | `IntersectionObserver` untuk infinite scroll; tidak jadi memakai SWR — lihat catatan di bawah |
| Test | **Vitest** `4.1.11` + **Playwright** `1.62.1` + **fast-check** | fast-check ditambahkan saat modul `lib/finance` pertama ditulis |
| Lint/format | **ESLint** `9.39.5` + **Prettier** `3.9.6` | `eslint-config-next` `16.3.4`, `prettier-plugin-tailwindcss` |
| Deploy | **Vercel** | Region `sin1` |

React dipin di `19.2.8` (mengikuti versi yang didukung Next.js 16). Versi persis tercatat di `package.json`; tabel ini hanya ringkasan.

**react-hook-form dan SWR tidak jadi ditambahkan.** Keduanya direncanakan di dokumen ini sejak awal, tetapi tidak satu pun modul yang dibangun sepanjang task 01–22 butuh keduanya secara nyata: form panjang tetap cukup ditangani `useState` + `useFormStatus` di atas Server Action, dan infinite scroll transaksi (`src/features/transactions/components/transaction-list.tsx`) memakai `IntersectionObserver` + `fetch` + `useState` buatan sendiri. Bukan bagian dari `package.json`.

**Bukan bagian dari stack, dan itu disengaja:** state manager global (Redux/Zustand) — Server Component ditambah URL state sudah menutupi kebutuhan; menambah store global akan menciptakan sumber kebenaran kedua yang bisa menyimpang dari database.

## 2. Struktur Folder

```
src/
├── app/
│   ├── (auth)/
│   │   ├── signin/page.tsx
│   │   └── layout.tsx
│   ├── (app)/                        ← rute terautentikasi
│   │   ├── layout.tsx                ← shell: nav, switcher, provider, guard sesi
│   │   ├── page.tsx                  ← dashboard pribadi
│   │   ├── transactions/
│   │   ├── activity/
│   │   ├── wealth/
│   │   │   ├── savings/
│   │   │   ├── assets/{gold,deposits}/
│   │   │   ├── debts/
│   │   │   └── net-worth/
│   │   ├── wallets/
│   │   ├── budgets/
│   │   ├── reports/
│   │   ├── household/                ← konteks household
│   │   │   ├── page.tsx              ← daftar household
│   │   │   ├── new/
│   │   │   └── [householdId]/
│   │   │       ├── layout.tsx        ← guard keanggotaan + nav household
│   │   │       ├── page.tsx          ← ringkasan keluarga
│   │   │       ├── transactions/
│   │   │       ├── budgets/
│   │   │       ├── savings/
│   │   │       ├── members/
│   │   │       ├── net-worth/
│   │   │       └── settings/
│   │   └── settings/
│   │       └── sharing/
│   ├── invite/[token]/               ← dapat diakses tanpa sesi
│   ├── onboarding/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── transactions/route.ts
│   │   ├── households/[id]/{transactions,summary,net-worth}/route.ts
│   │   ├── reports/summary/route.ts
│   │   ├── net-worth/history/route.ts
│   │   └── cron/{net-worth-snapshot,deposit-maturity,gold-price,
│   │             reconcile,budget-rollover,expire-invitations}/route.ts
│   ├── layout.tsx
│   ├── globals.css
│   └── manifest.ts
│
├── components/
│   ├── ui/                           ← primitif tanpa pengetahuan domain
│   ├── finance/                      ← komponen sadar domain
│   ├── charts/
│   └── layout/                       ← BottomNav, Sidebar, PageHeader
│
├── features/                         ← irisan vertikal per modul
│   ├── transactions/
│   │   ├── actions.ts                ← Server Action
│   │   ├── queries.ts                ← baca (dipanggil Server Component)
│   │   ├── schema.ts                 ← skema Zod
│   │   ├── components/
│   │   └── hooks/
│   ├── wallets/  categories/  budgets/  savings/
│   ├── assets/   obligations/ reports/  net-worth/
│   ├── transfers/                    ← transfer sendiri + antar anggota
│   ├── household/                    ← household, keanggotaan, undangan
│   └── sharing/                      ← share_wealth, exclude_from_household
│
├── lib/
│   ├── db/
│   │   ├── schema/                   ← tabel Drizzle, satu file per domain
│   │   ├── read.ts                   ← neon-http  (HANYA SELECT)
│   │   ├── write.ts                  ← neon-serverless (transaksional)
│   │   └── seed.ts                   ← seed per-user saat signup
│   ├── finance/                      ← logika finansial murni, TANPA I/O
│   │   ├── money.ts
│   │   ├── ledger.ts
│   │   ├── net-worth.ts              ← pribadi
│   │   ├── household-net-worth.ts    ← agregasi + cakupan
│   │   ├── gold.ts
│   │   ├── deposit.ts
│   │   ├── budget.ts
│   │   ├── savings.ts
│   │   ├── obligation.ts             ← hutang & piutang
│   │   ├── report-aggregation.ts
│   │   └── transfer.ts               ← bentuk entry & efek ledger
│   ├── services/                     ← orkestrasi: transaksi DB + aturan bisnis
│   ├── auth/
│   │   ├── require-user.ts
│   │   └── require-household.ts      ← keanggotaan aktif + cek owner
│   ├── visibility/                   ← predikat "apa yang boleh dilihat siapa" (target 100% cabang)
│   ├── email/                        ← template undangan
│   ├── api/                          ← wrapper action, tipe result, error
│   ├── dto/                          ← tipe boundary + serializer
│   ├── date/                         ← helper zona waktu (user & household)
│   └── utils.ts
│
├── types/
└── proxy.ts                          ← `middleware.ts` di Next.js ≤15; berganti nama di Next.js 16
```

### Kenapa `features/` dan juga `lib/`

`lib/finance/**` adalah **fungsi murni** — tanpa database, tanpa React, tanpa I/O. Bisa diuji dengan test tabel dan property test tanpa infrastruktur apa pun. Di sinilah kebenaran finansial ditegakkan, dan di sinilah target coverage 95% cabang berlaku — lihat [14-testing §2](14-testing-strategy.md#2-target-coverage).

`lib/services/**` mengorkestrasi: membuka DB transaction, menerapkan aturan bisnis, memanggil `lib/finance` untuk perhitungan, menulis.

`features/**` adalah UI dan adaptor per modul. Server Action di sini tipis — ia memvalidasi, memanggil service, merevalidasi cache.

Pemisahan ini penting karena bug finansial paling mahal terjadi di perhitungan, dan perhitungan yang tercampur dengan pengambilan data jadi sulit diuji secara menyeluruh.

## 3. Aturan Batas

Dipaksakan lewat ESLint `no-restricted-imports` dan review.

| Aturan | Alasan |
|--------|--------|
| `lib/finance/**` tidak boleh mengimpor apa pun dari `lib/db`, `react`, atau `next` | Menjaganya tetap murni dan dapat diuji |
| `components/ui/**` tidak boleh mengimpor dari `features/**` | Primitif tidak boleh tahu domain |
| `features/A/**` tidak boleh mengimpor dari `features/B/**` | Kode bersama naik ke `lib/` atau `components/` |
| Hanya `lib/services/**` yang boleh mengimpor `lib/db/write` | Penulisan terpusat di satu tempat |
| Client Component tidak boleh mengimpor `lib/db/*` | Mencegah kebocoran kredensial DB ke bundle |
| Server Action tidak boleh mengandung logika bisnis | Ia adaptor; logika ada di service |
| **Predikat visibilitas hanya boleh berasal dari `lib/visibility/**`** | Ditulis sekali, diuji sekali; menyalinnya ke query lain adalah cara bug otorisasi lahir |
| **Query lintas-user wajib melewati `lib/visibility/**`** | Tidak ada query ad-hoc yang membaca data orang lain |
| **`lib/finance/household-net-worth.ts` menerima data yang sudah tersaring** | Ia tidak boleh tahu cara menyaring; pemisahan ini membuat aturan visibilitas tidak tersebar |

## 4. Server vs Client Component

**Default: Server Component.** `'use client'` hanya ditambahkan saat komponen benar-benar butuh interaktivitas.

| Butuh | Jenis |
|-------|-------|
| Menampilkan data terambil | Server |
| Tata letak, header, nav statis | Server |
| Form dengan state lokal, keypad | Client |
| Chart (Recharts butuh DOM) | Client |
| Sheet, dialog, tab | Client |
| Infinite scroll | Client |

**Pola:** simpan `'use client'` sedalam mungkin di pohon. Halaman transaksi adalah Server Component yang merender `<TransactionList>` (client) untuk bagian scroll, sementara header, ringkasan periode, dan chip filter tetap di server.

## 5. State Management

Empat jenis state, empat mekanisme berbeda:

| Jenis | Mekanisme | Contoh |
|-------|-----------|--------|
| State server (kebenaran DB) | Server Component + `revalidatePath` | Saldo, transaksi, net worth |
| State URL (bisa dibagikan) | `useSearchParams` + `router.replace` | Filter, periode, tab |
| State UI lokal | `useState` | Sheet terbuka, isi keypad |
| Cache klien (daftar inkremental) | `fetch` + `useState` (hand-rolled) | Halaman berikutnya transaksi — lihat §1 |

**Tidak ada store global.** Kalau muncul kebutuhan berbagi state antar rute yang berjauhan, itu sinyal bahwa datanya seharusnya berasal dari server.

## 6. Contoh Gaya Kode

Potongan ini adalah standar yang dijadikan acuan review.

```ts
// src/lib/services/transactions.ts
import { and, eq } from 'drizzle-orm'
import { dbWrite } from '@/lib/db/write'
import { transactions, categories, wallets } from '@/lib/db/schema'
import { postEntries } from '@/lib/finance/ledger'
import { NotFoundError, ValidationError } from '@/lib/api/errors'
import type { Money } from '@/lib/finance/money'

interface CreateTransactionInput {
  userId: string
  type: 'income' | 'expense'
  amount: Money
  walletId: string
  categoryId: string
  transactionDate: Date
  note?: string
  idempotencyKey: string
}

export async function createTransaction(input: CreateTransactionInput) {
  const { userId, type, amount, walletId, categoryId } = input

  if (amount <= 0n) {
    throw new ValidationError({ amount: ['Nominal harus lebih dari Rp0'] })
  }

  return dbWrite.transaction(async (tx) => {
    // Verifikasi kepemilikan di dalam transaction. Memeriksa di luar
    // membuka celah antara pemeriksaan dan penulisan.
    const [category] = await tx.select().from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .limit(1)
    if (!category) throw new NotFoundError('Kategori tidak ditemukan')
    if (category.type !== type) {
      throw new ValidationError({ categoryId: ['Kategori tidak cocok dengan jenis transaksi'] })
    }

    const [wallet] = await tx.select().from(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
      .limit(1)
    if (!wallet) throw new NotFoundError('Dompet tidak ditemukan')

    const [created] = await tx.insert(transactions).values({
      id: uuidv7(),
      userId,
      type,
      amount,                                   // selalu positif
      categoryId,
      transactionDate: input.transactionDate,
      note: input.note ?? null,
      idempotencyKey: input.idempotencyKey,
    }).returning()

    // Tanda diterapkan di sini, bukan disimpan di transactions.amount
    await postEntries(tx, [{
      userId,
      walletId,
      amount: type === 'expense' ? -amount : amount,
      source: 'transaction',
      transactionId: created.id,
      entryDate: input.transactionDate,
    }])

    return created
  })
}
```

**Konvensi yang ditunjukkan:**
- Input berupa satu interface bernama, bukan daftar parameter posisional.
- Kepemilikan diverifikasi di dalam DB transaction, tidak pernah di luar.
- Uang bertipe `Money` (`bigint`) sepanjang jalur.
- Tanda diterapkan di batas ledger; `transactions.amount` selalu positif.
- Error adalah kelas domain, bukan string.
- Komentar menjelaskan keputusan yang tidak jelas, bukan mengulang kode.
- `?? null` eksplisit — Drizzle membedakan `undefined` (lewati) dan `null` (set null).

## 7. Penamaan

| Hal | Konvensi | Contoh |
|-----|----------|--------|
| File | kebab-case | `money-text.tsx`, `net-worth.ts` |
| Komponen | PascalCase | `MoneyText`, `TransactionItem` |
| Fungsi | camelCase, diawali kata kerja | `createTransaction`, `calculateNetWorth` |
| Server Action | akhiran `Action` | `createTransactionAction` |
| Tipe/interface | PascalCase, tanpa awalan `I` | `TransactionDto` |
| Konstanta | SCREAMING_SNAKE | `MINOR_UNITS` |
| Kolom DB | snake_case | `transaction_date` |
| Field Drizzle | camelCase | `transactionDate` |
| Boolean | awalan `is`/`has`/`can` | `isArchived`, `hasTransactions` |
| Variabel uang | akhiran satuan bila ambigu | `amountMinor`, `pricePerGram` |

## 8. Environment Variable

Divalidasi Zod saat start. Env yang hilang menggagalkan build, bukan menimbulkan crash saat runtime.

```ts
// src/lib/env.ts
import { z } from 'zod'

const serverSchema = z.object({
  DATABASE_URL:          z.string().url(),
  DATABASE_URL_UNPOOLED: z.string().url(),
  AUTH_SECRET:           z.string().min(32),
  AUTH_URL:              z.string().url().optional(),  // opsional: disimpulkan Vercel
  GOOGLE_CLIENT_ID:      z.string().min(1),
  GOOGLE_CLIENT_SECRET:  z.string().min(1),
  CRON_SECRET:           z.string().min(32),
  SMTP_HOST:             z.string().min(1),           // transport magic-link & email undangan
  SMTP_PORT:             z.coerce.number().int().positive(),
  SMTP_USER:             z.string().min(1),
  SMTP_PASSWORD:         z.string().min(1),
  RESEND_API_KEY:        z.string().optional(),       // disiapkan, belum dipakai — lihat src/lib/env.ts
  EMAIL_FROM:            z.string().email(),
  APP_URL:               z.string().url(),           // untuk membangun tautan undangan
  GOLD_PRICE_PROVIDER:   z.enum(['manual', 'external']).default('manual'),
  GOLD_PRICE_API_URL:    z.string().url().optional(),
  GOLD_PRICE_API_KEY:    z.string().optional(),
})

export const env = serverSchema.parse(process.env)
```

Modul ini tidak boleh diimpor Client Component; aturan lint menegakkannya.

## 9. Performa

**Anggaran** (dipaksakan lewat Lighthouse CI di preview Vercel):

| Metrik | Anggaran |
|--------|----------|
| LCP (4G, Moto G Power) | < 2,5 s |
| INP | < 200 ms |
| CLS | < 0,1 |
| JS rute dashboard | < 180 KB gzip |
| JS rute laporan | < 280 KB gzip (Recharts) |
| Waktu query DB dashboard | < 300 ms p95 |

**Teknik:**
- Server Component secara bawaan → JS terkirim minimal.
- Recharts di-`dynamic()` import, hanya di rute laporan.
- Font: `next/font` dengan `display: swap`, subset latin, hanya variable weight.
- Ikon di-tree-shake per ikon, bukan import barrel.
- Query dashboard digabung — satu round-trip untuk data utama.
- Cache statis di layer route untuk data yang tidak berubah per request (daftar kategori).
- Tidak ada gambar di jalur kritis; ikon dan warna saja.

## 10. Batas Error

| Level | Berkas | Fungsi |
|-------|--------|--------|
| Root | `app/error.tsx` | Menangkap kegagalan tak tertangani |
| Grup rute | `app/(app)/error.tsx` | Menjaga shell tetap utuh, isi diganti error |
| Per rute | `app/(app)/reports/error.tsx` | Kegagalan laporan tidak merusak sisanya |
| Not found | `app/not-found.tsx` | |
| Loading | `loading.tsx` per rute | Skeleton |

Setiap error boundary mencatat ke observability dengan `userId` dan nama rute, tetapi **tidak pernah** memuat nominal atau catatan transaksi di dalam log.
