// @vitest-environment node
/**
 * Integration tests for the sharing service — real Neon database. Covers
 * tasks/12-sharing-and-privacy/todo.md's "Berbagi Kekayaan" checklist:
 * own-membership-only share_wealth, owner-only exclude_from_household,
 * and the bulk "stop sharing everything" action.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { householdMembers, wallets } from '@/lib/db/schema';
import { NotFoundError } from '@/lib/api/errors';
import {
  createTestHousehold,
  createTestHouseholdMember,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { createHousehold } from '../households';
import { setExcludeFromHousehold, setShareWealth, stopSharingEverything } from '../sharing';

describe('sharing service', () => {
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

  async function membershipOf(userId: string, householdId: string) {
    const [row] = await dbWrite
      .select()
      .from(householdMembers)
      .where(and(eq(householdMembers.userId, userId), eq(householdMembers.householdId, householdId)));
    return row;
  }

  describe('setShareWealth', () => {
    it('turns share_wealth on for the caller\'s own membership', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createTestHousehold(owner);
      householdIds.push(household);
      await createTestHouseholdMember(household, member, { shareWealth: false });

      await setShareWealth(member, household, true);

      const row = await membershipOf(member, household);
      expect(row?.shareWealth).toBe(true);
    });

    it('turning it off takes effect for the very next read — no confirmation, no delay', async () => {
      const owner = await createTestUser();
      userIds.push(owner);
      // Real service, not the direct-insert test helper — this is the
      // OWNER's own membership row, which only `createHousehold` seeds
      // (`createTestHousehold` deliberately inserts the household row ONLY,
      // per its own doc comment).
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      await setShareWealth(owner, household.id, true);
      expect((await membershipOf(owner, household.id))?.shareWealth).toBe(true);

      await setShareWealth(owner, household.id, false);
      expect((await membershipOf(owner, household.id))?.shareWealth).toBe(false);
    });

    it('rejects a caller who is not an active member of the household', async () => {
      const owner = await createTestUser();
      const stranger = await createTestUser();
      userIds.push(owner, stranger);
      const household = await createTestHousehold(owner);
      householdIds.push(household);

      await expect(setShareWealth(stranger, household, true)).rejects.toThrow(NotFoundError);
    });

    it("cannot be used to change ANOTHER member's share_wealth — there is no target-user parameter at all, only the caller's own", async () => {
      const owner = await createTestUser();
      const memberA = await createTestUser();
      const memberB = await createTestUser();
      userIds.push(owner, memberA, memberB);
      const household = await createTestHousehold(owner);
      householdIds.push(household);
      await createTestHouseholdMember(household, memberA, { shareWealth: false });
      await createTestHouseholdMember(household, memberB, { shareWealth: false });

      await setShareWealth(memberA, household, true);

      expect((await membershipOf(memberA, household))?.shareWealth).toBe(true);
      expect((await membershipOf(memberB, household))?.shareWealth).toBe(false); // untouched
    });
  });

  describe('stopSharingEverything', () => {
    it('flips share_wealth off across every household the caller currently shares in, and reports the count', async () => {
      const ownerA = await createTestUser();
      const ownerB = await createTestUser();
      const ownerC = await createTestUser();
      const caller = await createTestUser();
      userIds.push(ownerA, ownerB, ownerC, caller);
      const householdA = await createTestHousehold(ownerA);
      const householdB = await createTestHousehold(ownerB);
      const householdC = await createTestHousehold(ownerC);
      householdIds.push(householdA, householdB, householdC);
      await createTestHouseholdMember(householdA, caller, { shareWealth: true });
      await createTestHouseholdMember(householdB, caller, { shareWealth: true });
      await createTestHouseholdMember(householdC, caller, { shareWealth: false }); // already off

      const result = await stopSharingEverything(caller);

      expect(result.affectedCount).toBe(2); // only A and B actually changed
      expect((await membershipOf(caller, householdA))?.shareWealth).toBe(false);
      expect((await membershipOf(caller, householdB))?.shareWealth).toBe(false);
      expect((await membershipOf(caller, householdC))?.shareWealth).toBe(false);
    });

    it("does not touch OTHER members' share_wealth in the same households", async () => {
      const owner = await createTestUser();
      const caller = await createTestUser();
      const otherMember = await createTestUser();
      userIds.push(owner, caller, otherMember);
      const household = await createTestHousehold(owner);
      householdIds.push(household);
      await createTestHouseholdMember(household, caller, { shareWealth: true });
      await createTestHouseholdMember(household, otherMember, { shareWealth: true });

      await stopSharingEverything(caller);

      expect((await membershipOf(caller, household))?.shareWealth).toBe(false);
      expect((await membershipOf(otherMember, household))?.shareWealth).toBe(true); // untouched
    });

    it('reports 0 and changes nothing when the caller shares nowhere', async () => {
      const solo = await createTestUser();
      userIds.push(solo);

      const result = await stopSharingEverything(solo);

      expect(result.affectedCount).toBe(0);
    });
  });

  describe('setExcludeFromHousehold', () => {
    async function walletExcluded(walletId: string): Promise<boolean | undefined> {
      const [row] = await dbWrite.select({ excludeFromHousehold: wallets.excludeFromHousehold }).from(wallets).where(eq(wallets.id, walletId));
      return row?.excludeFromHousehold;
    }

    it('toggles exclude_from_household on the owner\'s own wallet', async () => {
      const owner = await createTestUser();
      userIds.push(owner);
      const walletId = await createTestWallet(owner);

      await setExcludeFromHousehold(owner, 'wallet', walletId, true);
      expect(await walletExcluded(walletId)).toBe(true);

      await setExcludeFromHousehold(owner, 'wallet', walletId, false);
      expect(await walletExcluded(walletId)).toBe(false);
    });

    it("rejects a non-owner trying to exclude someone else's wallet", async () => {
      const owner = await createTestUser();
      const stranger = await createTestUser();
      userIds.push(owner, stranger);
      const walletId = await createTestWallet(owner);

      await expect(setExcludeFromHousehold(stranger, 'wallet', walletId, true)).rejects.toThrow(
        NotFoundError,
      );
      expect(await walletExcluded(walletId)).toBe(false); // untouched
    });

    it('rejects a nonexistent wallet id', async () => {
      const owner = await createTestUser();
      userIds.push(owner);

      await expect(
        setExcludeFromHousehold(owner, 'wallet', '00000000-0000-7000-8000-000000000000', true),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
