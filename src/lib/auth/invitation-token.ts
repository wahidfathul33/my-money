/**
 * Invitation token generation & hashing — docs/12-security-and-auth.md §5,
 * threat H3: "Token ter-hash; sekali pakai lewat `WHERE status='pending'`
 * dalam transaction; terikat email terverifikasi."
 *
 * The raw token is generated here, handed to the caller ONCE (to embed in
 * the invitation email — src/lib/email/invitation.ts), and never persisted.
 * `src/lib/db/schema/households.ts`'s `household_invitations.token_hash`
 * column stores only `hashToken(raw)` — the SHA-256 digest. Reversing a
 * SHA-256 digest back to the 32 random bytes that produced it is
 * computationally infeasible, so a leaked database (without the emails
 * already sent) reveals no usable tokens.
 */
import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** Cryptographically random token — 32 bytes, base64url-encoded (43 chars,
 * URL-safe with no padding) so it drops straight into `/invite/[token]`
 * without escaping. */
export function generateInvitationToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** SHA-256 of the raw token, hex-encoded — the only form ever written to
 * `household_invitations.token_hash`. Deterministic: the same raw token
 * always hashes to the same value, which is what lets `acceptInvitation`
 * look a row up by `hashToken(suppliedToken)` without ever storing the
 * plaintext. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
