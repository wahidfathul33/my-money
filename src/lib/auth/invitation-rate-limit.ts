/**
 * Invitation rate limiting — docs/12-security-and-auth.md §7:
 *
 *   Mengirim undangan          10 / hari per household, 3 / jam per user
 *   Percobaan token undangan   10 / jam per IP
 *
 * "Batas undangan mencegah household dipakai sebagai saluran spam email;
 * batas token mencegah penebakan brute force." Both are explicitly
 * **fail closed** (docs/12 §7: "fail closed untuk login, undangan, dan
 * ekspor") — unlike the general mutation limiter, which fails open.
 *
 * Same fixed-window, in-memory, single-process design as
 * src/lib/auth/rate-limit.ts (login) and src/lib/api/rate-limit.ts
 * (general) — reuses the latter's `checkRateLimit` primitive rather than a
 * third counter implementation. Not shared across concurrent serverless
 * instances; task 23 is expected to replace all three with a shared store.
 */
import { checkRateLimit, resetRateLimit } from '@/lib/api/rate-limit';
import { AppError } from '@/lib/api/errors';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const HOUSEHOLD_LIMIT = { windowMs: DAY_MS, max: 10 };
const USER_LIMIT = { windowMs: HOUR_MS, max: 3 };
const TOKEN_ATTEMPT_LIMIT = { windowMs: HOUR_MS, max: 10 };

export class InvitationRateLimitedError extends AppError {
  constructor(message = 'Terlalu banyak undangan dikirim. Coba lagi nanti.') {
    super(message);
  }
}

export class InvitationTokenRateLimitedError extends AppError {
  constructor(message = 'Terlalu banyak percobaan. Coba lagi dalam 1 jam.') {
    super(message);
  }
}

/**
 * Checked at the top of `createInvitation` (src/lib/services/invitations.ts),
 * BEFORE any row is written — fail closed means a limit hit must produce
 * zero side effects, not a row that then fails to email. Two independent
 * fixed windows, both must pass: a household can't be used as a spam
 * channel (10/day) even by an owner who personally stays under 3/hour by
 * spreading calls out, and a single owner can't burst through the
 * household's daily budget in one sitting either.
 */
export function assertInviteSendRateLimit(householdId: string, userId: string, now = Date.now()): void {
  const household = checkRateLimit(`invite-send:household:${householdId}`, HOUSEHOLD_LIMIT, now);
  if (!household.allowed) {
    throw new InvitationRateLimitedError('Undangan household ini sudah mencapai batas hari ini.');
  }
  const user = checkRateLimit(`invite-send:user:${userId}`, USER_LIMIT, now);
  if (!user.allowed) {
    throw new InvitationRateLimitedError('Anda sudah mengirim terlalu banyak undangan jam ini.');
  }
}

/**
 * Checked wherever a token is looked up from user input — accepting an
 * invitation (`acceptInvitationAction`) and previewing one
 * (`/invite/[token]`'s page load) both count against the same per-IP
 * window, so a script trying tokens either by submitting or just loading
 * the page hits the same ceiling either way.
 */
export function assertInviteTokenRateLimit(ip: string, now = Date.now()): void {
  const result = checkRateLimit(`invite-token:${ip}`, TOKEN_ATTEMPT_LIMIT, now);
  if (!result.allowed) {
    throw new InvitationTokenRateLimitedError();
  }
}

/** Test-only: clears rate-limit state so tests don't leak between cases.
 * Delegates to the shared buckets `checkRateLimit` itself owns — there's no
 * separate state here to reset. */
export function resetInvitationRateLimits(): void {
  resetRateLimit();
}
