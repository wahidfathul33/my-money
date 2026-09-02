// @vitest-environment node
/**
 * Unit tests for requireUser() — tasks/04-authentication/spec.md acceptance:
 * "`requireUser()` melempar `UnauthenticatedError` tanpa sesi."
 *
 * `@/lib/auth` (the NextAuth() instance) is mocked so this stays a pure unit
 * test of the guard logic, independent of cookies/DB — that coverage lives
 * in the e2e suite (e2e/auth.spec.ts) and the cross-user isolation
 * integration tests.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnauthenticatedError } from '@/lib/api/errors';

const authMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

describe('requireUser', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('throws UnauthenticatedError when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const { requireUser } = await import('../require-user');

    await expect(requireUser()).rejects.toThrow(UnauthenticatedError);
  });

  it('throws UnauthenticatedError when the session has no user id', async () => {
    authMock.mockResolvedValue({ user: { email: 'a@b.com' } });
    const { requireUser } = await import('../require-user');

    await expect(requireUser()).rejects.toThrow(UnauthenticatedError);
  });

  it('returns the current user when a session exists', async () => {
    authMock.mockResolvedValue({
      user: { id: 'user-1', email: 'a@b.com', name: 'Alice', image: null },
    });
    const { requireUser } = await import('../require-user');

    await expect(requireUser()).resolves.toEqual({
      id: 'user-1',
      email: 'a@b.com',
      name: 'Alice',
      image: null,
    });
  });

  it('defaults missing name/image to null and missing email to an empty string', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    const { requireUser } = await import('../require-user');

    await expect(requireUser()).resolves.toEqual({
      id: 'user-1',
      email: '',
      name: null,
      image: null,
    });
  });
});
