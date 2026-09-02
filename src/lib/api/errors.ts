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
