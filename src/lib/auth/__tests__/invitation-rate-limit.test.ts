// @vitest-environment node
/**
 * Unit tests for invitation rate limiting — docs/12-security-and-auth.md §7:
 * "Mengirim undangan: 10/hari per household, 3/jam per user" and
 * "Percobaan token undangan: 10/jam per IP", both fail closed. Same
 * `now`-injection pattern as src/lib/auth/__tests__/rate-limit.test.ts (the
 * login limiter) so window-boundary behavior is testable without real
 * clock waits.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  assertInviteSendRateLimit,
  assertInviteTokenRateLimit,
  InvitationRateLimitedError,
  InvitationTokenRateLimitedError,
  resetInvitationRateLimits,
} from '../invitation-rate-limit';

describe('assertInviteSendRateLimit', () => {
  beforeEach(() => {
    resetInvitationRateLimits();
  });

  it('allows the first 3 sends from the same user within an hour', () => {
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      expect(() => assertInviteSendRateLimit('household-1', 'user-1', now)).not.toThrow();
    }
  });

  it('blocks the 4th send from the same user within the same hour — user limit is 3/hour', () => {
    const now = Date.now();
    for (let i = 0; i < 3; i++) assertInviteSendRateLimit('household-1', 'user-1', now);
    expect(() => assertInviteSendRateLimit('household-1', 'user-1', now)).toThrow(
      InvitationRateLimitedError,
    );
  });

  it('tracks each inviting user independently, even for the same household', () => {
    const now = Date.now();
    for (let i = 0; i < 3; i++) assertInviteSendRateLimit('household-1', 'user-1', now);
    // A different user in the same household still has their own 3/hour budget.
    expect(() => assertInviteSendRateLimit('household-1', 'user-2', now)).not.toThrow();
  });

  it('blocks the 11th send to the same household within a day — household limit is 10/day, spread across users', () => {
    const now = Date.now();
    // 10 different users, one send each, all within the household's daily
    // budget — user-level 3/hour never trips since each user only sends once.
    for (let i = 0; i < 10; i++) {
      assertInviteSendRateLimit('household-shared', `user-${i}`, now);
    }
    expect(() => assertInviteSendRateLimit('household-shared', 'user-10', now)).toThrow(
      InvitationRateLimitedError,
    );
  });

  it('resets the user window after an hour elapses', () => {
    const now = Date.now();
    for (let i = 0; i < 3; i++) assertInviteSendRateLimit('household-2', 'user-3', now);
    expect(() => assertInviteSendRateLimit('household-2', 'user-3', now)).toThrow();

    const later = now + 60 * 60 * 1000 + 1;
    expect(() => assertInviteSendRateLimit('household-2', 'user-3', later)).not.toThrow();
  });
});

describe('assertInviteTokenRateLimit', () => {
  beforeEach(() => {
    resetInvitationRateLimits();
  });

  it('allows the first 10 attempts from the same IP within an hour', () => {
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      expect(() => assertInviteTokenRateLimit('203.0.113.5', now)).not.toThrow();
    }
  });

  it('blocks the 11th attempt within the same hour', () => {
    const now = Date.now();
    for (let i = 0; i < 10; i++) assertInviteTokenRateLimit('203.0.113.5', now);
    expect(() => assertInviteTokenRateLimit('203.0.113.5', now)).toThrow(
      InvitationTokenRateLimitedError,
    );
  });

  it('tracks each IP independently', () => {
    const now = Date.now();
    for (let i = 0; i < 10; i++) assertInviteTokenRateLimit('203.0.113.5', now);
    expect(() => assertInviteTokenRateLimit('198.51.100.9', now)).not.toThrow();
  });
});
