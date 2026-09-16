// @vitest-environment node
/**
 * Integration tests for the gold holdings service — real Neon database (see
 * .env, loaded via vitest.config.ts). Same pattern as
 * src/lib/services/__tests__/savings.integration.test.ts.
 *
 * Covers tasks/16-assets-gold/spec.md's and todo.md's acceptance criteria
 * that can only be proven against a real DB: atomic wallet-balance
 * movement, the `gold_buyback_lte_sell` CHECK constraint itself,
 * proportional `remaining_grams` reduction, buyback-only valuation
 * (ADR-007), cross-user isolation, idempotency, and reconciliation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { assets, goldLots, goldPrices, goldSales } from '@/lib/db/schema/assets';
import { wallets } from '@/lib/db/schema/wallets';
import { ValidationError } from '@/lib/api/errors';
import { findWalletBalanceDrift } from '@/lib/db/reconcile';
import { createTestUser, createTestWallet, deleteTestUser } from '@/lib/db/__tests__/test-helpers';
import { gramsToMoney, parseGrams } from '@/lib/finance/gold';
import { ManualPriceProvider } from '@/lib/gold-price/manual';
import { buyGold, recordGoldPrice, sellGold } from '../gold';

describe('gold service', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  async function setupUserWithWallet(balance = 100_000_000_00n) {
    const userId = await createTestUser();
    userIds.push(userId);
    const walletId = await createTestWallet(userId, { balance });
    return { userId, walletId };
  }

  async function getWalletBalance(walletId: string): Promise<bigint> {
    const [row] = await dbWrite.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.id, walletId));
    return row!.balance;
  }

  async function getAsset(userId: string) {
    const [row] = await dbWrite.select().from(assets).where(eq(assets.userId, userId));
    return row;
  }

  describe('buyGold', () => {
    it('reduces the wallet balance by exactly weight × price and creates a lot — one transaction', async () => {
      const { userId, walletId } = await setupUserWithWallet();
      const before = await getWalletBalance(walletId);

      const lot = await buyGold(userId, {
        weightGrams: '10',
        pricePerGram: 1_050_000_00n,
        walletId,
        purchaseDate: new Date(),
        goldForm: 'Antam',
        idempotencyKey: uuidv7(),
      });

      const expectedCost = gramsToMoney(parseGrams('10'), 1_050_000_00n);
      const after = await getWalletBalance(walletId);
      expect(before - after).toBe(expectedCost);
      expect(lot.weightGrams).toBe('10.0000');
      expect(lot.remainingGrams).toBe('10.0000');
      expect(lot.purchasePricePerGram).toBe(1_050_000_00n);
      expect(lot.ledgerEntryId).not.toBeNull();
    });

    it('creates the gold asset on first purchase and reuses the SAME asset on a later purchase', async () => {
      const { userId, walletId } = await setupUserWithWallet();
      const lot1 = await buyGold(userId, {
        weightGrams: '5',
        pricePerGram: 1_000_000_00n,
        walletId,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });
      const lot2 = await buyGold(userId, {
        weightGrams: '3',
        pricePerGram: 1_100_000_00n,
        walletId,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });

      expect(lot1.assetId).toBe(lot2.assetId);
      const asset = await getAsset(userId);
      expect(asset?.assetType).toBe('gold');
    });

    it('updates assets.cached_value using the BUYBACK price once one is recorded — not on the purchase price alone', async () => {
      const { userId, walletId } = await setupUserWithWallet();
      await buyGold(userId, {
        weightGrams: '10',
        pricePerGram: 1_050_000_00n,
        walletId,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });

      // No price recorded yet -> cached_value stays 0 (spec.md: "Belum ada
      // harga sama sekali -> valuasi disembunyikan").
      let asset = await getAsset(userId);
      expect(asset?.cachedValue).toBe(0n);

      await recordGoldPrice(userId, {
        priceDate: '2026-01-01',
        sellPerGram: 1_250_000_00n,
        buybackPerGram: 1_190_000_00n,
        source: 'manual',
      });

      asset = await getAsset(userId);
      expect(asset?.cachedValue).toBe(gramsToMoney(parseGrams('10'), 1_190_000_00n));
      // Explicitly NOT the sell-price valuation — ADR-007.
      expect(asset?.cachedValue).not.toBe(gramsToMoney(parseGrams('10'), 1_250_000_00n));
    });

    it('is idempotent: the same idempotencyKey twice returns the SAME lot and moves the balance once', async () => {
      const { userId, walletId } = await setupUserWithWallet();
      const key = uuidv7();
      const input = {
        weightGrams: '2',
        pricePerGram: 1_000_000_00n,
        walletId,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: key,
      };

      const before = await getWalletBalance(walletId);
      const first = await buyGold(userId, input);
      const second = await buyGold(userId, input);
      const after = await getWalletBalance(walletId);

      expect(second.id).toBe(first.id);
      expect(before - after).toBe(gramsToMoney(parseGrams('2'), 1_000_000_00n));
    });

    it('rejects a non-positive weight, applying no wallet change', async () => {
      const { userId, walletId } = await setupUserWithWallet();
      const before = await getWalletBalance(walletId);

      await expect(
        buyGold(userId, {
          weightGrams: '0',
          pricePerGram: 1_000_000_00n,
          walletId,
          purchaseDate: new Date(),
          goldForm: null,
          idempotencyKey: uuidv7(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await getWalletBalance(walletId)).toBe(before);
    });

    it("rejects buying into a wallet that isn't the caller's own — cross-user isolation, zero changes", async () => {
      const { walletId: otherWalletId } = await setupUserWithWallet();
      const { userId } = await setupUserWithWallet();

      await expect(
        buyGold(userId, {
          weightGrams: '1',
          pricePerGram: 1_000_000_00n,
          walletId: otherWalletId,
          purchaseDate: new Date(),
          goldForm: null,
          idempotencyKey: uuidv7(),
        }),
      ).rejects.toThrow(ValidationError);

      const asset = await getAsset(userId);
      expect(asset).toBeUndefined();
    });
  });

  describe('sellGold', () => {
    async function buyTwoLots(userId: string, walletId: string) {
      await buyGold(userId, {
        weightGrams: '10',
        pricePerGram: 1_000_000_00n,
        walletId,
        purchaseDate: new Date('2026-01-01'),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });
      await buyGold(userId, {
        weightGrams: '5',
        pricePerGram: 1_300_000_00n,
        walletId,
        purchaseDate: new Date('2026-01-15'),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });
    }

    it('increases the wallet balance by exactly the proceeds and records a gold_sales row', async () => {
      const { userId, walletId } = await setupUserWithWallet();
      await buyGold(userId, {
        weightGrams: '10',
        pricePerGram: 1_050_000_00n,
        walletId,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });

      const before = await getWalletBalance(walletId);
      const sale = await sellGold(userId, {
        weightGrams: '4',
        pricePerGram: 1_190_000_00n,
        walletId,
        saleDate: new Date(),
        idempotencyKey: uuidv7(),
      });
      const after = await getWalletBalance(walletId);

      const expectedProceeds = gramsToMoney(parseGrams('4'), 1_190_000_00n);
      expect(after - before).toBe(expectedProceeds);
      expect(sale.proceeds).toBe(expectedProceeds);
      expect(sale.ledgerEntryId).not.toBeNull();
    });

    it('reduces remaining_grams PROPORTIONALLY across multiple lots at different prices', async () => {
      const { userId, walletId } = await setupUserWithWallet();
      await buyTwoLots(userId, walletId);

      // Total 15g (10g @ 1_000_000, 5g @ 1_300_000) -> sell 6g (40% of total).
      await sellGold(userId, {
        weightGrams: '6',
        pricePerGram: 1_190_000_00n,
        walletId,
        saleDate: new Date(),
        idempotencyKey: uuidv7(),
      });

      const asset = await getAsset(userId);
      const lots = await dbWrite.select().from(goldLots).where(eq(goldLots.assetId, asset!.id));
      const byPrice = new Map(lots.map((l) => [l.purchasePricePerGram.toString(), l]));

      // lot @1_000_000 (10g) loses 10 * 6/15 = 4g -> 6g remaining.
      expect(byPrice.get('100000000')?.remainingGrams).toBe('6.0000');
      // lot @1_300_000 (5g) loses 5 * 6/15 = 2g -> 3g remaining.
      expect(byPrice.get('130000000')?.remainingGrams).toBe('3.0000');
    });

    it('computes realized_gain against the weighted-average cost basis, not any single lot', async () => {
      const { userId, walletId } = await setupUserWithWallet();
      await buyTwoLots(userId, walletId); // avg cost = 1_100_000/gram (see gold.test.ts's identical fixture)

      const sale = await sellGold(userId, {
        weightGrams: '6',
        pricePerGram: 1_190_000_00n,
        walletId,
        saleDate: new Date(),
        idempotencyKey: uuidv7(),
      });

      const expectedCostBasis = gramsToMoney(parseGrams('6'), 1_100_000_00n);
      expect(sale.costBasis).toBe(expectedCostBasis);
      expect(sale.realizedGain).toBe(sale.proceeds - expectedCostBasis);
    });

    it('rejects selling more than total holdings, applying NO change (FOR UPDATE guard)', async () => {
      const { userId, walletId } = await setupUserWithWallet();
      await buyGold(userId, {
        weightGrams: '5',
        pricePerGram: 1_000_000_00n,
        walletId,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });

      const beforeBalance = await getWalletBalance(walletId);
      const assetBefore = await getAsset(userId);

      await expect(
        sellGold(userId, {
          weightGrams: '5.0001',
          pricePerGram: 1_190_000_00n,
          walletId,
          saleDate: new Date(),
          idempotencyKey: uuidv7(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await getWalletBalance(walletId)).toBe(beforeBalance);
      const lots = await dbWrite.select().from(goldLots).where(eq(goldLots.assetId, assetBefore!.id));
      expect(lots[0]?.remainingGrams).toBe('5.0000');
      const sales = await dbWrite.select().from(goldSales).where(eq(goldSales.assetId, assetBefore!.id));
      expect(sales).toHaveLength(0);
    });

    it('rejects selling when the user has never bought any gold', async () => {
      const { userId, walletId } = await setupUserWithWallet();

      await expect(
        sellGold(userId, {
          weightGrams: '1',
          pricePerGram: 1_190_000_00n,
          walletId,
          saleDate: new Date(),
          idempotencyKey: uuidv7(),
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('is idempotent: the same idempotencyKey twice returns the SAME sale and moves the balance once', async () => {
      const { userId, walletId } = await setupUserWithWallet();
      await buyGold(userId, {
        weightGrams: '10',
        pricePerGram: 1_000_000_00n,
        walletId,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });

      const key = uuidv7();
      const input = {
        weightGrams: '3',
        pricePerGram: 1_190_000_00n,
        walletId,
        saleDate: new Date(),
        idempotencyKey: key,
      };

      const before = await getWalletBalance(walletId);
      const first = await sellGold(userId, input);
      const second = await sellGold(userId, input);
      const after = await getWalletBalance(walletId);

      expect(second.id).toBe(first.id);
      expect(after - before).toBe(gramsToMoney(parseGrams('3'), 1_190_000_00n));
    });

    it("rejects selling into a wallet that isn't the caller's own", async () => {
      const { userId, walletId } = await setupUserWithWallet();
      await buyGold(userId, {
        weightGrams: '10',
        pricePerGram: 1_000_000_00n,
        walletId,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });
      const { walletId: otherWalletId } = await setupUserWithWallet();

      await expect(
        sellGold(userId, {
          weightGrams: '1',
          pricePerGram: 1_190_000_00n,
          walletId: otherWalletId,
          saleDate: new Date(),
          idempotencyKey: uuidv7(),
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('cross-user isolation', () => {
    it("a user with no gold can't sell using another user's holdings", async () => {
      const { userId: ownerId, walletId: ownerWalletId } = await setupUserWithWallet();
      await buyGold(ownerId, {
        weightGrams: '20',
        pricePerGram: 1_000_000_00n,
        walletId: ownerWalletId,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });

      const { userId: strangerId, walletId: strangerWalletId } = await setupUserWithWallet();
      await expect(
        sellGold(strangerId, {
          weightGrams: '1',
          pricePerGram: 1_190_000_00n,
          walletId: strangerWalletId,
          saleDate: new Date(),
          idempotencyKey: uuidv7(),
        }),
      ).rejects.toThrow(ValidationError);

      // Owner's holdings are completely untouched by the stranger's attempt.
      const ownerAsset = await getAsset(ownerId);
      const ownerLots = await dbWrite.select().from(goldLots).where(eq(goldLots.assetId, ownerAsset!.id));
      expect(ownerLots[0]?.remainingGrams).toBe('20.0000');
    });

    it("user A's recorded price never affects user B's cached_value — prices are per-user", async () => {
      const { userId: userA, walletId: walletA } = await setupUserWithWallet();
      const { userId: userB, walletId: walletB } = await setupUserWithWallet();

      await buyGold(userA, {
        weightGrams: '10',
        pricePerGram: 1_000_000_00n,
        walletId: walletA,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });
      await buyGold(userB, {
        weightGrams: '10',
        pricePerGram: 1_000_000_00n,
        walletId: walletB,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });

      await recordGoldPrice(userA, {
        priceDate: '2026-02-01',
        sellPerGram: 2_000_000_00n,
        buybackPerGram: 1_900_000_00n,
        source: 'manual',
      });

      const assetA = await getAsset(userA);
      const assetB = await getAsset(userB);
      expect(assetA?.cachedValue).toBe(gramsToMoney(parseGrams('10'), 1_900_000_00n));
      // B never recorded a price -> valuation stays hidden/0, NOT poisoned by A's.
      expect(assetB?.cachedValue).toBe(0n);
    });
  });

  describe('recordGoldPrice', () => {
    it('upserts ONE row per (user, date) — a second call the same day overwrites, never duplicates', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await recordGoldPrice(userId, {
        priceDate: '2026-03-01',
        sellPerGram: 1_200_000_00n,
        buybackPerGram: 1_140_000_00n,
        source: 'manual',
      });
      await recordGoldPrice(userId, {
        priceDate: '2026-03-01',
        sellPerGram: 1_250_000_00n,
        buybackPerGram: 1_190_000_00n,
        source: 'manual',
      });

      const rows = await dbWrite.select().from(goldPrices).where(eq(goldPrices.userId, userId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.buybackPricePerGram).toBe(1_190_000_00n);
    });

    it('rejects buyback > sell at the service level with a friendly ValidationError', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await expect(
        recordGoldPrice(userId, {
          priceDate: '2026-03-02',
          sellPerGram: 1_000_000_00n,
          buybackPerGram: 1_100_000_00n,
          source: 'manual',
        }),
      ).rejects.toThrow(ValidationError);

      const rows = await dbWrite.select().from(goldPrices).where(eq(goldPrices.userId, userId));
      expect(rows).toHaveLength(0);
    });

    it('the gold_buyback_lte_sell CHECK constraint itself rejects invalid data, independent of application code', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await expect(
        dbWrite.insert(goldPrices).values({
          id: uuidv7(),
          userId,
          priceDate: '2026-03-03',
          sellPricePerGram: 1_000_000_00n,
          buybackPricePerGram: 1_100_000_00n, // > sell — must be rejected by the DB itself
          source: 'manual',
        }),
      ).rejects.toThrow();
    });
  });

  describe('ManualPriceProvider', () => {
    it("returns the user's own latest recorded price", async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await recordGoldPrice(userId, {
        priceDate: '2026-01-01',
        sellPerGram: 1_100_000_00n,
        buybackPerGram: 1_050_000_00n,
        source: 'manual',
      });
      await recordGoldPrice(userId, {
        priceDate: '2026-01-10',
        sellPerGram: 1_200_000_00n,
        buybackPerGram: 1_150_000_00n,
        source: 'manual',
      });

      const quote = await new ManualPriceProvider(userId).fetch();
      expect(quote.buybackPerGram).toBe(1_150_000_00n);
    });

    it('throws when the user has never recorded a price', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await expect(new ManualPriceProvider(userId).fetch()).rejects.toThrow();
    });
  });

  describe('fetchGoldPriceWithFallback — real external failure, real DB fallback', () => {
    // src/lib/gold-price/__tests__/provider.test.ts already proves the
    // fallback ORCHESTRATION with both providers mocked. This test proves
    // the same guarantee end-to-end: a REAL failed network request (an
    // RFC 2606 `.invalid` host, guaranteed to never resolve) falling back
    // to a REAL `ManualPriceProvider` read against the real database —
    // todo.md's "Integration: provider eksternal gagal -> memakai harga
    // manual terakhir".
    //
    // `getEnv()` caches its parsed result at module scope, so this test
    // resets the module registry and re-imports fresh after stubbing
    // `GOLD_PRICE_PROVIDER`/`GOLD_PRICE_API_URL` — otherwise whichever
    // value was cached first (from this file's own earlier imports) would
    // stick for every subsequent test in the process.
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('falls back to the last manually-recorded price when the external fetch genuinely fails', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await recordGoldPrice(userId, {
        priceDate: '2026-04-01',
        sellPerGram: 1_300_000_00n,
        buybackPerGram: 1_240_000_00n,
        source: 'manual',
      });

      vi.resetModules();
      vi.stubEnv('GOLD_PRICE_PROVIDER', 'external');
      vi.stubEnv('GOLD_PRICE_API_URL', 'https://gold-price-provider.invalid/quote');

      const { fetchGoldPriceWithFallback } = await import('@/lib/gold-price/provider');
      const result = await fetchGoldPriceWithFallback(userId);

      expect(result.fellBackToManual).toBe(true);
      expect(result.usedProviderId).toBe('manual');
      expect(result.quote.buybackPerGram).toBe(1_240_000_00n);
    });
  });

  describe('net worth invariant (docs/03-domain-model.md §14.3 #3)', () => {
    it('buying gold when a price already exists decreases net worth by EXACTLY the sell/buyback spread — never increases it', async () => {
      const { userId, walletId } = await setupUserWithWallet();

      // A price recorded BEFORE the purchase — spec.md's "Catatan": the
      // spread-only dip is what happens once a price is known; the
      // no-price-yet case dips by the full cost instead (cached_value is
      // honestly 0 with nothing to value against yet — see
      // src/lib/services/gold.ts's `recalculateCachedValue`), which is a
      // DIFFERENT, deliberate state, not this invariant's subject.
      await recordGoldPrice(userId, {
        priceDate: '2026-01-01',
        sellPerGram: 1_200_000_00n,
        buybackPerGram: 1_100_000_00n,
        source: 'manual',
      });

      const walletBefore = await getWalletBalance(walletId);
      await buyGold(userId, {
        weightGrams: '10',
        pricePerGram: 1_200_000_00n,
        walletId,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });
      const walletAfter = await getWalletBalance(walletId);
      const walletDecrease = walletBefore - walletAfter;

      const asset = await getAsset(userId);
      const assetValueIncrease = asset!.cachedValue; // was 0 (no asset existed) before this purchase.

      const netWorthChange = assetValueIncrease - walletDecrease;
      const expectedSpread = gramsToMoney(parseGrams('10'), 1_200_000_00n - 1_100_000_00n);

      expect(netWorthChange).toBeLessThan(0n);
      expect(-netWorthChange).toBe(expectedSpread);
    });
  });

  describe('reconciliation', () => {
    it('shows zero wallet balance drift after a sequence of buy/sell operations', async () => {
      // No `balance` override here (defaults to 0) — unlike
      // `setupUserWithWallet`'s seeded 100jt, which has no matching ledger
      // entry and would show a drift that has nothing to do with
      // buyGold/sellGold. Same reasoning as
      // savings.integration.test.ts's own drift test.
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);

      await buyGold(userId, {
        weightGrams: '10',
        pricePerGram: 1_000_000_00n,
        walletId,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });
      await buyGold(userId, {
        weightGrams: '5',
        pricePerGram: 1_300_000_00n,
        walletId,
        purchaseDate: new Date(),
        goldForm: null,
        idempotencyKey: uuidv7(),
      });
      await sellGold(userId, {
        weightGrams: '6',
        pricePerGram: 1_190_000_00n,
        walletId,
        saleDate: new Date(),
        idempotencyKey: uuidv7(),
      });
      await sellGold(userId, {
        weightGrams: '2',
        pricePerGram: 1_050_000_00n,
        walletId,
        saleDate: new Date(),
        idempotencyKey: uuidv7(),
      });

      const drift = await findWalletBalanceDrift();
      expect(drift.find((d) => d.walletId === walletId)).toBeUndefined();
    });
  });
});
