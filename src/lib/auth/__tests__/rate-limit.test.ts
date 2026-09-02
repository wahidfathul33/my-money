// @vitest-environment node
/**
 * Unit tests for the login rate limiter — tasks/04-authentication/spec.md
 * acceptance: "Rate limit login: 5 percobaan / 15 menit per IP."
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { checkLoginRateLimit, getClientIp, resetLoginRateLimit } from '../rate-limit';

describe('checkLoginRateLimit', () => {
  beforeEach(() => {
    resetLoginRateLimit();
  });

  it('allows the first 5 attempts from the same key within the window', () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      expect(checkLoginRateLimit('1.2.3.4', now).allowed).toBe(true);
    }
  });

  it('blocks the 6th attempt within the same 15-minute window', () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      checkLoginRateLimit('1.2.3.4', now);
    }
    expect(checkLoginRateLimit('1.2.3.4', now).allowed).toBe(false);
  });

  it('tracks each key independently', () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      checkLoginRateLimit('1.2.3.4', now);
    }
    expect(checkLoginRateLimit('5.6.7.8', now).allowed).toBe(true);
  });

  it('resets after the 15-minute window elapses', () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      checkLoginRateLimit('1.2.3.4', now);
    }
    expect(checkLoginRateLimit('1.2.3.4', now).allowed).toBe(false);

    const later = now + 15 * 60 * 1000 + 1;
    expect(checkLoginRateLimit('1.2.3.4', later).allowed).toBe(true);
  });
});

describe('getClientIp', () => {
  it('reads the first entry of x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '9.9.9.9, 1.1.1.1' });
    expect(getClientIp(headers)).toBe('9.9.9.9');
  });

  it('falls back to x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': '8.8.8.8' });
    expect(getClientIp(headers)).toBe('8.8.8.8');
  });

  it('falls back to "unknown" when neither header is present', () => {
    const headers = new Headers();
    expect(getClientIp(headers)).toBe('unknown');
  });
});
