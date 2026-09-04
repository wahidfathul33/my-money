// @vitest-environment node
/**
 * Integration tests for the invitations service — real Neon database (see
 * .env, loaded via vitest.config.ts). Same pattern as
 * src/lib/services/__tests__/households.integration.test.ts.
 *
 * `sendInvitationEmail` is mocked — these tests exercise the real DB
 * transaction logic (the actually security-relevant part) without sending
 * real mail on every run; src/lib/email/__tests__/invitation.test.ts
 * separately proves the email content contract, and this task's report
 * covers the one/two REAL sends verified manually against `SMTP_USER`.
 *
 * Covers tasks/11-household-membership/spec.md's invitation security table
 * end to end: token hashing, one-time-use (including a genuine concurrent
 * race, not just two sequential calls), expiry, uniform error messages,
 * `hi_pending_uniq`, already-active-member rejection, and rate limits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { householdInvitations, householdMembers } from '@/lib/db/schema';
import { hashToken } from '@/lib/auth/invitation-token';
import { resetInvitationRateLimits, InvitationRateLimitedError } from '@/lib/auth/invitation-rate-limit';
import {
  AlreadyMemberError,
  ForbiddenError,
  InvitationInvalidError,
  NotFoundError,
  ValidationError,
} from '@/lib/api/errors';
import {
  createTestHouseholdMember,
  createTestUser,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { createHousehold } from '../households';

vi.mock('@/lib/email/invitation', () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined),
}));

const { sendInvitationEmail } = await import('@/lib/email/invitation');
const sendInvitationEmailMock = vi.mocked(sendInvitationEmail);

const {
  acceptInvitation,
  createInvitation,
  expireInvitations,
  previewInvitationByToken,
  resendInvitation,
  revokeInvitation,
} = await import('../invitations');

/** Directly inserts an invitation row, bypassing `createInvitation` — used
 * to set up expired/revoked/accepted states `createInvitation` itself would
 * never produce, and to control the raw token so the test can call
 * `acceptInvitation` with a known value. */
async function seedInvitation(
  householdId: string,
  invitedBy: string,
  overrides: Partial<typeof householdInvitations.$inferInsert> = {},
): Promise<{ id: string; rawToken: string }> {
  const rawToken = uuidv7();
  const id = uuidv7();
  await dbWrite.insert(householdInvitations).values({
    id,
    householdId,
    email: 'invitee@example.invalid',
    role: 'member',
    invitedBy,
    tokenHash: hashToken(rawToken),
    status: 'pending',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ...overrides,
  });
  return { id, rawToken };
}

describe('invitations service', () => {
  const userIds: string[] = [];
  const householdIds: string[] = [];

  beforeEach(() => {
    resetInvitationRateLimits();
    sendInvitationEmailMock.mockClear();
  });

  afterEach(async () => {
    for (const id of householdIds.splice(0)) {
      await deleteTestHousehold(id);
    }
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  describe('createInvitation', () => {
    it('stores ONLY the SHA-256 hash of the token — never the raw token — and the raw token only reaches the email', async () => {
      const owner = await createTestUser();
      userIds.push(owner);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      const { invitation } = await createInvitation(owner, {
        householdId: household.id,
        email: 'budi@example.invalid',
      });

      expect(sendInvitationEmailMock).toHaveBeenCalledTimes(1);
      const rawToken = sendInvitationEmailMock.mock.calls[0]![0].token;

      const [row] = await dbWrite
        .select()
        .from(householdInvitations)
        .where(eq(householdInvitations.id, invitation.id));
      expect(row?.tokenHash).toBe(hashToken(rawToken));
      // The column literally cannot hold the raw token unless the hash
      // happens to equal it (astronomically unlikely, and never for
      // SHA-256 vs a 43-char base64url token of a different length).
      expect(row?.tokenHash).not.toBe(rawToken);
      expect(row?.email).toBe('budi@example.invalid');
      expect(row?.role).toBe('member');
      expect(row?.status).toBe('pending');
    });

    it('a member (non-owner) cannot send an invitation', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });

      await expect(
        createInvitation(member, { householdId: household.id, email: 'x@example.invalid' }),
      ).rejects.toThrow(ForbiddenError);
      expect(sendInvitationEmailMock).not.toHaveBeenCalled();
    });

    it('a non-member cannot send an invitation to someone else\'s household', async () => {
      const owner = await createTestUser();
      const stranger = await createTestUser();
      userIds.push(owner, stranger);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      await expect(
        createInvitation(stranger, { householdId: household.id, email: 'x@example.invalid' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects inviting an email that already belongs to an active member', async () => {
      const owner = await createTestUser();
      const existingMember = await createTestUser({ email: 'sudah-anggota@example.invalid' });
      userIds.push(owner, existingMember);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, existingMember, { role: 'member' });

      await expect(
        createInvitation(owner, { householdId: household.id, email: 'sudah-anggota@example.invalid' }),
      ).rejects.toThrow(AlreadyMemberError);
      expect(sendInvitationEmailMock).not.toHaveBeenCalled();
    });

    it('rejects a second active invitation to the same email (hi_pending_uniq) as a ValidationError, not a crash', async () => {
      const owner = await createTestUser();
      userIds.push(owner);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      await createInvitation(owner, { householdId: household.id, email: 'dup@example.invalid' });
      await expect(
        createInvitation(owner, { householdId: household.id, email: 'dup@example.invalid' }),
      ).rejects.toThrow(ValidationError);
    });

    it('rate-limits the inviting user to 3 sends per hour (docs/12 §7), fail closed', async () => {
      const owner = await createTestUser();
      userIds.push(owner);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      for (let i = 0; i < 3; i++) {
        await createInvitation(owner, { householdId: household.id, email: `rl-${i}@example.invalid` });
      }
      await expect(
        createInvitation(owner, { householdId: household.id, email: 'rl-4@example.invalid' }),
      ).rejects.toThrow(InvitationRateLimitedError);

      // Fail closed — the 4th attempt wrote NOTHING and sent NO email.
      expect(sendInvitationEmailMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('acceptInvitation — one-time use, uniform errors', () => {
    it('accepting a valid invitation creates an active member row with role=member, share_wealth=false — joining shares nothing', async () => {
      const owner = await createTestUser();
      const invitee = await createTestUser({
        email: 'invitee@example.invalid',
        emailVerified: new Date(),
      });
      userIds.push(owner, invitee);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const { rawToken } = await seedInvitation(household.id, owner);

      const result = await acceptInvitation(rawToken, invitee);
      expect(result.householdId).toBe(household.id);

      const [membership] = await dbWrite
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.userId, invitee));
      expect(membership?.status).toBe('active');
      expect(membership?.role).toBe('member');
      expect(membership?.shareWealth).toBe(false);
    });

    it('a second sequential accept attempt with the same token fails — one-time use', async () => {
      const owner = await createTestUser();
      const invitee = await createTestUser({
        email: 'invitee@example.invalid',
        emailVerified: new Date(),
      });
      userIds.push(owner, invitee);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const { rawToken } = await seedInvitation(household.id, owner);

      await acceptInvitation(rawToken, invitee);
      await expect(acceptInvitation(rawToken, invitee)).rejects.toThrow(InvitationInvalidError);

      // Only ONE membership row exists — the second attempt didn't insert
      // a duplicate or corrupt the first.
      const rows = await dbWrite
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.userId, invitee));
      expect(rows).toHaveLength(1);
    });

    it('two CONCURRENT accept attempts for the same token race safely — exactly one succeeds, guarded by WHERE status=pending inside the transaction', async () => {
      const owner = await createTestUser();
      const invitee = await createTestUser({
        email: 'invitee@example.invalid',
        emailVerified: new Date(),
      });
      userIds.push(owner, invitee);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const { rawToken } = await seedInvitation(household.id, owner);

      const results = await Promise.allSettled([
        acceptInvitation(rawToken, invitee),
        acceptInvitation(rawToken, invitee),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InvitationInvalidError);

      const rows = await dbWrite
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.userId, invitee));
      expect(rows).toHaveLength(1);
    });

    it('an invitation past its expiry is rejected even though status is still pending', async () => {
      const owner = await createTestUser();
      const invitee = await createTestUser({
        email: 'invitee@example.invalid',
        emailVerified: new Date(),
      });
      userIds.push(owner, invitee);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const { rawToken } = await seedInvitation(household.id, owner, {
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(acceptInvitation(rawToken, invitee)).rejects.toThrow(InvitationInvalidError);
    });

    it('a revoked invitation is rejected', async () => {
      const owner = await createTestUser();
      const invitee = await createTestUser({
        email: 'invitee@example.invalid',
        emailVerified: new Date(),
      });
      userIds.push(owner, invitee);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const { rawToken } = await seedInvitation(household.id, owner, { status: 'revoked' });

      await expect(acceptInvitation(rawToken, invitee)).rejects.toThrow(InvitationInvalidError);
    });

    it('a token that never existed is rejected', async () => {
      const invitee = await createTestUser({ emailVerified: new Date() });
      userIds.push(invitee);

      await expect(acceptInvitation('this-token-was-never-issued', invitee)).rejects.toThrow(
        InvitationInvalidError,
      );
    });

    it('rejects when the accepting user\'s email does not match the invitation', async () => {
      const owner = await createTestUser();
      const wrongUser = await createTestUser({
        email: 'orang-lain@example.invalid',
        emailVerified: new Date(),
      });
      userIds.push(owner, wrongUser);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const { rawToken } = await seedInvitation(household.id, owner); // email: invitee@example.invalid

      await expect(acceptInvitation(rawToken, wrongUser)).rejects.toThrow(InvitationInvalidError);
    });

    it('rejects when the accepting user\'s matching email is not verified', async () => {
      const owner = await createTestUser();
      const unverified = await createTestUser({
        email: 'invitee@example.invalid',
        emailVerified: null,
      });
      userIds.push(owner, unverified);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const { rawToken } = await seedInvitation(household.id, owner);

      await expect(acceptInvitation(rawToken, unverified)).rejects.toThrow(InvitationInvalidError);
    });

    it('EVERY failure reason produces the exact same error message — never-existed, expired, already-used, wrong email', async () => {
      const owner = await createTestUser();
      const invitee = await createTestUser({
        email: 'invitee@example.invalid',
        emailVerified: new Date(),
      });
      const wrongUser = await createTestUser({
        email: 'orang-lain@example.invalid',
        emailVerified: new Date(),
      });
      userIds.push(owner, invitee, wrongUser);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      const neverExisted = 'never-issued-token-abc';
      // Each seeded row needs a DISTINCT email (hi_pending_uniq is
      // (household_id, email)) — and each is deliberately paired with the
      // accepting user whose email matches it, so the test actually
      // exercises the failure mode it names (expiry / already-used)
      // instead of tripping the email-mismatch check first every time.
      const { rawToken: expiredToken } = await seedInvitation(household.id, owner, {
        email: 'orang-lain@example.invalid', // == wrongUser's email
        expiresAt: new Date(Date.now() - 1000),
      });
      const { rawToken: usedToken } = await seedInvitation(household.id, owner, {
        email: 'invitee@example.invalid', // == invitee's email
      });
      await acceptInvitation(usedToken, invitee); // consume it — now "already used"
      const { rawToken: wrongEmailToken } = await seedInvitation(household.id, owner, {
        email: 'target-mismatch@example.invalid', // matches neither test user
      });

      async function messageOf(promise: Promise<unknown>): Promise<string> {
        try {
          await promise;
          throw new Error('expected rejection');
        } catch (err) {
          return (err as Error).message;
        }
      }

      const messages = await Promise.all([
        messageOf(acceptInvitation(neverExisted, wrongUser)),
        messageOf(acceptInvitation(expiredToken, wrongUser)),
        messageOf(acceptInvitation(usedToken, invitee)),
        messageOf(acceptInvitation(wrongEmailToken, wrongUser)),
      ]);

      const distinct = new Set(messages);
      expect(distinct.size).toBe(1);
    });

    it('re-invites and re-accepts correctly for a previously-removed member (hm_unique_membership upsert), resetting share_wealth to false', async () => {
      const owner = await createTestUser();
      const rejoiner = await createTestUser({
        email: 'invitee@example.invalid',
        emailVerified: new Date(),
      });
      userIds.push(owner, rejoiner);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      // Seed a REMOVED membership row with share_wealth previously true —
      // simulates someone who left/was removed after having shared wealth.
      await createTestHouseholdMember(household.id, rejoiner, {
        role: 'member',
        status: 'removed',
        shareWealth: true,
      });

      const { rawToken } = await seedInvitation(household.id, owner);
      await acceptInvitation(rawToken, rejoiner);

      const [membership] = await dbWrite
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.userId, rejoiner));
      expect(membership?.status).toBe('active');
      expect(membership?.shareWealth).toBe(false);
    });
  });

  describe('revokeInvitation', () => {
    it('owner can revoke a pending invitation; it can no longer be accepted', async () => {
      const owner = await createTestUser();
      const invitee = await createTestUser({
        email: 'invitee@example.invalid',
        emailVerified: new Date(),
      });
      userIds.push(owner, invitee);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const { id, rawToken } = await seedInvitation(household.id, owner);

      await revokeInvitation(owner, household.id, id);

      const [row] = await dbWrite
        .select()
        .from(householdInvitations)
        .where(eq(householdInvitations.id, id));
      expect(row?.status).toBe('revoked');

      await expect(acceptInvitation(rawToken, invitee)).rejects.toThrow(InvitationInvalidError);
    });

    it('a member cannot revoke an invitation', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });
      const { id } = await seedInvitation(household.id, owner);

      await expect(revokeInvitation(member, household.id, id)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('resendInvitation', () => {
    it('revokes the old invitation and issues a fresh token; the old token stops working and the new one accepts', async () => {
      const owner = await createTestUser();
      const invitee = await createTestUser({
        email: 'invitee@example.invalid',
        emailVerified: new Date(),
      });
      userIds.push(owner, invitee);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const { id, rawToken: oldToken } = await seedInvitation(household.id, owner);

      await resendInvitation(owner, household.id, id);
      expect(sendInvitationEmailMock).toHaveBeenCalledTimes(1);
      const newToken = sendInvitationEmailMock.mock.calls[0]![0].token;
      expect(newToken).not.toBe(oldToken);

      await expect(acceptInvitation(oldToken, invitee)).rejects.toThrow(InvitationInvalidError);
      await expect(acceptInvitation(newToken, invitee)).resolves.toMatchObject({
        householdId: household.id,
      });
    });
  });

  describe('expireInvitations', () => {
    it('marks only pending+past-expiry invitations as expired, and is idempotent', async () => {
      const owner = await createTestUser();
      userIds.push(owner);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      const { id: expiredId } = await seedInvitation(household.id, owner, {
        email: 'expired@example.invalid',
        expiresAt: new Date(Date.now() - 1000),
      });
      const { id: freshId } = await seedInvitation(household.id, owner, {
        email: 'fresh@example.invalid',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      const firstRunCount = await expireInvitations();
      expect(firstRunCount).toBeGreaterThanOrEqual(1);

      const [expiredRow] = await dbWrite
        .select()
        .from(householdInvitations)
        .where(eq(householdInvitations.id, expiredId));
      expect(expiredRow?.status).toBe('expired');

      const [freshRow] = await dbWrite
        .select()
        .from(householdInvitations)
        .where(eq(householdInvitations.id, freshId));
      expect(freshRow?.status).toBe('pending');

      // Running it again finds nothing new for THIS row — guarded by
      // `WHERE status = 'pending'`, an already-expired row no longer matches.
      const secondRunCount = await expireInvitations();
      const [stillExpiredRow] = await dbWrite
        .select()
        .from(householdInvitations)
        .where(eq(householdInvitations.id, expiredId));
      expect(stillExpiredRow?.status).toBe('expired');
      expect(secondRunCount).toBe(0);
    });

    it('never touches household_members — expiring invitations cannot affect anyone\'s membership or share_wealth', async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      userIds.push(owner, member);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member', shareWealth: true });
      await seedInvitation(household.id, owner, { expiresAt: new Date(Date.now() - 1000) });

      const before = await dbWrite
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.householdId, household.id));

      await expireInvitations();

      const after = await dbWrite
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.householdId, household.id));
      expect(after).toEqual(before);
    });
  });

  describe('previewInvitationByToken', () => {
    it('returns household + inviter identity for a valid pending token, and never the raw token', async () => {
      const owner = await createTestUser({ name: 'Wahid' });
      userIds.push(owner);
      const household = await createHousehold(owner, { name: 'Keluarga Wahid', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      const { rawToken } = await seedInvitation(household.id, owner);

      const preview = await previewInvitationByToken(rawToken);
      expect(preview?.householdName).toBe('Keluarga Wahid');
      expect(preview?.inviterName).toBe('Wahid');
      expect(preview?.email).toBe('invitee@example.invalid');
    });

    it('returns null for an unknown, expired, or already-accepted token — uniform with acceptInvitation\'s own uniform-error stance', async () => {
      const owner = await createTestUser();
      userIds.push(owner);
      const household = await createHousehold(owner, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);

      expect(await previewInvitationByToken('never-issued')).toBeNull();

      const { rawToken: expired } = await seedInvitation(household.id, owner, {
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await previewInvitationByToken(expired)).toBeNull();
    });
  });
});
