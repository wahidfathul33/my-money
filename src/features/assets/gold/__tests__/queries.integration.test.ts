// @vitest-environment node
/**
 * Integration tests for the gold read queries — real Neon database (see
 * .env, loaded via vitest.config.ts). Builds data through the service
 * layer (src/lib/services/gold.ts), same pattern as
 * src/features/savings/__tests__/queries.integration.test.ts.
 *
 * Focused on the SQL in queries.ts itself — scoping, ordering, and the
 * "no price yet" / "no holdings yet" null-handling are exactly the class
 * of bug unit-level reasoning over src/lib/finance/gold.ts alone can't
 * catch, since src/lib/services/__tests__/gold.integration.test.ts never
 * calls these read functions directly.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { buyGold, recordGoldPrice, sellGold } from '@/lib/services/gold';
import { createTestUser, createTestWallet, deleteTestUser } from '@/lib/db/__tests__/test-helpers';
import { gramsToMoney, parseGrams } from '@/lib/finance/gold';
import {
  getGoldAsset,
  getGoldHoldingsSummary,
  getGoldSales,
  getLatestGoldPrice,
  listGoldLots,
} from '../queries';

describe('gold queries', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  async function setupUser() {
    const userId = await createTestUser();
    userIds.push(userId);
    const walletId = await createTestWallet(userId, { balance: 100_000_000_00n });
    return { userId, walletId };
  }

  describe('a user who has never bought any gold', () => {
    it('getGoldAsset returns null', async () => {
      const { userId } = await setupUser();
      expect(await getGoldAsset(userId)).toBeNull();
    });

    it('listGoldLots returns an empty array', async () => {
      const { userId } = await setupUser();
      expect(await listGoldLots(userId)).toEqual([]);
    });

    it('getGoldHoldingsSummary reports no holdings and no price, all zeros', async () => {
      const { userId } = await setupUser();
      const summary = await getGoldHoldingsSummary(userId);
      expect(summary).toEqual({
        totalGrams: 0n,
        hasHoldings: false,
        averageCostPerGram: 0n,
        currentValue: 0n,
        unrealizedGain: 0n,
        hasPrice: false,
      });
    });

    it('getLatestGoldPrice returns null', async () => {
      const { userId } = await setupUser();
      expect(await getLatestGoldPrice(userId)).toBeNull();
    });

    it('getGoldSales returns an empty array', async () => {
      const { userId } = await setupUser();
      expect(await getGoldSales(userId)).toEqual([]);
    });
  });

  describe('a user with holdings but no recorded price', () => {
    it('getGoldHoldingsSummary hides valuation (hasPrice false, value/gain 0) but still reports cost basis', async () => {
      const { userId, walletId } = await setupUser();
      await buyGold(userId, {
        weightGrams: '10',
        pricePerGram: 1_000_000_00n,
        walletId,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });

      const summary = await getGoldHoldingsSummary(userId);
      expect(summary.hasHoldings).toBe(true);
      expect(summary.hasPrice).toBe(false);
      expect(summary.totalGrams).toBe(parseGrams('10'));
      expect(summary.averageCostPerGram).toBe(1_000_000_00n);
      expect(summary.currentValue).toBe(0n);
      expect(summary.unrealizedGain).toBe(0n);
    });
  });

  describe('a user with holdings and a recorded price', () => {
    it('getGoldHoldingsSummary computes value/gain using the BUYBACK price across multiple lots', async () => {
      const { userId, walletId } = await setupUser();
      await buyGold(userId, {
        weightGrams: '10',
        pricePerGram: 1_000_000_00n,
        walletId,
        purchaseDate: new Date('2026-01-01'),
        goldForm: 'Antam',
        idempotencyKey: uuidv7(),
      });
      await buyGold(userId, {
        weightGrams: '5',
        pricePerGram: 1_300_000_00n,
        walletId,
        purchaseDate: new Date('2026-01-15'),
        goldForm: 'UBS',
        idempotencyKey: uuidv7(),
      });
      await recordGoldPrice(userId, {
        priceDate: '2026-02-01',
        sellPerGram: 1_250_000_00n,
        buybackPerGram: 1_190_000_00n,
        source: 'manual',
      });

      const summary = await getGoldHoldingsSummary(userId);
      expect(summary.hasHoldings).toBe(true);
      expect(summary.hasPrice).toBe(true);
      expect(summary.totalGrams).toBe(parseGrams('15'));
      // Weighted avg: (10*1_000_000 + 5*1_300_000)/15 = 1_100_000.
      expect(summary.averageCostPerGram).toBe(1_100_000_00n);
      expect(summary.currentValue).toBe(gramsToMoney(parseGrams('15'), 1_190_000_00n));
      expect(summary.unrealizedGain).toBe(summary.currentValue - gramsToMoney(parseGrams('15'), 1_100_000_00n));
    });

    it('listGoldLots excludes fully-sold lots but includes ones bought afterward, oldest purchase first', async () => {
      // NOTE: an earlier version of this test tried to "fully liquidate"
      // one SPECIFIC lot by selling exactly its own weight (3g) out of a
      // 10g+3g=13g pool. That's not how sellGold works — computeSale
      // reduces every lot PROPORTIONALLY to its share of the TOTAL
      // (src/lib/finance/gold.ts's own doc comment: chosen over FIFO
      // because physical gold is fungible), so selling 3g out of 13g
      // shaves a little off BOTH lots rather than zeroing either one. That
      // was a bug in this test's premise, caught by actually running it
      // against the real DB — fixed by selling the ENTIRE pool (which
      // provably zeroes every lot exactly, see computeSale's full-sale
      // proof case) and then buying a fresh lot afterward instead.
      const { userId, walletId } = await setupUser();
      await buyGold(userId, {
        weightGrams: '10',
        pricePerGram: 1_000_000_00n,
        walletId,
        purchaseDate: new Date('2026-01-01'),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });
      await buyGold(userId, {
        weightGrams: '3',
        pricePerGram: 1_100_000_00n,
        walletId,
        purchaseDate: new Date('2026-01-05'),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });
      await sellGold(userId, {
        weightGrams: '13', // the ENTIRE combined holding
        pricePerGram: 1_050_000_00n,
        walletId,
        saleDate: new Date('2026-01-10'),
        idempotencyKey: uuidv7(),
      });
      expect(await listGoldLots(userId)).toEqual([]);

      await buyGold(userId, {
        weightGrams: '5',
        pricePerGram: 1_200_000_00n,
        walletId,
        purchaseDate: new Date('2026-01-20'),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });

      const lots = await listGoldLots(userId);
      expect(lots).toHaveLength(1);
      expect(lots[0]?.remainingGrams).toBe('5.0000');
    });

    it('getLatestGoldPrice reports the newest price with a correctly computed age and staleness', async () => {
      const { userId } = await setupUser();
      await recordGoldPrice(userId, {
        priceDate: '2026-01-01',
        sellPerGram: 1_200_000_00n,
        buybackPerGram: 1_140_000_00n,
        source: 'manual',
      });
      const newer = new Date();
      newer.setDate(newer.getDate() - 1);
      await recordGoldPrice(userId, {
        priceDate: newer.toISOString().slice(0, 10),
        sellPerGram: 1_250_000_00n,
        buybackPerGram: 1_190_000_00n,
        source: 'manual',
      });

      const latest = await getLatestGoldPrice(userId);
      expect(latest?.buybackPricePerGram).toBe(1_190_000_00n);
      expect(latest?.ageDays).toBe(1);
      expect(latest?.isStale).toBe(false);
    });

    it('getGoldAsset reports excludeFromHousehold default false and the cached value', async () => {
      const { userId, walletId } = await setupUser();
      await buyGold(userId, {
        weightGrams: '10',
        pricePerGram: 1_000_000_00n,
        walletId,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });

      const asset = await getGoldAsset(userId);
      expect(asset?.excludeFromHousehold).toBe(false);
      expect(asset?.cachedValue).toBe(0n); // no price recorded yet
    });

    it('getGoldSales lists every sale, newest first', async () => {
      const { userId, walletId } = await setupUser();
      await buyGold(userId, {
        weightGrams: '10',
        pricePerGram: 1_000_000_00n,
        walletId,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });
      await sellGold(userId, {
        weightGrams: '2',
        pricePerGram: 1_050_000_00n,
        walletId,
        saleDate: new Date('2026-01-10'),
        idempotencyKey: uuidv7(),
      });
      await sellGold(userId, {
        weightGrams: '3',
        pricePerGram: 1_100_000_00n,
        walletId,
        saleDate: new Date('2026-01-20'),
        idempotencyKey: uuidv7(),
      });

      const sales = await getGoldSales(userId);
      expect(sales).toHaveLength(2);
      expect(sales[0]?.saleDate).toBe('2026-01-20');
      expect(sales[1]?.saleDate).toBe('2026-01-10');
    });
  });

  describe('cross-user isolation', () => {
    it("user B's queries never see user A's lots, prices, or sales", async () => {
      const { userId: userA, walletId: walletA } = await setupUser();
      const { userId: userB } = await setupUser();

      await buyGold(userA, {
        weightGrams: '10',
        pricePerGram: 1_000_000_00n,
        walletId: walletA,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });
      await recordGoldPrice(userA, {
        priceDate: '2026-01-01',
        sellPerGram: 1_200_000_00n,
        buybackPerGram: 1_140_000_00n,
        source: 'manual',
      });
      await sellGold(userA, {
        weightGrams: '2',
        pricePerGram: 1_140_000_00n,
        walletId: walletA,
        saleDate: new Date(),
        idempotencyKey: uuidv7(),
      });

      expect(await getGoldAsset(userB)).toBeNull();
      expect(await listGoldLots(userB)).toEqual([]);
      expect(await getLatestGoldPrice(userB)).toBeNull();
      expect(await getGoldSales(userB)).toEqual([]);
      const summaryB = await getGoldHoldingsSummary(userB);
      expect(summaryB.hasHoldings).toBe(false);
      expect(summaryB.currentValue).toBe(0n);
    });
  });
});
