// @vitest-environment node
/**
 * Integration tests for CSV export (src/features/settings/export-queries.ts)
 * — real Neon database. tasks/21-reports/todo.md's "Ekspor CSV" test
 * section: "isi CSV cocok dengan data di aplikasi" and "data anggota lain
 * tidak ikut". Exercises the row-fetching functions directly rather than
 * `exportDataAction` itself — `requireUser()` depends on a real Next.js
 * request session, which nothing else in this codebase's test suite mocks
 * either (see e.g. src/lib/auth/__tests__/invitation-rate-limit.test.ts,
 * which tests `assertInviteSendRateLimit` directly rather than an action
 * wrapping it); the rate limit itself is exercised below via
 * `checkRateLimit` directly with the exact `EXPORT_RATE_LIMIT` config
 * `exportDataAction` uses.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { transactions } from '@/lib/db/schema/transactions';
import { checkRateLimit, resetRateLimit } from '@/lib/api/rate-limit';
import {
  createTestAsset,
  createTestCategory,
  createTestDebt,
  createTestReceivable,
  createTestUser,
  createTestWallet,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import {
  EXPORT_RATE_LIMIT,
  fetchAssetsCsv,
  fetchDebtsCsv,
  fetchReceivablesCsv,
  fetchTransactionsCsv,
  fetchWalletsCsv,
  moneyToDecimalString,
} from '../export-queries';

/** Splits CSV text into `{ header, rows }`, tolerating the simple
 * (non-quoted) fields every fixture below uses — good enough for
 * assertions without pulling in a real CSV parser dependency. */
function parseCsv(csv: string): { header: string[]; rows: string[][] } {
  const lines = csv.split('\n');
  const header = lines[0]!.split(',');
  const rows = lines.slice(1).map((line) => line.split(','));
  return { header, rows };
}

const MID_SEPTEMBER_WIB = new Date('2026-09-15T05:00:00.000Z');

describe('export-queries', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  describe('moneyToDecimalString', () => {
    it('renders minor units as a plain decimal, never a formatted/prefixed string', () => {
      expect(moneyToDecimalString(150_000_00n)).toBe('150000.00');
      expect(moneyToDecimalString(50n)).toBe('0.50');
      expect(moneyToDecimalString(0n)).toBe('0.00');
    });

    it('preserves a negative sign', () => {
      expect(moneyToDecimalString(-50_000_00n)).toBe('-50000.00');
    });
  });

  describe('isi CSV cocok dengan data di aplikasi', () => {
    it('fetchTransactionsCsv reflects the exact seeded transaction', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { name: 'Makan & Minum', type: 'expense' });
      const txId = uuidv7();
      await dbWrite.insert(transactions).values({
        id: txId,
        userId,
        type: 'expense',
        categoryId,
        amount: 45_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        note: 'Nasi goreng',
        createdBy: userId,
      });

      const result = await fetchTransactionsCsv(userId);
      const { header, rows } = parseCsv(result);
      expect(header).toEqual(['ID', 'Tanggal', 'Tipe', 'Kategori', 'Nominal', 'Catatan', 'Dibatalkan']);
      expect(rows).toHaveLength(1);
      const [id, date, type, category, amount, note, voided] = rows[0]!;
      expect(id).toBe(txId);
      expect(date).toBe(MID_SEPTEMBER_WIB.toISOString());
      expect(type).toBe('expense');
      expect(category).toBe('Makan & Minum');
      expect(amount).toBe('45000.00');
      expect(note).toBe('Nasi goreng');
      expect(voided).toBe('Tidak');
    });

    it('fetchWalletsCsv reflects the exact seeded wallet balance', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { name: 'BCA', type: 'bank', balance: 2_500_000_00n });

      const { header, rows } = parseCsv(await fetchWalletsCsv(userId));
      expect(header).toEqual(['ID', 'Nama', 'Tipe', 'Saldo', 'Mata Uang', 'Diarsipkan']);
      expect(rows).toHaveLength(1);
      const [id, name, type, balance, currency, archived] = rows[0]!;
      expect(id).toBe(walletId);
      expect(name).toBe('BCA');
      expect(type).toBe('bank');
      expect(balance).toBe('2500000.00');
      expect(currency).toBe('IDR');
      expect(archived).toBe('Tidak');
    });

    it('fetchAssetsCsv reflects the exact seeded asset', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await createTestAsset(userId, { name: 'Deposito BNI', assetType: 'deposit', cachedValue: 10_000_000_00n });

      const { rows } = parseCsv(await fetchAssetsCsv(userId));
      expect(rows).toHaveLength(1);
      const [, name, assetType, status, value] = rows[0]!;
      expect(name).toBe('Deposito BNI');
      expect(assetType).toBe('deposit');
      expect(status).toBe('active');
      expect(value).toBe('10000000.00');
    });

    it('fetchDebtsCsv and fetchReceivablesCsv reflect exact seeded amounts', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await createTestDebt(userId, { creditorName: 'Bank X', initialAmount: 5_000_000_00n, remainingAmount: 3_000_000_00n });
      await createTestReceivable(userId, { debtorName: 'Teman Y', initialAmount: 1_000_000_00n, remainingAmount: 1_000_000_00n });

      const debtsResult = parseCsv(await fetchDebtsCsv(userId));
      expect(debtsResult.rows).toHaveLength(1);
      const [, creditorName, initial, remaining, status] = debtsResult.rows[0]!;
      expect(creditorName).toBe('Bank X');
      expect(initial).toBe('5000000.00');
      expect(remaining).toBe('3000000.00');
      expect(status).toBe('active');

      const receivablesResult = parseCsv(await fetchReceivablesCsv(userId));
      expect(receivablesResult.rows).toHaveLength(1);
      expect(receivablesResult.rows[0]![1]).toBe('Teman Y');
    });

    it('a comma or quote in a note is escaped, not corrupted', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const categoryId = await createTestCategory(userId, { type: 'expense' });
      await dbWrite.insert(transactions).values({
        id: uuidv7(),
        userId,
        type: 'expense',
        categoryId,
        amount: 10_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        note: 'Beli "obat", vitamin',
        createdBy: userId,
      });

      const csv = await fetchTransactionsCsv(userId);
      // The escaped field must round-trip through a real CSV rule: quoted,
      // with any embedded quote doubled — not naively split on the comma
      // inside it (which parseCsv's simple splitter WOULD misparse, so this
      // assertion checks the raw text rather than using parseCsv here).
      expect(csv).toContain('"Beli ""obat"", vitamin"');
    });
  });

  describe('data anggota lain tidak ikut (isolasi lintas-user)', () => {
    it('another user\'s transactions, wallets, assets, debts, and receivables never appear', async () => {
      const userAId = await createTestUser();
      const userBId = await createTestUser();
      userIds.push(userAId, userBId);

      const categoryAId = await createTestCategory(userAId, { type: 'expense' });
      const categoryBId = await createTestCategory(userBId, { type: 'expense' });
      await dbWrite.insert(transactions).values({
        id: uuidv7(),
        userId: userAId,
        type: 'expense',
        categoryId: categoryAId,
        amount: 10_000_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        createdBy: userAId,
      });
      // User B's data — deliberately much larger amounts, so any leak is unmistakable.
      await dbWrite.insert(transactions).values({
        id: uuidv7(),
        userId: userBId,
        type: 'expense',
        categoryId: categoryBId,
        amount: 99_999_999_00n,
        transactionDate: MID_SEPTEMBER_WIB,
        createdBy: userBId,
      });
      await createTestWallet(userBId, { name: 'Rekening Rahasia B' });
      await createTestAsset(userBId, { name: 'Aset Rahasia B' });
      await createTestDebt(userBId, { creditorName: 'Kreditur Rahasia B' });
      await createTestReceivable(userBId, { debtorName: 'Debitur Rahasia B' });

      const [txCsv, walletCsv, assetCsv, debtCsv, receivableCsv] = await Promise.all([
        fetchTransactionsCsv(userAId),
        fetchWalletsCsv(userAId),
        fetchAssetsCsv(userAId),
        fetchDebtsCsv(userAId),
        fetchReceivablesCsv(userAId),
      ]);

      expect(txCsv).not.toContain('99999999.00');
      expect(txCsv).not.toContain(userBId);
      expect(walletCsv).not.toContain('Rekening Rahasia B');
      expect(assetCsv).not.toContain('Aset Rahasia B');
      expect(debtCsv).not.toContain('Kreditur Rahasia B');
      expect(receivableCsv).not.toContain('Debitur Rahasia B');

      const { rows: txRows } = parseCsv(txCsv);
      expect(txRows).toHaveLength(1);
      expect(txRows[0]![4]).toBe('10000.00');
    });

    it('an empty account exports empty (header-only) CSVs, not an error', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      const [txCsv, walletCsv] = await Promise.all([fetchTransactionsCsv(userId), fetchWalletsCsv(userId)]);
      expect(parseCsv(txCsv).rows).toEqual([]); // header only, no data rows
      expect(txCsv).toBe('ID,Tanggal,Tipe,Kategori,Nominal,Catatan,Dibatalkan');
      expect(walletCsv.split('\n')).toHaveLength(1); // header only
    });
  });
});

describe('export rate limit — 3/jam per user (fail closed)', () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it('allows the first 3 exports within an hour', () => {
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit('export:user-1', EXPORT_RATE_LIMIT, now).allowed).toBe(true);
    }
  });

  it('blocks the 4th export within the same hour', () => {
    const now = Date.now();
    for (let i = 0; i < 3; i++) checkRateLimit('export:user-1', EXPORT_RATE_LIMIT, now);
    expect(checkRateLimit('export:user-1', EXPORT_RATE_LIMIT, now).allowed).toBe(false);
  });

  it('tracks each user independently', () => {
    const now = Date.now();
    for (let i = 0; i < 3; i++) checkRateLimit('export:user-1', EXPORT_RATE_LIMIT, now);
    expect(checkRateLimit('export:user-2', EXPORT_RATE_LIMIT, now).allowed).toBe(true);
  });

  it('resets after an hour elapses', () => {
    const now = Date.now();
    for (let i = 0; i < 3; i++) checkRateLimit('export:user-1', EXPORT_RATE_LIMIT, now);
    expect(checkRateLimit('export:user-1', EXPORT_RATE_LIMIT, now).allowed).toBe(false);

    const later = now + 60 * 60 * 1000 + 1;
    expect(checkRateLimit('export:user-1', EXPORT_RATE_LIMIT, later).allowed).toBe(true);
  });
});
