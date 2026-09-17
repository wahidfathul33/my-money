// @vitest-environment node
/**
 * Integration tests for src/features/net-worth/queries.ts — real Neon
 * database. Proves the SQL wiring implements exactly what
 * src/lib/finance/net-worth.ts / household-net-worth.ts's property tests
 * already prove about the pure arithmetic: wallet asset/liability split,
 * credit-card-always-liability, household visibility filtering (`status =
 * 'active' AND share_wealth = true AND exclude_from_household = false`),
 * per-member-before-total ordering, and snapshot history reads.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { goldLots, goldPrices, netWorthSnapshots } from '@/lib/db/schema';
import {
  createTestDebt,
  createTestGoldAsset,
  createTestHousehold,
  createTestHouseholdMember,
  createTestReceivable,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { serializeMoney } from '@/lib/finance/money';
import { getHouseholdNetWorth, getNetWorth, getNetWorthHistory } from '../queries';

describe('features/net-worth/queries — integration', () => {
  const userIds: string[] = [];
  const householdIds: string[] = [];

  afterEach(async () => {
    for (const id of householdIds.splice(0)) {
      await deleteTestHousehold(id);
    }
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  describe('getNetWorth (personal)', () => {
    it('splits wallets by sign, treats credit cards as always-liability, and the breakdown sums exactly to the totals', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await createTestWallet(userId, { type: 'cash', balance: 1_000_000_00n });
      await createTestWallet(userId, { type: 'bank', balance: -200_000_00n }); // liability
      await createTestWallet(userId, { type: 'credit_card', balance: -150_000_00n }); // always liability
      await createTestDebt(userId, { initialAmount: 500_000_00n, remainingAmount: 300_000_00n });
      await createTestReceivable(userId, { initialAmount: 200_000_00n, remainingAmount: 100_000_00n });

      const result = await getNetWorth(userId);

      expect(result.breakdown.assets.cash).toBe(1_000_000_00n);
      expect(result.breakdown.liabilities.cashOverdraft).toBe(200_000_00n);
      expect(result.breakdown.liabilities.creditCards).toBe(150_000_00n);
      expect(result.breakdown.liabilities.debts).toBe(300_000_00n);
      // Not counted by default (ADR-010) — but still reported raw.
      expect(result.breakdown.assets.receivables).toBe(0n);
      expect(result.totalReceivables).toBe(100_000_00n);

      expect(result.totalAssets).toBe(1_000_000_00n);
      expect(result.totalLiabilities).toBe(200_000_00n + 150_000_00n + 300_000_00n);
      expect(result.netWorth).toBe(result.totalAssets - result.totalLiabilities);

      const { assets, liabilities } = result.breakdown;
      const assetSum = assets.cash + assets.savings + assets.gold + assets.deposits + assets.otherAssets + assets.receivables;
      const liabilitySum = liabilities.cashOverdraft + liabilities.creditCards + liabilities.debts;
      expect(assetSum).toBe(result.totalAssets);
      expect(liabilitySum).toBe(result.totalLiabilities);
    });

    it('values gold at the buyback price, never the sell price', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      const assetId = await createTestGoldAsset(userId);
      await dbWrite.insert(goldLots).values({
        id: uuidv7(),
        assetId,
        userId,
        weightGrams: '10.0000',
        remainingGrams: '10.0000',
        purchasePricePerGram: 1_000_000_00n,
        purchaseDate: '2026-01-01',
      });
      await dbWrite.insert(goldPrices).values({
        id: uuidv7(),
        userId,
        priceDate: '2026-06-01',
        sellPricePerGram: 1_300_000_00n,
        buybackPricePerGram: 1_190_000_00n,
      });

      const result = await getNetWorth(userId);
      // 10g * buyback 1.190.000 = 11.900.000 — NOT 13.000.000 (sell price).
      expect(result.breakdown.assets.gold).toBe(11_900_000_00n);
    });
  });

  describe('getHouseholdNetWorth', () => {
    it('only counts active + share_wealth=true + exclude_from_household=false; a non-sharing member appears with zero, not hidden; byMember precedes totals', async () => {
      const owner = await createTestUser();
      const sharer = await createTestUser();
      const nonSharer = await createTestUser();
      userIds.push(owner, sharer, nonSharer);
      const householdId = await createTestHousehold(owner);
      householdIds.push(householdId);

      await createTestHouseholdMember(householdId, sharer, { status: 'active', shareWealth: true });
      await createTestHouseholdMember(householdId, nonSharer, { status: 'active', shareWealth: false });

      await createTestWallet(owner, { type: 'cash', balance: 5_000_000_00n }); // owner never joined as member row -> not counted
      await createTestWallet(sharer, { type: 'cash', balance: 2_000_000_00n });
      await createTestWallet(sharer, { type: 'cash', balance: 500_000_00n, excludeFromHousehold: true }); // excluded item
      await createTestWallet(nonSharer, { type: 'cash', balance: 9_999_000_00n }); // sharing=false — must not count

      const result = await getHouseholdNetWorth(householdId);

      expect(Object.keys(result)[0]).toBe('byMember');

      const sharerRow = result.byMember.find((m) => m.userId === sharer)!;
      const nonSharerRow = result.byMember.find((m) => m.userId === nonSharer)!;
      expect(sharerRow.sharing).toBe(true);
      expect(sharerRow.assets).toBe(2_000_000_00n); // the excluded wallet is NOT counted
      expect(nonSharerRow.sharing).toBe(false);
      expect(nonSharerRow.assets).toBe(0n);
      expect(nonSharerRow.netWorth).toBe(0n);

      expect(result.totals.totalAssets).toBe(2_000_000_00n);
      expect(result.coverage).toEqual({ memberCount: 2, contributingCount: 1 });
    });

    it('a removed member is no longer counted, even though their row still exists', async () => {
      const owner = await createTestUser();
      const removedMember = await createTestUser();
      userIds.push(owner, removedMember);
      const householdId = await createTestHousehold(owner);
      householdIds.push(householdId);

      await createTestHouseholdMember(householdId, removedMember, { status: 'removed', shareWealth: true });
      await createTestWallet(removedMember, { type: 'cash', balance: 3_000_000_00n });

      const result = await getHouseholdNetWorth(householdId);

      // A removed member's row doesn't appear in the active roster at all —
      // status='removed' is filtered out of `listActiveMembersWithSharing`
      // itself, same as household-items.ts's own predicate would exclude it.
      expect(result.byMember.find((m) => m.userId === removedMember)).toBeUndefined();
      expect(result.totals.totalAssets).toBe(0n);
      expect(result.coverage.memberCount).toBe(0);
    });

    it('composition sums to the same totals as calculateHouseholdNetWorth would from the per-member figures', async () => {
      const owner = await createTestUser();
      const sharer = await createTestUser();
      userIds.push(owner, sharer);
      const householdId = await createTestHousehold(owner);
      householdIds.push(householdId);
      await createTestHouseholdMember(householdId, sharer, { status: 'active', shareWealth: true });
      await createTestWallet(sharer, { type: 'cash', balance: 4_000_000_00n });
      await createTestWallet(sharer, { type: 'credit_card', balance: -1_000_000_00n });

      const result = await getHouseholdNetWorth(householdId);
      const { assets, liabilities } = result.composition;
      const assetSum = assets.cash + assets.savings + assets.gold + assets.deposits + assets.otherAssets + assets.receivables;
      const liabilitySum = liabilities.cashOverdraft + liabilities.creditCards + liabilities.debts;
      expect(assetSum).toBe(result.totals.totalAssets);
      expect(liabilitySum).toBe(result.totals.totalLiabilities);
      expect(liabilities.creditCards).toBe(1_000_000_00n);
    });
  });

  describe('getNetWorthHistory', () => {
    it('reads snapshots directly and respects the range cutoff', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      const oldSnapshot = {
        id: uuidv7(),
        userId,
        snapshotDate: '2020-01-01',
        totalAssets: 1_000_000_00n,
        totalLiabilities: 0n,
        netWorth: 1_000_000_00n,
        breakdown: { assets: {}, liabilities: {} },
      };
      const recentSnapshot = {
        id: uuidv7(),
        userId,
        snapshotDate: new Date().toISOString().slice(0, 10),
        totalAssets: 2_000_000_00n,
        totalLiabilities: 0n,
        netWorth: 2_000_000_00n,
        breakdown: { assets: { cash: serializeMoney(2_000_000_00n) }, liabilities: {} },
      };
      await dbWrite.insert(netWorthSnapshots).values([oldSnapshot, recentSnapshot]);

      const allHistory = await getNetWorthHistory(userId, 'all');
      expect(allHistory).toHaveLength(2);

      const recentHistory = await getNetWorthHistory(userId, '3m');
      expect(recentHistory).toHaveLength(1);
      expect(recentHistory[0]!.netWorth).toBe(2_000_000_00n);
    });
  });
});
