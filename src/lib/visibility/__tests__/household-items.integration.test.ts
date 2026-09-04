// @vitest-environment node
/**
 * Integration tests for src/lib/visibility/household-items.ts — real Neon
 * database. Proves `householdWealthJoin` + `notExcludedFromHousehold` (the
 * SQL builders) and `isHouseholdItemVisible` (the pure predicate) agree
 * against real `wallets` rows, for docs/12-security-and-auth.md §4.2's full
 * rule: `status = 'active' AND share_wealth = true AND
 * exclude_from_household = false` — exactly what
 * tasks/12-sharing-and-privacy/spec.md's acceptance criteria requires
 * ("Query kekayaan menyaring status = 'active' dan share_wealth = true dan
 * exclude_from_household = false").
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { householdMembers, wallets } from '@/lib/db/schema';
import {
  createTestHousehold,
  createTestHouseholdMember,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { householdWealthJoin, isHouseholdItemVisible, notExcludedFromHousehold } from '../household-items';

describe('lib/visibility/household-items — integration', () => {
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

  async function visibleWalletIds(householdId: string): Promise<Set<string>> {
    const rows = await dbWrite
      .select({ id: wallets.id })
      .from(wallets)
      .innerJoin(householdMembers, householdWealthJoin(wallets, householdId))
      .where(notExcludedFromHousehold(wallets));
    return new Set(rows.map((r) => r.id));
  }

  it("a member's wallet is invisible by default — 'privasi default: bergabung tidak membagikan apa pun'", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    userIds.push(owner, member);
    const household = await createTestHousehold(owner);
    householdIds.push(household);
    await createTestHouseholdMember(household, member, { status: 'active', shareWealth: false });
    const walletId = await createTestWallet(member);

    const visible = await visibleWalletIds(household);

    expect(visible.has(walletId)).toBe(false);
    expect(isHouseholdItemVisible({ status: 'active', shareWealth: false }, false)).toBe(false);
  });

  it('turning share_wealth ON makes the wallet visible; turning it OFF hides it again on the very next query', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    userIds.push(owner, member);
    const household = await createTestHousehold(owner);
    householdIds.push(household);
    await createTestHouseholdMember(household, member, { status: 'active', shareWealth: false });
    const walletId = await createTestWallet(member);

    expect((await visibleWalletIds(household)).has(walletId)).toBe(false);

    await dbWrite
      .update(householdMembers)
      .set({ shareWealth: true })
      .where(eq(householdMembers.userId, member));
    expect((await visibleWalletIds(household)).has(walletId)).toBe(true);

    // Revocation — same request shape, no separate cache to bust.
    await dbWrite
      .update(householdMembers)
      .set({ shareWealth: false })
      .where(eq(householdMembers.userId, member));
    expect((await visibleWalletIds(household)).has(walletId)).toBe(false);
  });

  it('exclude_from_household hides ONE item while share_wealth stays on for the rest', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    userIds.push(owner, member);
    const household = await createTestHousehold(owner);
    householdIds.push(household);
    await createTestHouseholdMember(household, member, { status: 'active', shareWealth: true });
    const excluded = await createTestWallet(member, { name: 'Rahasia', excludeFromHousehold: true });
    const included = await createTestWallet(member, { name: 'Biasa' });

    const visible = await visibleWalletIds(household);

    expect(visible.has(excluded)).toBe(false);
    expect(visible.has(included)).toBe(true);
    expect(isHouseholdItemVisible({ status: 'active', shareWealth: true }, true)).toBe(false);
    expect(isHouseholdItemVisible({ status: 'active', shareWealth: true }, false)).toBe(true);
  });

  it('a removed member is no longer counted, even if share_wealth is still true on the row', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    userIds.push(owner, member);
    const household = await createTestHousehold(owner);
    householdIds.push(household);
    // shareWealth left true on a REMOVED row — docs §4.2: "hm.status = 'active'
    // bukan formalitas". In practice revokeSharingFor always forces
    // shareWealth false too (src/lib/services/memberships.ts), but this
    // proves the JOIN condition doesn't rely on that alone.
    await createTestHouseholdMember(household, member, { status: 'removed', shareWealth: true });
    const walletId = await createTestWallet(member);

    expect((await visibleWalletIds(household)).has(walletId)).toBe(false);
    expect(isHouseholdItemVisible({ status: 'removed', shareWealth: true }, false)).toBe(false);
  });

  it("cross-household isolation: a member's shared wallet in household X is invisible when queried through household Y", async () => {
    const ownerX = await createTestUser();
    const ownerY = await createTestUser();
    const sharer = await createTestUser();
    userIds.push(ownerX, ownerY, sharer);
    const householdX = await createTestHousehold(ownerX);
    const householdY = await createTestHousehold(ownerY);
    householdIds.push(householdX, householdY);
    await createTestHouseholdMember(householdX, sharer, { status: 'active', shareWealth: true });
    const walletId = await createTestWallet(sharer);

    expect((await visibleWalletIds(householdX)).has(walletId)).toBe(true);
    expect((await visibleWalletIds(householdY)).has(walletId)).toBe(false);
  });
});
