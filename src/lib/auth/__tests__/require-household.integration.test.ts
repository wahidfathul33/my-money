// @vitest-environment node
/**
 * Integration tests for requireHouseholdMember() — real Neon database (see
 * .env, loaded via vitest.config.ts), same pattern as
 * src/lib/services/__tests__/wallets.integration.test.ts.
 *
 * tasks/10-household-core/todo.md: "Unit test keempat kombinasi: {owner,
 * member} × {requireOwner true, false}". There's no existing precedent in
 * this codebase for mocking a Drizzle transaction's query-builder chain, and
 * `requireHouseholdMember` takes a real `TransactionClient` — so these run
 * against the actual database (via `dbWrite.transaction`) rather than a
 * mock, which also exercises the real `status = 'active'` filter these
 * tests depend on.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { dbWrite } from '@/lib/db/write';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import {
  createTestHousehold,
  createTestHouseholdMember,
  createTestUser,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { requireHouseholdMember } from '../require-household';

describe('requireHouseholdMember', () => {
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

  it('owner × requireOwner=false → resolves with the owner membership', async () => {
    const owner = await createTestUser();
    userIds.push(owner);
    const householdId = await createTestHousehold(owner);
    householdIds.push(householdId);
    await createTestHouseholdMember(householdId, owner, { role: 'owner' });

    const membership = await dbWrite.transaction((tx) =>
      requireHouseholdMember(tx, owner, householdId, false),
    );
    expect(membership.role).toBe('owner');
  });

  it('owner × requireOwner=true → resolves with the owner membership', async () => {
    const owner = await createTestUser();
    userIds.push(owner);
    const householdId = await createTestHousehold(owner);
    householdIds.push(householdId);
    await createTestHouseholdMember(householdId, owner, { role: 'owner' });

    const membership = await dbWrite.transaction((tx) =>
      requireHouseholdMember(tx, owner, householdId, true),
    );
    expect(membership.role).toBe('owner');
  });

  it('member × requireOwner=false → resolves with the member membership', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    userIds.push(owner, member);
    const householdId = await createTestHousehold(owner);
    householdIds.push(householdId);
    await createTestHouseholdMember(householdId, owner, { role: 'owner' });
    await createTestHouseholdMember(householdId, member, { role: 'member' });

    const membership = await dbWrite.transaction((tx) =>
      requireHouseholdMember(tx, member, householdId, false),
    );
    expect(membership.role).toBe('member');
  });

  it('member × requireOwner=true → throws ForbiddenError', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    userIds.push(owner, member);
    const householdId = await createTestHousehold(owner);
    householdIds.push(householdId);
    await createTestHouseholdMember(householdId, owner, { role: 'owner' });
    await createTestHouseholdMember(householdId, member, { role: 'member' });

    await expect(
      dbWrite.transaction((tx) => requireHouseholdMember(tx, member, householdId, true)),
    ).rejects.toThrow(ForbiddenError);
  });

  it('non-member → throws NotFoundError, never ForbiddenError — docs/12 §3 H2', async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    userIds.push(owner, stranger);
    const householdId = await createTestHousehold(owner);
    householdIds.push(householdId);
    await createTestHouseholdMember(householdId, owner, { role: 'owner' });

    await expect(
      dbWrite.transaction((tx) => requireHouseholdMember(tx, stranger, householdId, false)),
    ).rejects.toThrow(NotFoundError);
  });

  it('a random UUID that matches no household → throws NotFoundError', async () => {
    const user = await createTestUser();
    userIds.push(user);

    await expect(
      dbWrite.transaction((tx) =>
        requireHouseholdMember(tx, user, '00000000-0000-0000-0000-000000000000', false),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("a 'removed' membership is rejected — status filter, not just row existence", async () => {
    const owner = await createTestUser();
    const removedUser = await createTestUser();
    userIds.push(owner, removedUser);
    const householdId = await createTestHousehold(owner);
    householdIds.push(householdId);
    await createTestHouseholdMember(householdId, owner, { role: 'owner' });
    await createTestHouseholdMember(householdId, removedUser, {
      role: 'member',
      status: 'removed',
      removedAt: new Date(),
    });

    await expect(
      dbWrite.transaction((tx) => requireHouseholdMember(tx, removedUser, householdId, false)),
    ).rejects.toThrow(NotFoundError);
  });
});
