// @vitest-environment node
/**
 * Integration tests for the household read queries — real Neon database
 * (see .env, loaded via vitest.config.ts). Builds data through the service
 * layer (src/lib/services/households.ts), same pattern as
 * src/features/wallets/__tests__/queries.integration.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { archiveHousehold, createHousehold } from '@/lib/services/households';
import {
  createTestHouseholdMember,
  createTestUser,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { getHouseholdWithRole, listUserHouseholds } from '../queries';

describe('household queries', () => {
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

  describe('listUserHouseholds', () => {
    it('lists only households with an active membership, with the caller\'s role and active member count', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });

      const ownerList = await listUserHouseholds(owner);
      expect(ownerList).toHaveLength(1);
      expect(ownerList[0]).toMatchObject({ id: household.id, name: 'Keluarga', role: 'owner', memberCount: 2 });

      const memberList = await listUserHouseholds(member);
      expect(memberList).toHaveLength(1);
      expect(memberList[0]).toMatchObject({ id: household.id, role: 'member', memberCount: 2 });
    });

    it('excludes archived households — docs/03 §4.4', async () => {
      const owner = await createTestUser();
      userIds.push(owner);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      await archiveHousehold(owner, household.id);

      expect(await listUserHouseholds(owner)).toHaveLength(0);
    });

    it("excludes a household after the caller's membership is removed", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, {
        role: 'member',
        status: 'removed',
        removedAt: new Date(),
      });

      expect(await listUserHouseholds(member)).toHaveLength(0);
      // The owner's own view is unaffected.
      expect(await listUserHouseholds(owner)).toHaveLength(1);
    });

    it('returns an empty list for a user with no household — no trace whatsoever', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      expect(await listUserHouseholds(userId)).toEqual([]);
    });
  });

  describe('getHouseholdWithRole', () => {
    it("returns the household, the caller's role, and the active member count", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });

      const result = await getHouseholdWithRole(member, household.id);
      expect(result).toMatchObject({
        household: { id: household.id, name: 'Keluarga' },
        role: 'member',
        memberCount: 2,
      });
    });

    it('returns null for a non-member — cross-household isolation', async () => {
      const owner = await createTestUser();
      const stranger = await createTestUser();
      userIds.push(owner, stranger);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      expect(await getHouseholdWithRole(stranger, household.id)).toBeNull();
    });
  });
});
