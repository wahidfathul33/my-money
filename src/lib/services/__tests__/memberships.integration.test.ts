// @vitest-environment node
/**
 * Integration tests for the membership lifecycle service — real Neon
 * database. Covers tasks/11-household-membership/todo.md's membership
 * checklist: role enforcement, self-removal guard, last-owner guard,
 * ownership transfer leaving exactly one owner, immediate access loss, and
 * the exact 3-step revocation transaction (docs/12-security-and-auth.md §5
 * "Pencabutan saat keluar").
 */
import { afterEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { householdMembers, transactions } from '@/lib/db/schema';
import { requireHouseholdAccess } from '@/lib/services/households';
import { CannotRemoveSelfError, ForbiddenError, LastOwnerError, NotFoundError } from '@/lib/api/errors';
import {
  createTestCategory,
  createTestHouseholdMember,
  createTestUser,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { createHousehold } from '../households';
import { leaveHousehold, removeMember, revokeSharingFor, transferOwnership } from '../memberships';

describe('memberships service', () => {
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

  /** Seeds one household-tagged, non-voided transaction for `userId` — used
   * to prove the tag-fate choice (keep/release) in the revocation tests.
   * No `ledger_entries` row is written — this test only exercises
   * `transactions.household_id`, and `wallets`/`ledger_entries` have no FK
   * pointing back at `transactions` that would require one. */
  async function taggedTransactionFor(userId: string, householdId: string) {
    const categoryId = await createTestCategory(userId, { type: 'expense' });
    const id = uuidv7();
    await dbWrite.insert(transactions).values({
      id,
      userId,
      createdBy: userId,
      categoryId,
      householdId,
      type: 'expense',
      amount: 10_000_00n,
      transactionDate: new Date(),
      idempotencyKey: uuidv7(),
    });
    return id;
  }

  describe('removeMember', () => {
    it('sets status=removed, share_wealth=false, and removed_at, in one transaction', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member', shareWealth: true });

      await removeMember(owner, household.id, member, 'keep');

      const row = await membershipOf(member, household.id);
      expect(row?.status).toBe('removed');
      expect(row?.shareWealth).toBe(false);
      expect(row?.removedAt).not.toBeNull();
    });

    it('a member (non-owner) cannot remove another member', async () => {
      const owner = await createTestUser();
      const memberA = await createTestUser();
      const memberB = await createTestUser();
      userIds.push(owner, memberA, memberB);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, memberA, { role: 'member' });
      await createTestHouseholdMember(household.id, memberB, { role: 'member' });

      await expect(removeMember(memberA, household.id, memberB, 'keep')).rejects.toThrow(ForbiddenError);
    });

    it('the owner cannot remove themselves — use leaveHousehold instead', async () => {
      const owner = await createTestUser();
      userIds.push(owner);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      await expect(removeMember(owner, household.id, owner, 'keep')).rejects.toThrow(
        CannotRemoveSelfError,
      );
      const row = await membershipOf(owner, household.id);
      expect(row?.status).toBe('active'); // untouched
    });

    it('cannot remove someone from a household the actor doesn\'t belong to', async () => {
      const ownerA = await createTestUser();
      const ownerB = await createTestUser();
      const memberOfB = await createTestUser();
      userIds.push(ownerA, ownerB, memberOfB);
      const householdA = await createHousehold(ownerA, { name: 'A', timezone: 'Asia/Jakarta' });
      const householdB = await createHousehold(ownerB, { name: 'B', timezone: 'Asia/Jakarta' });
      householdIds.push(householdA.id, householdB.id);
      await createTestHouseholdMember(householdB.id, memberOfB, { role: 'member' });

      await expect(removeMember(ownerA, householdB.id, memberOfB, 'keep')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('"release" clears household_id on the removed member\'s own tagged transactions; "keep" leaves them', async () => {
      const owner = await createTestUser();
      const memberKeep = await createTestUser();
      const memberRelease = await createTestUser();
      userIds.push(owner, memberKeep, memberRelease);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, memberKeep, { role: 'member' });
      await createTestHouseholdMember(household.id, memberRelease, { role: 'member' });

      const txKeep = await taggedTransactionFor(memberKeep, household.id);
      const txRelease = await taggedTransactionFor(memberRelease, household.id);

      await removeMember(owner, household.id, memberKeep, 'keep');
      await removeMember(owner, household.id, memberRelease, 'release');

      const [keptRow] = await dbWrite.select().from(transactions).where(eq(transactions.id, txKeep));
      expect(keptRow?.householdId).toBe(household.id);

      const [releasedRow] = await dbWrite
        .select()
        .from(transactions)
        .where(eq(transactions.id, txRelease));
      expect(releasedRow?.householdId).toBeNull();
    });

    it('a removed member loses access on their VERY NEXT request — no grace period', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });

      await expect(requireHouseholdAccess(member, household.id)).resolves.toBeDefined();
      await removeMember(owner, household.id, member, 'keep');
      await expect(requireHouseholdAccess(member, household.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe('leaveHousehold', () => {
    it('a regular member can leave; membership is removed and sharing revoked', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member', shareWealth: true });

      await leaveHousehold(member, household.id, 'keep');

      const row = await membershipOf(member, household.id);
      expect(row?.status).toBe('removed');
      expect(row?.shareWealth).toBe(false);
    });

    it('the sole owner cannot leave — LAST_OWNER — until ownership is transferred', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });

      await expect(leaveHousehold(owner, household.id, 'keep')).rejects.toThrow(LastOwnerError);

      // Transfer ownership, then the former owner (now a regular member) CAN leave.
      await transferOwnership(owner, household.id, member);
      await expect(leaveHousehold(owner, household.id, 'keep')).resolves.toBeUndefined();

      const formerOwnerRow = await membershipOf(owner, household.id);
      expect(formerOwnerRow?.status).toBe('removed');
    });

    it('a non-member cannot "leave" a household they were never in', async () => {
      const owner = await createTestUser();
      const stranger = await createTestUser();
      userIds.push(owner, stranger);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      await expect(leaveHousehold(stranger, household.id, 'keep')).rejects.toThrow(NotFoundError);
    });
  });

  describe('transferOwnership', () => {
    it('leaves exactly one active owner: the old owner becomes a member, the target becomes owner', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });

      await transferOwnership(owner, household.id, member);

      const oldOwnerRow = await membershipOf(owner, household.id);
      const newOwnerRow = await membershipOf(member, household.id);
      expect(oldOwnerRow?.role).toBe('member');
      expect(newOwnerRow?.role).toBe('owner');

      const owners = await dbWrite
        .select()
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, household.id),
            eq(householdMembers.role, 'owner'),
            eq(householdMembers.status, 'active'),
          ),
        );
      expect(owners).toHaveLength(1);
    });

    it('a member (non-owner) cannot transfer ownership', async () => {
      const owner = await createTestUser();
      const memberA = await createTestUser();
      const memberB = await createTestUser();
      userIds.push(owner, memberA, memberB);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, memberA, { role: 'member' });
      await createTestHouseholdMember(household.id, memberB, { role: 'member' });

      await expect(transferOwnership(memberA, household.id, memberB)).rejects.toThrow(ForbiddenError);
    });

    it('cannot transfer ownership to someone who isn\'t an active member', async () => {
      const owner = await createTestUser();
      const outsider = await createTestUser();
      userIds.push(owner, outsider);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      await expect(transferOwnership(owner, household.id, outsider)).rejects.toThrow(NotFoundError);
    });
  });

  describe('revokeSharingFor — the exact 3-step revocation transaction', () => {
    it('is idempotent-safe: calling it on an already-removed membership finds nothing to update and reports NotFoundError', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member', status: 'removed' });

      await expect(
        dbWrite.transaction((tx) => revokeSharingFor(tx, member, household.id, 'keep')),
      ).rejects.toThrow(NotFoundError);
    });

    it('turns off share_wealth even when the caller passes "keep" for tags', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member', shareWealth: true });

      await dbWrite.transaction((tx) => revokeSharingFor(tx, member, household.id, 'keep'));

      const row = await membershipOf(member, household.id);
      expect(row?.shareWealth).toBe(false);
      expect(row?.status).toBe('removed');
    });
  });
});
