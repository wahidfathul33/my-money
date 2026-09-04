// @vitest-environment node
/**
 * Unit tests for invitation token generation/hashing —
 * tasks/11-household-membership/todo.md: "Unit test: hash deterministik,
 * token tidak dapat direkonstruksi dari hash." No database, no I/O — pure
 * functions over `node:crypto`.
 */
import { describe, expect, it } from 'vitest';
import { generateInvitationToken, hashToken } from '../invitation-token';

describe('generateInvitationToken', () => {
  it('produces a URL-safe, non-empty token', () => {
    const token = generateInvitationToken();
    expect(token.length).toBeGreaterThan(0);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('never repeats across many calls — 32 random bytes leaves collision probability negligible', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateInvitationToken()));
    expect(tokens.size).toBe(1000);
  });

  it('encodes 32 raw bytes (base64url of 32 bytes is 43 characters, no padding)', () => {
    const token = generateInvitationToken();
    expect(token.length).toBe(43);
    expect(token).not.toContain('=');
  });
});

describe('hashToken', () => {
  it('is deterministic — the same token always hashes to the same value', () => {
    const token = generateInvitationToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('produces a 64-character hex SHA-256 digest', () => {
    const hash = hashToken('some-token-value');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different tokens hash to different values', () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(hashToken(a)).not.toBe(hashToken(b));
  });

  it('the raw token cannot be recovered from the hash — the hash never contains the raw token as a substring, and differs completely from it', () => {
    const token = generateInvitationToken();
    const hash = hashToken(token);
    expect(hash).not.toContain(token);
    expect(hash).not.toBe(token);
    // Avalanche property spot-check: changing one character of the input
    // changes the digest completely (not merely at one position) — a weak
    // "hash" that leaked structure would fail this.
    const tampered = token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a');
    const tamperedHash = hashToken(tampered);
    let differingChars = 0;
    for (let i = 0; i < hash.length; i++) {
      if (hash[i] !== tamperedHash[i]) differingChars++;
    }
    expect(differingChars).toBeGreaterThan(hash.length / 4);
  });
});
