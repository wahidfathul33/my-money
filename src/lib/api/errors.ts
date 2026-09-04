/**
 * Domain error classes — docs/11-tech-architecture.md §6, docs/12-security-and-auth.md.
 *
 * Errors are classes, never bare strings, so `requireUser()`, services, and
 * tests can all discriminate on `instanceof` instead of parsing messages.
 *
 * `NotFoundError` vs `ForbiddenError` is a deliberate distinction, not a
 * style choice: when a query is scoped to the caller (`ownedBy` /
 * `requireHouseholdMember`) and finds nothing, the right response is
 * "not found" — never confirming to the caller that the record exists but
 * belongs to someone else. See docs/12 §3 and H2 in its threat table.
 */

export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** No session at all. Thrown by `requireUser()` — see src/lib/auth/require-user.ts. */
export class UnauthenticatedError extends AppError {
  constructor(message = 'Anda harus masuk untuk melakukan ini') {
    super(message);
  }
}

/** Session exists, but the actor isn't allowed to perform this action. */
export class ForbiddenError extends AppError {
  constructor(message = 'Anda tidak memiliki izin untuk melakukan ini') {
    super(message);
  }
}

/** Record doesn't exist, OR exists but isn't scoped to the caller — same response either way. */
export class NotFoundError extends AppError {
  constructor(message = 'Data tidak ditemukan') {
    super(message);
  }
}

/** Input failed validation at the Server Action / route handler boundary. */
export class ValidationError extends AppError {
  readonly fields: Record<string, string[]>;

  constructor(fields: Record<string, string[]>) {
    super('Validasi gagal');
    this.fields = fields;
  }
}

/**
 * tasks/11-household-membership — `ALREADY_MEMBER`. Thrown by
 * `createInvitation` (src/lib/services/invitations.ts) when the invited
 * email already belongs to an active member: "Mengundang email yang sudah
 * menjadi anggota aktif ditolak."
 */
export class AlreadyMemberError extends AppError {
  constructor(message = 'Email ini sudah menjadi anggota aktif keluarga') {
    super(message);
  }
}

/**
 * tasks/11-household-membership — `INVITATION_INVALID`. The ONE error class
 * covering every invitation-acceptance failure — never-existed, expired,
 * already accepted/revoked, and verified-email mismatch all throw this SAME
 * class with this SAME message. docs/12-security-and-auth.md §5 is explicit
 * that a more specific message "mengonfirmasi bahwa sebuah token pernah
 * sah" to whoever is probing it — see acceptInvitation's doc comment in
 * src/lib/services/invitations.ts for the full enumeration of paths that
 * throw this.
 */
export class InvitationInvalidError extends AppError {
  constructor(message = 'Undangan ini tidak valid atau sudah tidak berlaku') {
    super(message);
  }
}

/**
 * tasks/11-household-membership — `LAST_OWNER`. Thrown by `leaveHousehold`
 * (src/lib/services/memberships.ts) when the caller is the household's sole
 * `owner` — `hm_single_owner_idx` (src/lib/db/schema/households.ts) permits
 * at most one active owner, so letting them leave unconditionally would
 * leave the household with zero. `transferOwnership` first is the only way
 * out.
 */
export class LastOwnerError extends AppError {
  constructor(message = 'Alihkan kepemilikan ke anggota lain sebelum keluar dari keluarga') {
    super(message);
  }
}

/**
 * tasks/11-household-membership. `removeMember` rejects an owner targeting
 * their own membership — the "keluarkan anggota" flow assumes the target is
 * someone else; a self-removal that also happened to be the sole owner
 * would violate the same invariant `LastOwnerError` protects, and even for
 * a non-owner it's simply the wrong flow ("Keluar dari keluarga" is).
 */
export class CannotRemoveSelfError extends AppError {
  constructor(message = 'Gunakan "Keluar dari keluarga" untuk mengeluarkan diri sendiri') {
    super(message);
  }
}
