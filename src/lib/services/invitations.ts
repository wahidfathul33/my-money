/**
 * Household invitations service — dbWrite transactions live here, per
 * docs/11-tech-architecture.md §3 (only src/lib/services/** may import
 * `@/lib/db/write`). Every write calls `requireHouseholdMember` INSIDE its
 * own transaction, same convention as src/lib/services/households.ts.
 *
 * This is the highest-stakes file in task 11 — docs/12-security-and-auth.md
 * §5's invitation row (H3) and its "Ancaman Khusus Household" table exist
 * almost entirely to describe what this file has to get right:
 *
 *   - The raw token is generated in src/lib/auth/invitation-token.ts, used
 *     ONCE here to compute a hash, and handed to src/lib/email/invitation.ts
 *     to embed in the outgoing email. It is NEVER assigned to a variable
 *     that outlives this function, NEVER logged, and NEVER stored — only
 *     `hashToken(raw)` reaches `household_invitations.token_hash`.
 *   - `acceptInvitation`'s one-time-use guard is a single `UPDATE ...
 *     WHERE status = 'pending'` in the SAME transaction that inserts the
 *     `household_members` row — see that function's doc comment for why a
 *     separate SELECT-then-UPDATE would be a race.
 *   - Every failure path in `acceptInvitation` — token never existed, wrong
 *     hash, expired, already accepted, revoked, wrong/unverified email —
 *     throws the exact same `InvitationInvalidError` with the exact same
 *     message. A more specific message would confirm to whoever is probing
 *     a token that it was (or wasn't) once valid.
 */
import { and, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { dbRead } from '@/lib/db/read';
import { households, householdInvitations, householdMembers, users } from '@/lib/db/schema';
import { requireHouseholdMember } from '@/lib/auth/require-household';
import { generateInvitationToken, hashToken } from '@/lib/auth/invitation-token';
import { assertInviteSendRateLimit } from '@/lib/auth/invitation-rate-limit';
import { sendInvitationEmail } from '@/lib/email/invitation';
import { AlreadyMemberError, InvitationInvalidError, NotFoundError, ValidationError } from '@/lib/api/errors';
import type { TransactionClient } from '@/lib/db';

export type HouseholdInvitation = typeof householdInvitations.$inferSelect;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Postgres unique_violation — see https://www.postgresql.org/docs/current/errcodes-appendix.html */
const PG_UNIQUE_VIOLATION = '23505';

/** Same shape as src/lib/services/categories.ts's identically-named helpers
 * — Drizzle wraps the raw pg-wire error (which carries `.code`/`.constraint`)
 * in a `DrizzleQueryError`, exposed as `.cause`. */
function pgCause(err: unknown): Record<string, unknown> | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const cause = 'cause' in err ? (err as { cause: unknown }).cause : undefined;
  if (typeof cause === 'object' && cause !== null) return cause as Record<string, unknown>;
  return err as Record<string, unknown>;
}

function isUniqueViolation(err: unknown, constraintName: string): boolean {
  const cause = pgCause(err);
  if (!cause) return false;
  return (
    'code' in cause &&
    cause.code === PG_UNIQUE_VIOLATION &&
    'constraint' in cause &&
    cause.constraint === constraintName
  );
}

async function resolveInviterName(tx: TransactionClient, userId: string): Promise<string> {
  const [inviter] = await tx
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return inviter?.name?.trim() || inviter?.email || 'Seseorang';
}

async function assertEmailNotAlreadyActiveMember(
  tx: TransactionClient,
  householdId: string,
  email: string,
): Promise<void> {
  const [existing] = await tx
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.status, 'active'),
        eq(sql<string>`lower(${users.email})`, email),
      ),
    )
    .limit(1);
  if (existing) throw new AlreadyMemberError();
}

export interface CreateInvitationInput {
  householdId: string;
  email: string;
}

/**
 * Owner-only (`requireHouseholdMember(..., requireOwner = true)`). Always
 * creates a `role = 'member'` row — there is no role parameter anywhere in
 * this function's signature, deliberately, per docs/03 §4.3: "Undangan
 * selalu membuat anggota berperan member."
 *
 * Rate-limited BEFORE any row is written (docs/12 §7, fail closed): 10/day
 * per household and 3/hour per inviting user, both checked inside the same
 * transaction as the owner check so a rate-limited call has zero side
 * effects, not a half-created invitation.
 *
 * `hi_pending_uniq` (a second active invite to the same household+email) is
 * caught and turned into a `ValidationError` — a normal, expected user
 * mistake ("I already invited them"), not a crash. Inviting an email that's
 * already an active member is rejected up front by
 * `assertEmailNotAlreadyActiveMember`, before the insert is even attempted.
 *
 * The email is sent AFTER the transaction commits — nodemailer's network
 * round trip has no business holding a DB transaction open, and if it
 * fails, the invitation row still exists (the owner's "Kirim ulang" —
 * `resendInvitation` — recovers from that without the raw token, which by
 * design was never persisted).
 */
export async function createInvitation(
  userId: string,
  input: CreateInvitationInput,
): Promise<{ invitation: HouseholdInvitation }> {
  const email = input.email.trim().toLowerCase();
  const rawToken = generateInvitationToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

  const { invitation, householdName, inviterName } = await dbWrite.transaction(async (tx) => {
    await requireHouseholdMember(tx, userId, input.householdId, /* requireOwner */ true);
    assertInviteSendRateLimit(input.householdId, userId);

    const [household] = await tx
      .select({ name: households.name })
      .from(households)
      .where(eq(households.id, input.householdId))
      .limit(1);
    if (!household) throw new NotFoundError('Household tidak ditemukan');

    await assertEmailNotAlreadyActiveMember(tx, input.householdId, email);

    let created: HouseholdInvitation | undefined;
    try {
      [created] = await tx
        .insert(householdInvitations)
        .values({
          id: uuidv7(),
          householdId: input.householdId,
          email,
          role: 'member', // ALWAYS — never accepted as input, see doc comment.
          invitedBy: userId,
          tokenHash,
          status: 'pending',
          expiresAt,
        })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err, 'hi_pending_uniq')) {
        throw new ValidationError({
          email: ['Undangan yang belum direspons sudah ada untuk email ini'],
        });
      }
      throw err;
    }
    if (!created) throw new Error('Insert undangan tidak mengembalikan baris');

    const inviterName = await resolveInviterName(tx, userId);
    return { invitation: created, householdName: household.name, inviterName };
  });

  await sendInvitationEmail({ to: email, householdName, inviterName, token: rawToken, expiresAt });

  return { invitation };
}

/** Owner-only. Guarded by `WHERE status = 'pending'` — revoking an
 * already-accepted/expired/revoked invitation finds zero rows and reports
 * `NotFoundError`, same as every other "this either never existed or isn't
 * yours to act on" case in this codebase. */
export async function revokeInvitation(
  userId: string,
  householdId: string,
  invitationId: string,
): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    await requireHouseholdMember(tx, userId, householdId, /* requireOwner */ true);

    const [revoked] = await tx
      .update(householdInvitations)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(householdInvitations.id, invitationId),
          eq(householdInvitations.householdId, householdId),
          eq(householdInvitations.status, 'pending'),
        ),
      )
      .returning();
    if (!revoked) throw new NotFoundError('Undangan tidak ditemukan');
  });
}

/**
 * "Kirim ulang" — because only the HASH of the original token was ever
 * persisted, the raw token from the first email is unrecoverable by
 * construction. Resending therefore means: revoke the existing pending
 * invitation (guarded the same way `revokeInvitation` is) and create a
 * brand new one with a fresh token, fresh 7-day expiry, and a fresh email —
 * all inside one transaction, so a failure partway through never leaves the
 * old invitation revoked with no replacement. Counts against the same
 * send-rate limits as a first invitation; from the spam/abuse angle a
 * resend is indistinguishable from a new send.
 */
export async function resendInvitation(
  userId: string,
  householdId: string,
  invitationId: string,
): Promise<void> {
  const rawToken = generateInvitationToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

  const { email, householdName, inviterName } = await dbWrite.transaction(async (tx) => {
    await requireHouseholdMember(tx, userId, householdId, /* requireOwner */ true);
    assertInviteSendRateLimit(householdId, userId);

    const [old] = await tx
      .update(householdInvitations)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(householdInvitations.id, invitationId),
          eq(householdInvitations.householdId, householdId),
          eq(householdInvitations.status, 'pending'),
        ),
      )
      .returning();
    if (!old) throw new NotFoundError('Undangan tidak ditemukan');

    const [household] = await tx
      .select({ name: households.name })
      .from(households)
      .where(eq(households.id, householdId))
      .limit(1);
    if (!household) throw new NotFoundError('Household tidak ditemukan');

    await tx.insert(householdInvitations).values({
      id: uuidv7(),
      householdId,
      email: old.email,
      role: 'member',
      invitedBy: userId,
      tokenHash,
      status: 'pending',
      expiresAt,
    });

    const inviterName = await resolveInviterName(tx, userId);
    return { email: old.email, householdName: household.name, inviterName };
  });

  await sendInvitationEmail({ to: email, householdName, inviterName, token: rawToken, expiresAt });
}

/**
 * Accepts an invitation on behalf of `userId` — the single most
 * security-sensitive function in this task. Every failure path throws
 * `InvitationInvalidError` with the SAME message, by design (docs/12 §5,
 * H3/H7): token hash not found, invitation not `pending`, invitation
 * expired, and the accepting user's email not matching (or not verified)
 * all look identical from the outside.
 *
 * One-time-use is enforced by `UPDATE ... WHERE status = 'pending' AND
 * expires_at > now()` — the SAME statement that transitions the row, in the
 * SAME transaction that then inserts/updates `household_members`. Two
 * concurrent accept attempts for the same token both reach this UPDATE; at
 * most one can see `status = 'pending'` still true (Postgres serializes
 * concurrent UPDATEs to the same row), so the second always finds zero rows
 * and throws — there's no SELECT-then-UPDATE window for a race to land in.
 *
 * `onConflictDoUpdate` on `household_members` (not a plain `insert`)
 * handles the "previously removed, invited again" case: `hm_unique_membership`
 * is a FULL unique index on `(household_id, user_id)`, not partial, so a
 * `removed` row from a past membership already occupies that key.
 * Re-accepting resets `share_wealth` to `false` and `role` to `member` —
 * privacy starts over on every join, per docs/03 §5 "Default: semua data
 * finansial privat."
 */
export async function acceptInvitation(
  token: string,
  userId: string,
): Promise<{ householdId: string }> {
  const tokenHash = hashToken(token);

  return dbWrite.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(householdInvitations)
      .where(eq(householdInvitations.tokenHash, tokenHash))
      .limit(1);
    if (!invitation) throw new InvitationInvalidError();

    const [accepter] = await tx
      .select({ email: users.email, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!accepter) throw new InvitationInvalidError();

    const emailMatches =
      accepter.emailVerified !== null && accepter.email.toLowerCase() === invitation.email;
    if (!emailMatches) throw new InvitationInvalidError();

    const now = new Date();
    const [accepted] = await tx
      .update(householdInvitations)
      .set({ status: 'accepted', acceptedBy: userId, acceptedAt: now })
      .where(
        and(
          eq(householdInvitations.id, invitation.id),
          eq(householdInvitations.status, 'pending'),
          sql`${householdInvitations.expiresAt} > ${now}`,
        ),
      )
      .returning();
    if (!accepted) throw new InvitationInvalidError();

    await tx
      .insert(householdMembers)
      .values({
        id: uuidv7(),
        householdId: accepted.householdId,
        userId,
        role: 'member',
        status: 'active',
        shareWealth: false,
        joinedAt: now,
        removedAt: null,
      })
      .onConflictDoUpdate({
        target: [householdMembers.householdId, householdMembers.userId],
        set: {
          role: 'member',
          status: 'active',
          shareWealth: false,
          joinedAt: now,
          removedAt: null,
          updatedAt: now,
        },
      });

    return { householdId: accepted.householdId };
  });
}

/**
 * Cron-only (`/api/cron/expire-invitations`) — marks every `pending`
 * invitation past its `expires_at` as `expired`. Guarded by the same
 * `WHERE status = 'pending'` discipline as everything else in this file, so
 * running it twice (or a thousand times) in a row does nothing extra the
 * second time — an already-`expired` row no longer matches the guard.
 * Touches ONLY `household_invitations` — no ledger entry, no wallet, no
 * transaction table anywhere in this function, so re-running it can never
 * corrupt anyone's balance (spec.md's explicit acceptance criterion).
 */
export async function expireInvitations(now = new Date()): Promise<number> {
  const expired = await dbWrite
    .update(householdInvitations)
    .set({ status: 'expired' })
    .where(and(eq(householdInvitations.status, 'pending'), sql`${householdInvitations.expiresAt} <= ${now}`))
    .returning({ id: householdInvitations.id });
  return expired.length;
}

export interface InvitationPreview {
  householdName: string;
  inviterName: string;
  email: string;
  expiresAt: Date;
}

/**
 * Public, unauthenticated read for `/invite/[token]` — the landing page has
 * to say SOMETHING before the visitor signs in. Returns `null` for every
 * failure reason (not found, expired, already used, revoked) so the page
 * can render the SAME "undangan tidak berlaku" state regardless of cause,
 * same uniform-message discipline as `acceptInvitation`. Read-only —
 * `dbRead`, not `dbWrite` — and does not consume the one-time-use
 * transition; only `acceptInvitation` does that.
 */
export async function previewInvitationByToken(token: string): Promise<InvitationPreview | null> {
  const tokenHash = hashToken(token);
  const [row] = await dbRead
    .select({
      email: householdInvitations.email,
      status: householdInvitations.status,
      expiresAt: householdInvitations.expiresAt,
      householdName: households.name,
      inviterName: users.name,
      inviterEmail: users.email,
    })
    .from(householdInvitations)
    .innerJoin(households, eq(households.id, householdInvitations.householdId))
    .innerJoin(users, eq(users.id, householdInvitations.invitedBy))
    .where(eq(householdInvitations.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  if (row.status !== 'pending') return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  return {
    householdName: row.householdName,
    inviterName: row.inviterName?.trim() || row.inviterEmail,
    email: row.email,
    expiresAt: row.expiresAt,
  };
}
