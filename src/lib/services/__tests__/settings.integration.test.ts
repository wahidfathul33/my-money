// @vitest-environment node
/**
 * Integration test for the settings service — task 18's
 * `count_receivables_as_asset` (ADR-010). Small and real-DB-backed for the
 * same reason every other service integration test in this codebase is:
 * proving the actual column flips, not just that a function was called.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { users } from '@/lib/db/schema/users';
import { createTestUser, deleteTestUser } from '@/lib/db/__tests__/test-helpers';
import { updateUserPreferences } from '../settings';

describe('settings service', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  async function countReceivablesAsAsset(userId: string): Promise<boolean> {
    const [row] = await dbWrite
      .select({ countReceivablesAsAsset: users.countReceivablesAsAsset })
      .from(users)
      .where(eq(users.id, userId));
    return row?.countReceivablesAsAsset ?? false;
  }

  it('defaults to false for a freshly created user (ADR-010: conservative by default)', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    expect(await countReceivablesAsAsset(userId)).toBe(false);
  });

  it('flips count_receivables_as_asset to true, and back to false', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    await updateUserPreferences(userId, { countReceivablesAsAsset: true });
    expect(await countReceivablesAsAsset(userId)).toBe(true);

    await updateUserPreferences(userId, { countReceivablesAsAsset: false });
    expect(await countReceivablesAsAsset(userId)).toBe(false);
  });

  it("only ever touches the caller's own row — there is no targetUserId to guess, so the function's signature itself prevents a cross-user write", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    userIds.push(alice, bob);

    await updateUserPreferences(alice, { countReceivablesAsAsset: true });

    expect(await countReceivablesAsAsset(alice)).toBe(true);
    expect(await countReceivablesAsAsset(bob)).toBe(false); // untouched
  });
});
