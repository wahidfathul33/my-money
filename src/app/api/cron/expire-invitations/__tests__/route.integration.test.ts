// @vitest-environment node
/**
 * Integration test for the expire-invitations cron route —
 * docs/12-security-and-auth.md §8: bearer `CRON_SECRET`, 401 without it.
 * Calls the route handler directly with a constructed `Request`, same
 * approach Next.js route handlers support in tests generally (no HTTP
 * server needed — `GET` is just an async function).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { householdInvitations } from '@/lib/db/schema';
import { hashToken } from '@/lib/auth/invitation-token';
import { getEnv } from '@/lib/env';
import { createHousehold } from '@/lib/services/households';
import { createTestUser, deleteTestHousehold, deleteTestUser } from '@/lib/db/__tests__/test-helpers';
import { GET } from '../route';

describe('GET /api/cron/expire-invitations', () => {
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

  it('rejects a request without the correct bearer CRON_SECRET', async () => {
    const request = new Request('http://localhost/api/cron/expire-invitations');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('rejects a request with the wrong secret', async () => {
    const request = new Request('http://localhost/api/cron/expire-invitations', {
      headers: { authorization: 'Bearer wrong-secret-value-not-configured' },
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('expires past-due invitations and returns a count, given the correct secret', async () => {
    const owner = await createTestUser();
    userIds.push(owner);
    const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
    householdIds.push(household.id);

    const invitationId = uuidv7();
    await dbWrite.insert(householdInvitations).values({
      id: invitationId,
      householdId: household.id,
      email: 'expired-via-cron@example.invalid',
      role: 'member',
      invitedBy: owner,
      tokenHash: hashToken(uuidv7()),
      status: 'pending',
      expiresAt: new Date(Date.now() - 1000),
    });

    const request = new Request('http://localhost/api/cron/expire-invitations', {
      headers: { authorization: `Bearer ${getEnv().CRON_SECRET}` },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.expiredCount).toBeGreaterThanOrEqual(1);

    const [row] = await dbWrite
      .select()
      .from(householdInvitations)
      .where(eq(householdInvitations.id, invitationId));
    expect(row?.status).toBe('expired');
  });
});
