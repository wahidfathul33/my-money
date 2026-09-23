// @vitest-environment node
/**
 * Integration tests for the households service — real Neon database (see
 * .env, loaded via vitest.config.ts). Same pattern as
 * src/lib/services/__tests__/wallets.integration.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { households, householdMembers } from '@/lib/db/schema';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import {
  createTestHouseholdMember,
  createTestUser,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import {
  archiveHousehold,
  createHousehold,
  requireHouseholdAccess,
  updateHousehold,
} from '../households';

describe('households service', () => {
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

  describe('createHousehold', () => {
    it('inserts households + household_members (owner, active) in one transaction — tasks/10 spec.md', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      const household = await createHousehold(userId, {
        name: 'Keluarga Wahid',
        timezone: 'Asia/Jakarta',
      });
      householdIds.push(household.id);

      expect(household.name).toBe('Keluarga Wahid');
      expect(household.timezone).toBe('Asia/Jakarta');
      expect(household.isArchived).toBe(false);
      expect(household.createdBy).toBe(userId);

      const [membership] = await dbWrite
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.householdId, household.id));
      expect(membership?.userId).toBe(userId);
      expect(membership?.role).toBe('owner');
      expect(membership?.status).toBe('active');
    });
  });

  // I16: every active household has exactly one active owner.
  describe('hm_single_owner_idx', () => {
    it('rejects a second active owner row for the same household, independent of application code', async () => {
      const userId = await createTestUser();
      const secondUserId = await createTestUser();
      userIds.push(userId, secondUserId);

      const household = await createHousehold(userId, {
        name: 'Keluarga',
        timezone: 'Asia/Jakarta',
      });
      householdIds.push(household.id);

      await expect(
        createTestHouseholdMember(household.id, secondUserId, {
          role: 'owner',
          status: 'active',
        }),
      ).rejects.toThrow();
    });
  });

  describe('updateHousehold', () => {
    it('renames the household and updates its timezone when called by the owner', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const household = await createHousehold(userId, { name: 'Lama', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      await updateHousehold(userId, household.id, { name: 'Baru', timezone: 'Asia/Makassar' });

      const [row] = await dbWrite.select().from(households).where(eq(households.id, household.id));
      expect(row?.name).toBe('Baru');
      expect(row?.timezone).toBe('Asia/Makassar');
    });

    it('a non-owner member cannot rename the household — throws ForbiddenError, nothing changes', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Asli', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });

      await expect(
        updateHousehold(member, household.id, { name: 'Diubah Member', timezone: 'Asia/Jakarta' }),
      ).rejects.toThrow(ForbiddenError);

      const [row] = await dbWrite.select().from(households).where(eq(households.id, household.id));
      expect(row?.name).toBe('Asli');
    });

    it('a non-member cannot rename the household — throws NotFoundError, nothing changes', async () => {
      const owner = await createTestUser();
      const stranger = await createTestUser();
      userIds.push(owner, stranger);
      const household = await createHousehold(owner, { name: 'Asli', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      await expect(
        updateHousehold(stranger, household.id, {
          name: 'Diubah Stranger',
          timezone: 'Asia/Jakarta',
        }),
      ).rejects.toThrow(NotFoundError);

      const [row] = await dbWrite.select().from(households).where(eq(households.id, household.id));
      expect(row?.name).toBe('Asli');
    });
  });

  describe('archiveHousehold', () => {
    it('sets is_archived without touching any membership row', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });

      const membersBefore = await dbWrite
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.householdId, household.id));

      await archiveHousehold(owner, household.id);

      const [row] = await dbWrite.select().from(households).where(eq(households.id, household.id));
      expect(row?.isArchived).toBe(true);

      const membersAfter = await dbWrite
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.householdId, household.id));
      expect(membersAfter).toEqual(membersBefore);
    });

    it('a non-owner member cannot archive the household', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });

      await expect(archiveHousehold(member, household.id)).rejects.toThrow(ForbiddenError);

      const [row] = await dbWrite.select().from(households).where(eq(households.id, household.id));
      expect(row?.isArchived).toBe(false);
    });
  });

  describe('requireHouseholdAccess — cross-household isolation', () => {
    it('a member of household A gets NotFoundError when accessing household B — docs/12 §3 H2', async () => {
      const userA = await createTestUser();
      const userB = await createTestUser();
      userIds.push(userA, userB);

      const householdA = await createHousehold(userA, { name: 'A', timezone: 'Asia/Jakarta' });
      const householdB = await createHousehold(userB, { name: 'B', timezone: 'Asia/Jakarta' });
      householdIds.push(householdA.id, householdB.id);

      await expect(requireHouseholdAccess(userA, householdB.id)).rejects.toThrow(NotFoundError);
      await expect(requireHouseholdAccess(userB, householdA.id)).rejects.toThrow(NotFoundError);

      // Each owner still has full access to their OWN household.
      await expect(requireHouseholdAccess(userA, householdA.id)).resolves.toMatchObject({
        household: { id: householdA.id },
        membership: { role: 'owner' },
      });
    });

    it('a random UUID that matches no household → NotFoundError', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await expect(
        requireHouseholdAccess(userId, '00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
