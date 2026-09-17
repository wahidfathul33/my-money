import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calculateHouseholdNetWorth, type HouseholdMemberNetWorthInput } from '../household-net-worth';

const MONEY = fc.bigInt({ min: 0n, max: 1_000_000_000_00n });

function member(overrides: Partial<HouseholdMemberNetWorthInput> = {}): HouseholdMemberNetWorthInput {
  return { userId: 'u1', name: 'Member', sharing: true, assets: 0n, liabilities: 0n, ...overrides };
}

describe('calculateHouseholdNetWorth', () => {
  it('byMember is the FIRST key on the returned object — ADR-029: "byMember diletakkan lebih dulu"', () => {
    const result = calculateHouseholdNetWorth([member()]);
    expect(Object.keys(result)).toEqual(['byMember', 'totals', 'coverage']);
  });

  it('sums assets/liabilities across sharing members into totals, exactly matching the byMember rows', () => {
    const members: HouseholdMemberNetWorthInput[] = [
      member({ userId: 'a', name: 'Wahid', sharing: true, assets: 175_000_000_00n, liabilities: 10_000_000_00n }),
      member({ userId: 'b', name: 'Istri', sharing: true, assets: 80_000_000_00n, liabilities: 0n }),
    ];
    const result = calculateHouseholdNetWorth(members);

    expect(result.byMember).toHaveLength(2);
    expect(result.byMember[0]).toMatchObject({ userId: 'a', netWorth: 165_000_000_00n });
    expect(result.byMember[1]).toMatchObject({ userId: 'b', netWorth: 80_000_000_00n });
    expect(result.totals.totalAssets).toBe(255_000_000_00n);
    expect(result.totals.totalLiabilities).toBe(10_000_000_00n);
    expect(result.totals.netWorth).toBe(245_000_000_00n);
  });

  it('a member who has NOT turned on sharing still appears in byMember, labeled via sharing=false, contributing ZERO to the total regardless of any figures passed in — "Belum berbagi" must never be silently dropped', () => {
    const members: HouseholdMemberNetWorthInput[] = [
      member({ userId: 'a', sharing: true, assets: 165_000_000_00n, liabilities: 0n }),
      // Non-sharing member: even if a caller mistakenly passed non-zero
      // figures (e.g. an upstream caching bug), this must NOT leak into the
      // total — the defensive zero below is deliberate, not filtering logic
      // this module doesn't otherwise own (see this file's header comment
      // and lib/finance/household-net-worth.ts's own doc comment).
      member({ userId: 'c', name: 'Adi', sharing: false, assets: 999_999_999_00n, liabilities: 0n }),
    ];
    const result = calculateHouseholdNetWorth(members);

    expect(result.byMember).toHaveLength(2);
    const adi = result.byMember.find((m) => m.userId === 'c')!;
    expect(adi.sharing).toBe(false);
    expect(adi.assets).toBe(0n);
    expect(adi.liabilities).toBe(0n);
    expect(adi.netWorth).toBe(0n);
    expect(result.totals.totalAssets).toBe(165_000_000_00n); // Adi's huge figure never counted
  });

  it('coverage: memberCount counts everyone, contributingCount counts only sharing members', () => {
    const members: HouseholdMemberNetWorthInput[] = [
      member({ userId: 'a', sharing: true }),
      member({ userId: 'b', sharing: true }),
      member({ userId: 'c', sharing: false }),
    ];
    const result = calculateHouseholdNetWorth(members);
    expect(result.coverage).toEqual({ memberCount: 3, contributingCount: 2 });
  });

  it('empty household (no members) produces a well-defined zero total, not a crash', () => {
    const result = calculateHouseholdNetWorth([]);
    expect(result.totals).toEqual({ totalAssets: 0n, totalLiabilities: 0n, netWorth: 0n });
    expect(result.coverage).toEqual({ memberCount: 0, contributingCount: 0 });
  });

  describe('I13 + member-transfer property tests', () => {
    it('property (I13): a transfer between two SHARING members moves money between their personal net worths but leaves the household TOTAL exactly unchanged — in both directions', () => {
      fc.assert(
        fc.property(MONEY, MONEY, fc.bigInt({ min: 0n, max: 2_000_000_000_00n }), (senderAssets, receiverAssets, amount) => {
          const before = calculateHouseholdNetWorth([
            member({ userId: 'sender', sharing: true, assets: senderAssets }),
            member({ userId: 'receiver', sharing: true, assets: receiverAssets }),
          ]);
          const after = calculateHouseholdNetWorth([
            member({ userId: 'sender', sharing: true, assets: senderAssets - amount }),
            member({ userId: 'receiver', sharing: true, assets: receiverAssets + amount }),
          ]);

          // Household total: unchanged, always, no in-between state.
          expect(after.totals.netWorth).toBe(before.totals.netWorth);
          expect(after.totals.totalAssets).toBe(before.totals.totalAssets);

          // Personal net worths: sender −amount, receiver +amount — proven
          // for BOTH directions since `amount` ranges over all non-negative
          // values including ones that would represent either party as
          // "sender" in the real UI.
          const senderBefore = before.byMember.find((m) => m.userId === 'sender')!;
          const senderAfter = after.byMember.find((m) => m.userId === 'sender')!;
          const receiverBefore = before.byMember.find((m) => m.userId === 'receiver')!;
          const receiverAfter = after.byMember.find((m) => m.userId === 'receiver')!;
          expect(senderAfter.netWorth).toBe(senderBefore.netWorth - amount);
          expect(receiverAfter.netWorth).toBe(receiverBefore.netWorth + amount);
        }),
      );
    });

    it('by contrast: a transfer TO a non-sharing member DOES change the visible household total — this is exactly why CoverageNote must always accompany the total, not a bug in this module', () => {
      const before = calculateHouseholdNetWorth([
        member({ userId: 'sender', sharing: true, assets: 100_000_000_00n }),
        member({ userId: 'nonSharing', sharing: false, assets: 0n }),
      ]);
      const after = calculateHouseholdNetWorth([
        member({ userId: 'sender', sharing: true, assets: 60_000_000_00n }),
        member({ userId: 'nonSharing', sharing: false, assets: 40_000_000_00n }), // still forced to 0 by sharing=false
      ]);

      expect(before.totals.netWorth).toBe(100_000_000_00n);
      expect(after.totals.netWorth).toBe(60_000_000_00n); // the 40jt "disappeared" from the total — money isn't gone, coverage just doesn't include it
    });
  });
});
