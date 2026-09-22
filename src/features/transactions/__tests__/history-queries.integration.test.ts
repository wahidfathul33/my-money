// @vitest-environment node
/**
 * Integration tests for src/features/transactions/history-queries.ts —
 * real Neon database (.env, vitest.config.ts), same pattern as
 * src/lib/services/__tests__/transactions.integration.test.ts.
 *
 * Covers tasks/09-transaction-history/spec.md's acceptance criteria that
 * can only be proven against a real DB: WIB-timezone day grouping (NOT
 * UTC), day-subtotal exclusion of transfers/voided rows, every filter
 * individually and combined, trigram search over note + category name,
 * keyset pagination under a concurrent insert (the "no skipped/duplicated
 * item" guarantee that's the whole reason this task uses cursor pagination
 * instead of offset), and cross-user isolation.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { transactions } from '@/lib/db/schema';
import { postEntries } from '@/lib/finance/ledger';
import {
  createTestCategory,
  createTestUser,
  createTestWallet,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { createTransaction, voidTransaction } from '@/lib/services/transactions';
import { decodeCursor } from '../cursor';
import { getDayTotals, listTransactionsPage } from '../history-queries';

describe('history-queries', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  async function setupUser() {
    const userId = await createTestUser();
    userIds.push(userId);
    const walletId = await createTestWallet(userId, { name: 'BCA' });
    const expenseCategory = await createTestCategory(userId, { type: 'expense', name: 'Makan' });
    const incomeCategory = await createTestCategory(userId, { type: 'income', name: 'Gaji' });
    return { userId, walletId, expenseCategory, incomeCategory };
  }

  async function recordAt(
    userId: string,
    walletId: string,
    categoryId: string,
    type: 'income' | 'expense',
    amount: bigint,
    transactionDate: Date,
    note: string | null = null,
  ) {
    return createTransaction(userId, {
      type,
      amount,
      categoryId,
      walletId,
      transactionDate,
      note,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  /**
   * Self-transfer fixture — `createTransaction` refuses `type: 'transfer'`
   * by design (see src/lib/services/transactions.ts's own header: "task 08
   * is explicitly out of scope here"), so this writes the two-ledger-entry
   * shape directly, matching the schema comment in
   * src/lib/db/schema/transactions.ts ("Self-transfers are already linked
   * via `transaction_id` on both ledger entries").
   */
  async function recordSelfTransfer(
    userId: string,
    fromWalletId: string,
    toWalletId: string,
    amount: bigint,
    transactionDate: Date,
    note: string | null = null,
  ) {
    return dbWrite.transaction(async (tx) => {
      const id = uuidv7();
      await tx.insert(transactions).values({
        id,
        userId,
        type: 'transfer',
        categoryId: null,
        amount,
        transactionDate,
        note,
        createdBy: userId,
      });
      await postEntries(tx, [
        {
          userId,
          walletId: fromWalletId,
          amount: -amount,
          source: 'transaction',
          entryDate: transactionDate,
          transactionId: id,
        },
        {
          userId,
          walletId: toWalletId,
          amount,
          source: 'transaction',
          entryDate: transactionDate,
          transactionId: id,
        },
      ]);
      return id;
    });
  }

  describe('WIB timezone day grouping — NOT UTC', () => {
    it('a transaction at 00:01 WIB groups under the WIB day, even though its UTC date is the previous day', async () => {
      const { userId, walletId, expenseCategory } = await setupUser();
      // 2026-09-02T00:01:00+07:00 == 2026-09-01T17:01:00Z
      const earlyMorningWib = new Date('2026-09-02T00:01:00+07:00');
      expect(earlyMorningWib.toISOString().slice(0, 10)).toBe('2026-09-01'); // sanity: UTC date differs
      await recordAt(userId, walletId, expenseCategory, 'expense', 10_000_00n, earlyMorningWib);

      const { items } = await listTransactionsPage(userId, { filters: { from: '2026-09-02', to: '2026-09-02' } });
      expect(items).toHaveLength(1);

      const { items: prevDayItems } = await listTransactionsPage(userId, {
        filters: { from: '2026-09-01', to: '2026-09-01' },
      });
      expect(prevDayItems).toHaveLength(0);
    });

    it('getDayTotals attributes the same early-morning transaction to the WIB day', async () => {
      const { userId, walletId, expenseCategory } = await setupUser();
      const earlyMorningWib = new Date('2026-09-02T00:01:00+07:00');
      await recordAt(userId, walletId, expenseCategory, 'expense', 25_000_00n, earlyMorningWib);

      const range = {
        start: new Date('2026-09-01T00:00:00Z'),
        end: new Date('2026-09-03T00:00:00Z'),
      };
      const totals = await getDayTotals(userId, range, {});
      expect(totals['2026-09-02']).toEqual({ income: 0n, expense: 25_000_00n });
      expect(totals['2026-09-01']).toBeUndefined();
    });
  });

  describe('changing the caller\'s timezone changes date grouping (tasks/22-settings-sharing-pwa)', () => {
    it('the same instant groups under a different calendar day depending on tz', async () => {
      const { userId, walletId, expenseCategory } = await setupUser();
      // 2026-09-02T00:01:00+07:00 == 2026-09-01T17:01:00Z — the exact same
      // fixture the WIB-grouping test above uses, proving the DB-level
      // mechanism (not just that Jakarta happens to work).
      const earlyMorningWib = new Date('2026-09-02T00:01:00+07:00');
      await recordAt(userId, walletId, expenseCategory, 'expense', 30_000_00n, earlyMorningWib);

      const range = {
        start: new Date('2026-09-01T00:00:00Z'),
        end: new Date('2026-09-03T00:00:00Z'),
      };

      // In the user's default Asia/Jakarta timezone, this falls on 09-02.
      const wibTotals = await getDayTotals(userId, range, {}, 'Asia/Jakarta');
      expect(wibTotals['2026-09-02']).toEqual({ income: 0n, expense: 30_000_00n });
      expect(wibTotals['2026-09-01']).toBeUndefined();

      // Regraded in a DIFFERENT (now-valid, previously-rejected) IANA zone —
      // Etc/UTC, 7 hours behind — the exact same row falls on 09-01 instead.
      // This is the mechanism `updatePreferencesAction` ->
      // `updateUserPreferences` -> `users.timezone` actually drives end to
      // end; the UI change is just persisting a different string here.
      const utcTotals = await getDayTotals(userId, range, {}, 'Etc/UTC');
      expect(utcTotals['2026-09-01']).toEqual({ income: 0n, expense: 30_000_00n });
      expect(utcTotals['2026-09-02']).toBeUndefined();
    });

    it('an invalid timezone string is still rejected', async () => {
      const { userId } = await setupUser();
      const range = { start: new Date('2026-09-01T00:00:00Z'), end: new Date('2026-09-03T00:00:00Z') };
      await expect(getDayTotals(userId, range, {}, 'Not/AZone')).rejects.toThrow(RangeError);
    });
  });

  describe('day subtotals exclude transfers and voided transactions', () => {
    it('sums income and expense independently, excluding a same-day transfer and a voided expense', async () => {
      const { userId, walletId, expenseCategory, incomeCategory } = await setupUser();
      const otherWallet = await createTestWallet(userId, { name: 'Tunai' });
      const day = new Date('2026-09-02T10:00:00+07:00');

      await recordAt(userId, walletId, incomeCategory, 'income', 500_000_00n, day);
      await recordAt(userId, walletId, expenseCategory, 'expense', 45_000_00n, day);
      const voided = await recordAt(userId, walletId, expenseCategory, 'expense', 999_000_00n, day);
      await voidTransaction(userId, voided.id);
      await recordSelfTransfer(userId, walletId, otherWallet, 100_000_00n, day);

      const range = { start: new Date('2026-09-01T17:00:00Z'), end: new Date('2026-09-02T17:00:00Z') };
      const totals = await getDayTotals(userId, range, {});
      expect(totals['2026-09-02']).toEqual({ income: 500_000_00n, expense: 45_000_00n });
    });
  });

  describe('transfer rows display neutrally', () => {
    it('a self-transfer lists with both wallets and no category, excluded from day totals', async () => {
      const { userId, walletId } = await setupUser();
      const toWallet = await createTestWallet(userId, { name: 'GoPay' });
      const day = new Date('2026-09-02T10:00:00+07:00');
      await recordSelfTransfer(userId, walletId, toWallet, 250_000_00n, day, 'Top up GoPay');

      const { items } = await listTransactionsPage(userId, {});
      expect(items).toHaveLength(1);
      const [item] = items;
      expect(item!.type).toBe('transfer');
      expect(item!.category).toBeNull();
      expect(item!.transferFrom?.name).toBe('BCA');
      expect(item!.transferTo?.name).toBe('GoPay');
    });
  });

  describe('filters', () => {
    it('walletId filters to transactions touching that wallet only', async () => {
      const { userId, walletId, expenseCategory } = await setupUser();
      const otherWallet = await createTestWallet(userId, { name: 'Tunai' });
      const day = new Date('2026-09-02T10:00:00+07:00');
      await recordAt(userId, walletId, expenseCategory, 'expense', 10_000_00n, day, 'BCA punya');
      await recordAt(userId, otherWallet, expenseCategory, 'expense', 20_000_00n, day, 'Tunai punya');

      const { items } = await listTransactionsPage(userId, { filters: { walletId } });
      expect(items).toHaveLength(1);
      expect(items[0]!.note).toBe('BCA punya');
    });

    it('categoryId filters exactly', async () => {
      const { userId, walletId, expenseCategory, incomeCategory } = await setupUser();
      const day = new Date('2026-09-02T10:00:00+07:00');
      await recordAt(userId, walletId, expenseCategory, 'expense', 10_000_00n, day);
      await recordAt(userId, walletId, incomeCategory, 'income', 20_000_00n, day);

      const { items } = await listTransactionsPage(userId, { filters: { categoryId: expenseCategory } });
      expect(items).toHaveLength(1);
      expect(items[0]!.type).toBe('expense');
    });

    it('type filters exactly, including transfer', async () => {
      const { userId, walletId, expenseCategory } = await setupUser();
      const toWallet = await createTestWallet(userId, { name: 'GoPay' });
      const day = new Date('2026-09-02T10:00:00+07:00');
      await recordAt(userId, walletId, expenseCategory, 'expense', 10_000_00n, day);
      await recordSelfTransfer(userId, walletId, toWallet, 20_000_00n, day);

      const { items: expenseOnly } = await listTransactionsPage(userId, { filters: { type: 'expense' } });
      expect(expenseOnly).toHaveLength(1);
      expect(expenseOnly[0]!.type).toBe('expense');

      const { items: transferOnly } = await listTransactionsPage(userId, { filters: { type: 'transfer' } });
      expect(transferOnly).toHaveLength(1);
      expect(transferOnly[0]!.type).toBe('transfer');
    });

    it('from/to date range filters by WIB calendar date, inclusive on both ends', async () => {
      const { userId, walletId, expenseCategory } = await setupUser();
      await recordAt(userId, walletId, expenseCategory, 'expense', 1_00n, new Date('2026-09-01T10:00:00+07:00'));
      await recordAt(userId, walletId, expenseCategory, 'expense', 2_00n, new Date('2026-09-02T10:00:00+07:00'));
      await recordAt(userId, walletId, expenseCategory, 'expense', 3_00n, new Date('2026-09-03T10:00:00+07:00'));

      const { items } = await listTransactionsPage(userId, { filters: { from: '2026-09-02', to: '2026-09-02' } });
      expect(items).toHaveLength(1);
      expect(items[0]!.amount).toBe(2_00n);
    });

    it('combines wallet + category + date-range filters', async () => {
      const { userId, walletId, expenseCategory, incomeCategory } = await setupUser();
      const otherWallet = await createTestWallet(userId, { name: 'Tunai' });
      const day = new Date('2026-09-02T10:00:00+07:00');
      const otherDay = new Date('2026-09-03T10:00:00+07:00');

      const target = await recordAt(userId, walletId, expenseCategory, 'expense', 10_000_00n, day, 'target');
      await recordAt(userId, otherWallet, expenseCategory, 'expense', 20_000_00n, day, 'wrong wallet');
      await recordAt(userId, walletId, incomeCategory, 'income', 30_000_00n, day, 'wrong category');
      await recordAt(userId, walletId, expenseCategory, 'expense', 40_000_00n, otherDay, 'wrong day');

      const { items } = await listTransactionsPage(userId, {
        filters: { walletId, categoryId: expenseCategory, from: '2026-09-02', to: '2026-09-02' },
      });
      expect(items).toHaveLength(1);
      expect(items[0]!.id).toBe(target.id);
    });
  });

  describe('search', () => {
    it('finds by note (trigram)', async () => {
      const { userId, walletId, expenseCategory } = await setupUser();
      const day = new Date('2026-09-02T10:00:00+07:00');
      await recordAt(userId, walletId, expenseCategory, 'expense', 10_000_00n, day, 'Makan siang di kantor');
      await recordAt(userId, walletId, expenseCategory, 'expense', 20_000_00n, day, 'Bensin motor');

      const { items } = await listTransactionsPage(userId, { filters: { q: 'siang' } });
      expect(items).toHaveLength(1);
      expect(items[0]!.note).toContain('siang');
    });

    it('finds by category name', async () => {
      const { userId, walletId, expenseCategory } = await setupUser();
      const day = new Date('2026-09-02T10:00:00+07:00');
      await recordAt(userId, walletId, expenseCategory, 'expense', 10_000_00n, day, 'tanpa catatan relevan');

      const { items } = await listTransactionsPage(userId, { filters: { q: 'Makan' } });
      expect(items).toHaveLength(1);
      expect(items[0]!.category?.name).toBe('Makan');
    });

    it('a query below the 2-char minimum is ignored entirely (no search filter applied)', async () => {
      const { userId, walletId, expenseCategory } = await setupUser();
      const day = new Date('2026-09-02T10:00:00+07:00');
      await recordAt(userId, walletId, expenseCategory, 'expense', 10_000_00n, day, 'apapun');

      // A single-char `q` is below MIN_SEARCH_LENGTH, so history-queries.ts
      // treats it as "no search filter" (documented in buildFilterConditions) —
      // everything still shows up, rather than an overly-narrow 1-char scan.
      const { items } = await listTransactionsPage(userId, { filters: { q: 'a' } });
      expect(items).toHaveLength(1);
    });
  });

  describe('cursor keyset pagination — no skipped or duplicated items under a concurrent insert', () => {
    it('paginating through with a small page size sees every pre-existing item exactly once, even after a new transaction is inserted mid-scroll', async () => {
      const { userId, walletId, expenseCategory } = await setupUser();
      const baseDay = new Date('2026-09-02T12:00:00+07:00');

      // 5 pre-existing transactions, oldest first, 1 minute apart.
      const preExisting = [];
      for (let i = 0; i < 5; i++) {
        const date = new Date(baseDay.getTime() + i * 60_000);
        const row = await recordAt(userId, walletId, expenseCategory, 'expense', BigInt((i + 1) * 1000_00), date, `tx-${i}`);
        preExisting.push(row.id);
      }

      // Page 1: first 2 items (page size 2) — the newest 2 (i=4, i=3).
      const page1 = await listTransactionsPage(userId, { limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();
      expect(decodeCursor(page1.nextCursor!)).not.toBeNull();

      // Simulate a new transaction arriving BETWEEN page 1 and page 2 —
      // newer than everything seen so far, so it must NOT appear on page 2
      // (an offset-based scheme would have shifted page 2's window and
      // either skipped an old item or repeated one).
      const midScrollDate = new Date(baseDay.getTime() + 10 * 60_000);
      const midScrollRow = await recordAt(
        userId,
        walletId,
        expenseCategory,
        'expense',
        999_00n,
        midScrollDate,
        'mid-scroll-insert',
      );

      // Page 2, 3: keep paginating with the cursor from the previous page.
      const page2 = await listTransactionsPage(userId, { limit: 2, cursor: page1.nextCursor });
      const page3 = await listTransactionsPage(userId, { limit: 2, cursor: page2.nextCursor });

      const seenIds = [...page1.items, ...page2.items, ...page3.items].map((i) => i.id);

      // The mid-scroll insert is NEWER than the cursor's anchor row, so it
      // must never appear on page 2 or page 3 (it would only ever appear on
      // page 1, which this "user is already scrolling" simulation has
      // already fetched before the insert happened).
      expect(seenIds).not.toContain(midScrollRow.id);

      // Every pre-existing item appears EXACTLY once across pages 1-3 — no
      // skip, no duplicate.
      for (const id of preExisting) {
        expect(seenIds.filter((seenId) => seenId === id)).toHaveLength(1);
      }
      expect(new Set(seenIds).size).toBe(seenIds.length);
      expect(page3.nextCursor).toBeNull();
    });
  });

  describe('cross-user isolation', () => {
    it("a user's history never includes another user's transactions", async () => {
      const alice = await setupUser();
      const bob = await setupUser();
      const day = new Date('2026-09-02T10:00:00+07:00');

      await recordAt(alice.userId, alice.walletId, alice.expenseCategory, 'expense', 10_000_00n, day, 'alice tx');
      await recordAt(bob.userId, bob.walletId, bob.expenseCategory, 'expense', 20_000_00n, day, 'bob tx');

      const { items: aliceItems } = await listTransactionsPage(alice.userId, {});
      expect(aliceItems).toHaveLength(1);
      expect(aliceItems[0]!.note).toBe('alice tx');

      const { items: bobItems } = await listTransactionsPage(bob.userId, {});
      expect(bobItems).toHaveLength(1);
      expect(bobItems[0]!.note).toBe('bob tx');

      // Filtering alice's history by bob's wallet id returns nothing —
      // never bob's data leaking through a cross-owner filter value either.
      const { items: crossFilter } = await listTransactionsPage(alice.userId, {
        filters: { walletId: bob.walletId },
      });
      expect(crossFilter).toHaveLength(0);
    });
  });
});
