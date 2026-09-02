# 13 — Testing Strategy

## 1. Prinsip

Prioritas pengujian mengikuti **biaya kegagalan**, bukan cakupan baris kode.

Bug pada layout adalah gangguan. Bug pada perhitungan saldo membuat orang salah mengambil keputusan finansial dan menghancurkan kepercayaan pada aplikasi secara permanen. Distribusi usaha pengujian mencerminkan perbedaan itu.

```
      ╱╲          E2E (~15 skenario)
     ╱  ╲         alur kritis saja
    ╱────╲        Integrasi (~60)
   ╱      ╲       service + DB nyata
  ╱────────╲      Unit (~250)
 ╱          ╲     lib/finance — murni, cepat, menyeluruh
╱────────────╲
```

## 2. Target Coverage

| Area | Target | Alasan |
|------|:------:|--------|
| `lib/finance/**` | **95%** cabang | Perhitungan finansial. Bug di sini berarti angka salah. |
| **`lib/visibility/**`** | **100%** cabang | Predikat otorisasi. Satu cabang yang tidak diuji adalah satu cara data orang lain bocor. |
| `lib/services/**` | **85%** baris | Orkestrasi transaksi, batas atomisitas |
| `features/*/actions.ts` | **80%** baris | Validasi + otorisasi |
| `components/finance/**` | **70%** baris | Format tampilan uang |
| `components/ui/**` | 50% baris | Sebagian besar pembungkus Radix |
| Keseluruhan | **70%** | Gerbang CI |

`lib/visibility/**` adalah satu-satunya modul dengan target 100%, dan itu disengaja. Modul ini kecil, murni, dan menentukan siapa boleh melihat data siapa — kombinasi yang membuat cakupan penuh baik terjangkau maupun wajib.

Coverage adalah lantai, bukan tujuan. 95% pada `lib/finance` disertai property test yang menguji **sifat**, bukan sekadar menjalankan baris.

## 3. Tooling

| Level | Alat |
|-------|------|
| Unit | Vitest |
| Property-based | fast-check |
| Komponen | Vitest + Testing Library |
| Integrasi | Vitest + Neon test branch |
| E2E | Playwright (Chromium mobile + desktop) |
| Aksesibilitas | axe-core via `@axe-core/playwright` |
| Visual | Snapshot Playwright pada layar utama |
| Performa | Lighthouse CI |

## 4. Unit Test — Logika Finansial

Di sinilah usaha terbesar dicurahkan. Fungsi di `lib/finance/**` murni: tanpa I/O, tanpa React, tanpa database.

```ts
// src/lib/finance/__tests__/deposit.test.ts
import { describe, expect, it } from 'vitest'
import { calculateDepositInterest } from '../deposit'

describe('calculateDepositInterest', () => {
  it('menghitung bunga sederhana prorata hari dengan PPh 20%', () => {
    const result = calculateDepositInterest({
      principal: 10_000_000_00n,                 // Rp10.000.000
      annualRatePercent: 4.25,
      startDate: new Date('2026-01-01'),
      maturityDate: new Date('2026-04-01'),      // 90 hari
      taxRate: 0.2,
    })

    // 10.000.000 × 4,25% × 90/365 = 104.794,52 → 10.479.452 sen
    expect(result.grossInterest).toBe(10_479_45n)
    expect(result.tax).toBe(2_095_89n)
    expect(result.netInterest).toBe(8_383_56n)
    expect(result.maturityValue).toBe(10_008_383_56n)
  })

  it('membebaskan pajak untuk pokok di bawah ambang Rp7,5 juta', () => {
    const result = calculateDepositInterest({
      principal: 5_000_000_00n,
      annualRatePercent: 4.0,
      startDate: new Date('2026-01-01'),
      maturityDate: new Date('2027-01-01'),
      taxRate: 0,
    })
    expect(result.tax).toBe(0n)
    expect(result.netInterest).toBe(result.grossInterest)
  })

  it('mengembalikan bunga nol saat tenor nol hari', () => {
    const result = calculateDepositInterest({
      principal: 10_000_000_00n,
      annualRatePercent: 4.25,
      startDate: new Date('2026-01-01'),
      maturityDate: new Date('2026-01-01'),
      taxRate: 0.2,
    })
    expect(result.grossInterest).toBe(0n)
  })
})
```

**Konvensi test:**
- Nama test berupa kalimat yang menyatakan perilaku, bukan nama fungsi.
- Nilai harapan dihitung tangan dan disertai komentar aritmetiknya. Test yang harapannya disalin dari output justru mengunci bug.
- Semua nominal `bigint` dengan pemisah `_` agar terbaca.
- Satu perilaku per test.

## 5. Property-Based Test — Invarian

Invarian di [05-financial-integrity.md](05-financial-integrity.md#5-invarian) diuji terhadap input yang dibangkitkan, bukan hanya contoh yang dipilih manual.

```ts
// src/lib/finance/__tests__/net-worth.property.test.ts
import fc from 'fast-check'
import { expect, it } from 'vitest'
import { calculateNetWorth } from '../net-worth'
import { applyTransfer, applySavingsContribution, applyDebtPayment } from './helpers'

const moneyArb = fc.bigInt({ min: 1n, max: 1_000_000_000_00n })

it('transfer antar dompet tidak mengubah kekayaan bersih', () => {
  fc.assert(fc.property(arbitraryFinancialState(), moneyArb, (state, amount) => {
    const before = calculateNetWorth(state)
    const after  = calculateNetWorth(applyTransfer(state, amount))
    expect(after.netWorth).toBe(before.netWorth)
  }))
})

it('kontribusi tabungan tidak mengubah kekayaan bersih', () => {
  fc.assert(fc.property(arbitraryFinancialState(), moneyArb, (state, amount) => {
    const before = calculateNetWorth(state)
    const after  = calculateNetWorth(applySavingsContribution(state, amount))
    expect(after.netWorth).toBe(before.netWorth)
  }))
})

it('pembayaran hutang tidak mengubah kekayaan bersih', () => {
  fc.assert(fc.property(arbitraryFinancialState(), moneyArb, (state, amount) => {
    const before = calculateNetWorth(state)
    const after  = calculateNetWorth(applyDebtPayment(state, amount))
    expect(after.netWorth).toBe(before.netWorth)
  }))
})

it('kekayaan bersih selalu sama dengan total aset dikurangi total liabilitas', () => {
  fc.assert(fc.property(arbitraryFinancialState(), (state) => {
    const r = calculateNetWorth(state)
    expect(r.netWorth).toBe(r.totalAssets - r.totalLiabilities)
  }))
})

it('kontribusi savings memindahkan nilai tanpa mengubah total aset', () => {
  fc.assert(fc.property(arbitraryFinancialState(), moneyArb, (state, amount) => {
    const before = calculateNetWorth(state)
    const after  = calculateNetWorth(applySavingsContribution(state, amount))
    expect(after.totalAssets).toBe(before.totalAssets)   // hanya berpindah pos
    expect(after.netWorth).toBe(before.netWorth)
  }))
})

// I13 — transfer ke anggota, selalu netral di tingkat household
it('transfer ke anggota tidak mengubah kekayaan keluarga', () => {
  fc.assert(fc.property(arbitraryHouseholdState(), moneyArb, (state, amount) => {
    const before = calculateHouseholdNetWorth(state)
    const after  = calculateHouseholdNetWorth(applyMemberTransfer(state, amount))
    expect(after.netWorth).toBe(before.netWorth)
  }))
})

// Sisi pribadi tetap bergerak — dan itu memang benar
it('transfer ke anggota memindahkan kekayaan antar pribadi', () => {
  fc.assert(fc.property(arbitraryHouseholdState(), moneyArb, (state, amount) => {
    const after = applyMemberTransfer(state, amount)
    expect(after.sender.netWorth).toBe(state.sender.netWorth - amount)
    expect(after.recipient.netWorth).toBe(state.recipient.netWorth + amount)
  }))
})
```

Test "kekayaan bersih = aset − liabilitas" tampak sepele, tetapi ia yang akan menangkap kesalahan saat kategori aset baru ditambahkan ke pembilang tanpa dimasukkan ke `totalAssets`.

Dua test transfer terakhir sengaja berpasangan: yang pertama menjaga agar agregasi keluarga netral, yang kedua menjaga agar kenetralan itu **tidak dicapai dengan cara salah** — misalnya dengan tidak menggerakkan kedua sisi sama sekali.

## 6. Integration Test — Batas Transaksi

Dijalankan terhadap Neon test branch yang sesungguhnya. Menggunakan mock database di sini tidak ada gunanya — yang justru diuji adalah perilaku transaksi database.

```ts
// src/lib/services/__tests__/transfers.integration.test.ts
import { beforeEach, expect, it } from 'vitest'
import { createTransfer } from '../transfers'
import { getWalletBalance, getLedgerEntries } from './helpers'
import { seedTestUser } from './fixtures'

let user: TestUser

beforeEach(async () => { user = await seedTestUser() })

it('memindahkan dana antar dompet secara atomik', async () => {
  const { bca, gopay } = user.dompet
  await createTransfer({
    userId: user.id,
    amount: 500_000_00n,
    fromWalletId: bca.id,
    toWalletId: gopay.id,
    transactionDate: new Date(),
    idempotencyKey: crypto.randomUUID(),
  })

  expect(await getWalletBalance(bca.id)).toBe(bca.initialBalance - 500_000_00n)
  expect(await getWalletBalance(gopay.id)).toBe(gopay.initialBalance + 500_000_00n)

  const entries = await getLedgerEntries({ transferGroupId: /* … */ })
  expect(entries).toHaveLength(2)
  expect(entries.reduce((s, e) => s + e.amount, 0n)).toBe(0n)   // Invarian I2
})

it('tidak meninggalkan perubahan parsial saat dompet tujuan tidak sah', async () => {
  const { bca } = user.dompet
  const before = await getWalletBalance(bca.id)

  await expect(createTransfer({
    userId: user.id,
    amount: 500_000_00n,
    fromWalletId: bca.id,
    toWalletId: crypto.randomUUID(),      // tidak ada
    transactionDate: new Date(),
    idempotencyKey: crypto.randomUUID(),
  })).rejects.toThrow()

  expect(await getWalletBalance(bca.id)).toBe(before)   // rollback penuh
})

it('mengembalikan hasil yang sama untuk idempotency key yang diulang', async () => {
  const key = crypto.randomUUID()
  const input = { /* … */ idempotencyKey: key }

  const first  = await createTransfer(input)
  const second = await createTransfer(input)

  expect(second.id).toBe(first.id)
  expect(await getWalletBalance(user.wallets.bca.id))
    .toBe(user.wallets.bca.initialBalance - 500_000_00n)   // dipotong sekali saja
})
```

**Test isolasi lintas-user wajib untuk setiap modul:**

```ts
it('menolak akses ke data user lain', async () => {
  const alice = await seedTestUser()
  const bob   = await seedTestUser()

  await expect(createTransaction({
    userId: bob.id,
    walletId: alice.wallets.bca.id,        // dompet milik Alice
    /* … */
  })).rejects.toThrow(NotFoundError)
})
```

### 6.1 Test wajib untuk modul household

Setiap modul yang menyentuh `household_id` wajib punya keenam test ini. Tanpa salah satunya, PR tidak lolos review.

```ts
// 1. Isolasi lintas-household
it('anggota household A tidak dapat membaca laporan household B', async () => {
  const { household: a, owner: alice } = await seedHousehold()
  const { household: b }               = await seedHousehold()

  await expect(getHouseholdSummary({ userId: alice.id, householdId: b.id }))
    .rejects.toThrow(NotFoundError)          // NotFound, bukan Forbidden
})

// 2. Peran ditegakkan
it('member tidak dapat mengundang anggota', async () => {
  const { household, member } = await seedHousehold()
  await expect(inviteMember({
    actorId: member.id, householdId: household.id, email: 'x@contoh.com',
  })).rejects.toThrow(ForbiddenError)
})

// 3. Pencabutan berlaku seketika
it('anggota yang dikeluarkan langsung kehilangan akses', async () => {
  const { household, owner, member } = await seedHousehold()
  await expect(getHouseholdSummary({ userId: member.id, householdId: household.id }))
    .resolves.toBeDefined()

  await removeMember({ actorId: owner.id, householdId: household.id, userId: member.id })

  await expect(getHouseholdSummary({ userId: member.id, householdId: household.id }))
    .rejects.toThrow(NotFoundError)
})

// 4. Pencabutan berbagi ikut terjadi
it('mengeluarkan anggota mematikan share_wealth-nya', async () => {
  const { household, owner, member } = await seedHousehold()
  await setShareWealth({ userId: member.id, householdId: household.id, share: true })

  await removeMember({ actorId: owner.id, householdId: household.id, userId: member.id })

  const nw = await getHouseholdNetWorth({ userId: owner.id, householdId: household.id })
  expect(nw.byMember.find(m => m.userId === member.id)).toBeUndefined()
})

// 5. Privasi default
it('bergabung ke household tidak membagikan apa pun', async () => {
  const { household, owner } = await seedHousehold()
  const newcomer = await seedTestUser()
  await joinHousehold({ userId: newcomer.id, householdId: household.id })

  const nw = await getHouseholdNetWorth({ userId: owner.id, householdId: household.id })
  const row = nw.byMember.find(m => m.userId === newcomer.id)
  expect(row?.sharing).toBe(false)
  expect(row?.assets).toBe(0n)
})

// 6. Batas pengecualian aturan 1.3 — inilah yang paling penting diuji
it('mencatat transfer ke anggota menggerakkan kedua saldo, atomik', async () => {
  const { household, owner: wahid, member: istri } = await seedHousehold()

  await createMemberTransfer({
    userId: wahid.id, householdId: household.id,
    fromWalletId: wahid.wallets.bca.id,
    counterpartyUserId: istri.id,
    toWalletId: istri.wallets.bri.id,
    amount: 100_000_000n, idempotencyKey: crypto.randomUUID(),
  })

  expect(await getWalletBalance(wahid.wallets.bca.id))
    .toBe(wahid.wallets.bca.initialBalance - 100_000_000n)
  expect(await getWalletBalance(istri.wallets.bri.id))
    .toBe(istri.wallets.bri.initialBalance + 100_000_000n)
})

it('menolak dompet tujuan yang bukan milik counterparty', async () => {
  const { household, owner: wahid, member: istri } = await seedHousehold()
  const adi = await seedTestUser()                       // di luar household

  await expect(createMemberTransfer({
    userId: wahid.id, householdId: household.id,
    fromWalletId: wahid.wallets.bca.id,
    counterpartyUserId: istri.id,
    toWalletId: adi.wallets.bca.id,                      // ← milik orang ketiga
    amount: 100_000_000n, idempotencyKey: crypto.randomUUID(),
  })).rejects.toThrow()
})

it('menolak dompet tujuan yang ber-exclude_from_household', async () => {
  const { household, owner: wahid, member: istri } = await seedHousehold()
  await setExcludeFromHousehold({ userId: istri.id, entityType: 'dompet',
                                  entityId: istri.wallets.bri.id, exclude: true })

  await expect(createMemberTransfer({
    userId: wahid.id, householdId: household.id,
    fromWalletId: wahid.wallets.bca.id,
    counterpartyUserId: istri.id, toWalletId: istri.wallets.bri.id,
    amount: 100_000_000n, idempotencyKey: crypto.randomUUID(),
  })).rejects.toThrow(WalletNotEligibleError)
})

it('pemilih tujuan tidak pernah mengembalikan saldo', async () => {
  const { household, owner: wahid } = await seedHousehold()
  const targets = await listTransferTargets({ userId: wahid.id, householdId: household.id })
  for (const w of targets.flatMap(m => m.dompet)) {
    expect(w).not.toHaveProperty('balance')
  }
})
```

Test nomor 6 menjaga batas pengecualian aturan 1.3: kedua saldo bergerak, tetapi hanya ke dompet yang benar-benar boleh dituju.

Selain itu, invarian I11 diuji sebagai query menyeluruh, bukan per-operasi:

```ts
it('tidak ada ledger entry yang pemiliknya berbeda dari pemilik wallet-nya', async () => {
  await runEveryFinancialOperation()          // seluruh operasi di suite ini
  const violations = await findLedgerOwnershipViolations()
  expect(violations).toEqual([])
})
```

## 7. E2E — Alur Kritis

Playwright, viewport mobile (Pixel 5) sebagai target utama.

| # | Skenario | Mengapa kritis |
|---|----------|----------------|
| 1 | Login → onboarding → buat dompet pertama | Pengalaman pertama |
| 2 | Catat pengeluaran dari dashboard dalam ≤ 3 tap | Alur inti; performa diukur |
| 3 | Catat pemasukan, verifikasi saldo naik | |
| 4 | Transfer antar dompet, verifikasi kedua saldo | Rawan salah |
| 5 | Edit transaksi, verifikasi koreksi saldo | Rawan salah |
| 6 | Hapus transaksi lalu undo | Aksi destruktif |
| 7 | Buat savings goal, kontribusi, verifikasi net worth tetap | Anti double-count |
| 8 | Beli emas, verifikasi saldo dompet turun | |
| 9 | Jual emas, verifikasi realized gain | |
| 10 | Buat hutang, catat cicilan, verifikasi sisa | |
| 11 | Buat budget, catat pengeluaran, verifikasi progress | |
| 12 | Buat deposito, verifikasi estimasi bunga setelah pajak | |
| 13 | Filter riwayat transaksi, verifikasi URL bisa dibagikan | |
| 14 | Halaman net worth: rincian menjumlah tepat ke total | |
| 15 | Ekspor CSV, verifikasi isinya | |
| 16 | Buat household → undang → terima di akun kedua → muncul di daftar anggota | Alur multi-user pertama |
| 17 | Tandai pengeluaran ke household, verifikasi muncul di laporan keluarga dengan nama pembayar | Inti nilai household |
| 18 | Dua anggota mencatat pengeluaran keluarga, verifikasi total dan rincian per anggota benar | Anti double-count |
| 19 | Transfer ke anggota: catat → **kedua saldo langsung benar** → muncul di Aktivitas penerima | Jaminan inti |
| 20 | Penerima memindahkan transfer masuk ke dompet lain, lalu menghapusnya | Kedaulatan penerima atas sisinya |
| 21 | Kontribusi ke shared goal: saldo turun, kekayaan keluarga tetap | |
| 22 | Aktifkan `share_wealth` → kekayaan muncul di keluarga → matikan → hilang seketika | |
| 23 | Kecualikan satu dompet → hilang dari kekayaan keluarga, sisanya tetap | |
| 24 | Kekayaan keluarga menampilkan per anggota + cakupan saat sebagian belum berbagi | |
| 25 | Kategori kustom milik dua anggota tampil sebagai dua baris terpisah dengan nama pemilik | Verifikasi tanpa pencocokan kabur |
| 26 | Keluar dari household dengan opsi "lepaskan tag", verifikasi laporan keluarga menyesuaikan | |

Skenario 16–26 memerlukan **dua sesi browser** dalam satu test. Playwright menanganinya lewat dua `browserContext` terpisah:

```ts
test('mencatat transfer tidak menyentuh saldo lawan sampai ia mencatatnya', async ({ browser }) => {
  const wahid = await browser.newContext({ storageState: 'e2e/.auth/wahid.json' })
  const istri = await browser.newContext({ storageState: 'e2e/.auth/istri.json' })

  const pageW = await wahid.newPage()
  const pageI = await istri.newPage()

  await pageW.goto('/')
  // … catat transfer Rp1.000.000 ke Istri (memilih ORANG, bukan dompet)
  await expect(pageW.getByText('Menunggu dicatat Istri')).toBeVisible()

  // Saldo Istri belum berubah sama sekali
  await pageI.goto('/wallets')
  await expect(pageI.getByTestId('wallet-bri-balance')).toHaveText('Rp5.000.000')

  await pageI.goto('/activity')
  await expect(pageI.getByText('Wahid mencatat transfer')).toBeVisible()
  await pageI.getByRole('button', { name: 'Catat' }).click()
  await pageI.getByRole('button', { name: 'BRI' }).click()      // Istri pilih wallet-nya
  await pageI.getByRole('button', { name: 'Simpan' }).click()

  await pageI.goto('/wallets')
  await expect(pageI.getByTestId('wallet-bri-balance')).toHaveText('Rp6.000.000')
})
```

Menjalankan dua konteks memang lebih lambat, tetapi tidak ada cara lain menguji jaminan terpenting fitur ini di lapisan UI dan otorisasi sekaligus.

```ts
// e2e/record-expense.spec.ts
import { expect, test } from '@playwright/test'

test('mencatat pengeluaran dalam tiga tap', async ({ page }) => {
  await page.goto('/')
  const balanceBefore = await page.getByTestId('cash-total').textContent()

  await page.getByRole('button', { name: 'Tambah transaksi' }).click()   // tap 1
  await page.getByRole('button', { name: '5' }).click()
  await page.getByRole('button', { name: '000' }).click()
  await page.getByRole('button', { name: 'Makan & Minum' }).click()      // tap 2
  await page.getByRole('button', { name: 'Simpan' }).click()             // tap 3

  await expect(page.getByText('Tersimpan')).toBeVisible()
  await expect(page.getByTestId('cash-total')).not.toHaveText(balanceBefore!)
})
```

## 8. Aksesibilitas

```ts
// e2e/a11y.spec.ts
import AxeBuilder from '@axe-core/playwright'

const ROUTES = ['/', '/transactions', '/wealth', '/wealth/net-worth', '/reports', '/budgets']

for (const route of ROUTES) {
  test(`${route} tanpa pelanggaran WCAG A/AA`, async ({ page }) => {
    await page.goto(route)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
}
```

Ditambah pemeriksaan manual yang tidak dapat diotomatiskan: urutan fokus keyboard, pengumuman pembaca layar untuk perubahan saldo, dan penggunaan dengan satu tangan pada perangkat nyata.

## 9. Test Responsif

```ts
const WIDTHS = [360, 375, 390, 430, 768, 1024, 1440]

for (const width of WIDTHS) {
  test(`tanpa horizontal overflow pada ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    for (const route of ROUTES) {
      await page.goto(route)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      )
      expect(overflow, `overflow pada ${route}`).toBe(false)
    }
  })
}
```

Ditambah test yang memverifikasi setiap elemen interaktif berukuran ≥ 44×44 px pada viewport mobile.

## 10. Data Uji

- Fixture membuat user lengkap dengan dompet, kategori, dan transaksi yang dapat diprediksi.
- Setiap test integrasi berjalan dalam DB transaction yang di-rollback setelahnya. Test tidak pernah saling memengaruhi.
- E2E memakai database bersih per file spec.
- **Tidak ada data produksi di lingkungan test.** Tanpa pengecualian.
- Nominal di fixture memakai angka yang mudah diperiksa secara mental (Rp1.000.000, bukan Rp1.234.567), kecuali test memang menyasar pembulatan.

## 11. Gerbang CI

Wajib lolos sebelum merge:

- [ ] `npm run typecheck` — nol error
- [ ] `npm run lint` — nol warning (`--max-warnings=0`)
- [ ] `npm run test` — semua lulus, coverage memenuhi ambang
- [ ] `npm run test:e2e` — semua alur kritis lulus
- [ ] Lighthouse CI — anggaran terpenuhi
- [ ] Tanpa pelanggaran axe
- [ ] Tanpa temuan secret scanning

## 12. Definisi "Teruji" untuk Fitur Finansial

Sebuah fitur finansial belum selesai sebelum:

1. Fungsi perhitungannya punya unit test yang mencakup kasus normal, batas, dan nol.
2. Invarian yang terdampak punya property test.
3. Batas transaksinya punya integration test, termasuk skenario rollback.
4. Isolasi lintas-user punya test.
5. Idempotensi punya test.
6. Alur pengguna dari ujung ke ujung punya E2E.
7. Ada test yang **gagal sebelum implementasi ditulis**. Test yang tidak pernah merah tidak membuktikan apa pun.

**Bila fitur itu menyentuh household, tambahkan:**

8. Isolasi lintas-household punya test (`NotFoundError`, bukan `ForbiddenError`).
9. Aksi khusus `owner` punya test penolakan untuk `member`.
10. Pencabutan akses (keluar/dikeluarkan/matikan berbagi) punya test yang membuktikan efeknya seketika.
11. Privasi default punya test: bergabung tidak membagikan apa pun.
12. Efek pada kekayaan keluarga punya property test, bukan hanya contoh.
13. **Tidak ada parameter baru yang menerima dompet milik user lain**, selain `toWalletId` pada `createMemberTransfer` — dan itu diverifikasi kepemilikan serta kelayakannya di dalam transaction.
