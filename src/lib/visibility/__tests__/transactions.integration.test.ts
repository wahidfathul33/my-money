// @vitest-environment node
/**
 * Integration tests for src/lib/visibility/transactions.ts — real Neon
 * database. Proves `visibleTransactionsWhere` (the SQL builder) and
 * `isTransactionVisible` (the pure predicate) agree, against real rows,
 * for the exact matrix docs/12-security-and-auth.md §4.1 describes: own
 * transactions, household-tagged transactions from someone else, and the
 * cross-household isolation + default-privacy guarantees
 * tasks/12-sharing-and-privacy/spec.md's acceptance criteria call out by
 * name ("Test privasi default", "Test isolasi").
 *
 * This is the "cross-user isolation template" every module since task 04
 * is required to have its own copy of — src/lib/db/__tests__/scoped.isolation.integration.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { householdMembers, transactions } from '@/lib/db/schema';
import {
  createTestCategory,
  createTestHousehold,
  createTestHouseholdMember,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { createTransaction } from '@/lib/services/transactions';
import { getActiveHouseholdIds, isTransactionVisible, visibleTransactionsWhere } from '../transactions';

describe('lib/visibility/transactions — integration', () => {
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

  async function recordTransaction(userId: string, householdId?: string) {
    const walletId = await createTestWallet(userId);
    const categoryId = await createTestCategory(userId, { type: 'expense' });
    const row = await createTransaction(userId, {
      type: 'expense',
      amount: 10_000_00n,
      categoryId,
      walletId,
      transactionDate: new Date(),
      note: null,
      idempotencyKey: uuidv7(),
      householdId,
    });
    return row.id;
  }

  async function visibleIdsFor(viewerId: string, activeHouseholdIds: string[]): Promise<Set<string>> {
    const rows = await dbWrite
      .select({ id: transactions.id })
      .from(transactions)
      .where(visibleTransactionsWhere(viewerId, activeHouseholdIds));
    return new Set(rows.map((r) => r.id));
  }

  describe('getActiveHouseholdIds', () => {
    it('returns only households the user is an ACTIVE member of', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const active = await createTestHousehold(owner);
      const removedFrom = await createTestHousehold(owner);
      householdIds.push(active, removedFrom);
      await createTestHouseholdMember(active, member, { status: 'active' });
      await createTestHouseholdMember(removedFrom, member, { status: 'removed' });

      const ids = await getActiveHouseholdIds(member);

      expect(ids).toEqual([active]);
    });

    it('returns an empty array for a user in no household at all', async () => {
      const solo = await createTestUser();
      userIds.push(solo);

      expect(await getActiveHouseholdIds(solo)).toEqual([]);
    });
  });

  describe('visibleTransactionsWhere — own vs household-tagged', () => {
    it("always includes the viewer's own transactions, tagged or not, regardless of household membership", async () => {
      const me = await createTestUser();
      userIds.push(me);
      const ownUntagged = await recordTransaction(me);

      const visible = await visibleIdsFor(me, []);

      expect(visible.has(ownUntagged)).toBe(true);
    });

    it("does NOT show another user's untagged transaction", async () => {
      const me = await createTestUser();
      const other = await createTestUser();
      userIds.push(me, other);
      const othersOwn = await recordTransaction(other);

      const visible = await visibleIdsFor(me, []);

      expect(visible.has(othersOwn)).toBe(false);
    });

    it("shows another user's transaction tagged to a household the viewer is an ACTIVE member of", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createTestHousehold(owner);
      householdIds.push(household);
      // `createTestHousehold` only inserts the `households` row (see its own
      // doc comment) — the OWNER needs their own active membership row too,
      // since `recordTransaction` below tags AS the owner and `createTransaction`
      // re-verifies membership for real (this is exactly the check under test).
      await createTestHouseholdMember(household, owner, { role: 'owner' });
      await createTestHouseholdMember(household, member, { status: 'active' });

      const tagged = await recordTransaction(owner, household);

      const activeHouseholds = await getActiveHouseholdIds(member);
      const visible = await visibleIdsFor(member, activeHouseholds);

      expect(visible.has(tagged)).toBe(true);
      expect(isTransactionVisible(member, activeHouseholds, { userId: owner, householdId: household })).toBe(
        true,
      );
    });

    it("does NOT show a household-tagged transaction to someone who was never a member — 'privasi default: bergabung tidak membagikan apa pun' also means NOT joining shares nothing", async () => {
      const owner = await createTestUser();
      const stranger = await createTestUser();
      userIds.push(owner, stranger);
      const household = await createTestHousehold(owner);
      householdIds.push(household);
      await createTestHouseholdMember(household, owner, { role: 'owner' });

      const tagged = await recordTransaction(owner, household);

      const visible = await visibleIdsFor(stranger, await getActiveHouseholdIds(stranger));

      expect(visible.has(tagged)).toBe(false);
      expect(isTransactionVisible(stranger, [], { userId: owner, householdId: household })).toBe(false);
    });
  });

  describe('cross-household isolation — a member of household X never sees household Y', () => {
    it('household-tagged transactions in Y are invisible to an active member of X only', async () => {
      const ownerX = await createTestUser();
      const ownerY = await createTestUser();
      const memberOfXOnly = await createTestUser();
      userIds.push(ownerX, ownerY, memberOfXOnly);
      const householdX = await createTestHousehold(ownerX);
      const householdY = await createTestHousehold(ownerY);
      householdIds.push(householdX, householdY);
      await createTestHouseholdMember(householdX, ownerX, { role: 'owner' });
      await createTestHouseholdMember(householdY, ownerY, { role: 'owner' });
      await createTestHouseholdMember(householdX, memberOfXOnly, { status: 'active' });

      const taggedToX = await recordTransaction(ownerX, householdX);
      const taggedToY = await recordTransaction(ownerY, householdY);

      const activeHouseholds = await getActiveHouseholdIds(memberOfXOnly);
      expect(activeHouseholds).toEqual([householdX]);

      const visible = await visibleIdsFor(memberOfXOnly, activeHouseholds);
      expect(visible.has(taggedToX)).toBe(true);
      expect(visible.has(taggedToY)).toBe(false);
    });
  });

  describe('revocation takes effect on the very next request', () => {
    it('leaving the household (status -> removed) makes an active member stop seeing NEW visibility resolution immediately', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createTestHousehold(owner);
      householdIds.push(household);
      await createTestHouseholdMember(household, owner, { role: 'owner' });
      await createTestHouseholdMember(household, member, { status: 'active' });

      const tagged = await recordTransaction(owner, household);

      const beforeIds = await getActiveHouseholdIds(member);
      expect(await visibleIdsFor(member, beforeIds)).toEqual(new Set([tagged]));

      // Member leaves — status flips to 'removed' (no separate cache to bust).
      await dbWrite
        .update(householdMembers)
        .set({ status: 'removed' })
        .where(eq(householdMembers.userId, member));

      const afterIds = await getActiveHouseholdIds(member);
      expect(afterIds).toEqual([]);
      expect(await visibleIdsFor(member, afterIds)).toEqual(new Set());
    });
  });
});
