// @vitest-environment node
/**
 * Unit tests for the generic route-handler rate limiter —
 * tasks/09-transaction-history/todo.md "Rate limit pencarian: 30 / menit".
 * Same shape as src/lib/auth/__tests__/rate-limit.test.ts (the login-only
 * limiter this one generalizes).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { checkRateLimit, resetRateLimit } from '../rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    resetRateLimit();
  });

  const opts = { windowMs: 60_000, max: 30 };

  it('allows the first `max` calls from the same key within the window', () => {
    const now = Date.now();
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit('search:user-1', opts, now).allowed).toBe(true);
    }
  });

  it('blocks the call after `max` within the same window', () => {
    const now = Date.now();
    for (let i = 0; i < 30; i++) checkRateLimit('search:user-1', opts, now);
    expect(checkRateLimit('search:user-1', opts, now).allowed).toBe(false);
  });

  it('tracks each key independently', () => {
    const now = Date.now();
    for (let i = 0; i < 30; i++) checkRateLimit('search:user-1', opts, now);
    expect(checkRateLimit('search:user-2', opts, now).allowed).toBe(true);
  });

  it('resets after the window elapses', () => {
    const now = Date.now();
    for (let i = 0; i < 30; i++) checkRateLimit('search:user-1', opts, now);
    expect(checkRateLimit('search:user-1', opts, now).allowed).toBe(false);

    const later = now + opts.windowMs + 1;
    expect(checkRateLimit('search:user-1', opts, later).allowed).toBe(true);
  });

  it('reports remaining calls accurately', () => {
    const now = Date.now();
    expect(checkRateLimit('k', opts, now).remaining).toBe(29);
    expect(checkRateLimit('k', opts, now).remaining).toBe(28);
  });
});
