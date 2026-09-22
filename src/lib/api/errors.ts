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
import { formatIDR } from '@/lib/finance/money';

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

/**
 * tasks/13-transfers-member — `WALLET_NOT_ELIGIBLE`. Thrown by
 * `createMemberTransfer` (src/lib/services/transfers.ts) when `toWalletId`
 * fails docs/12-security-and-auth.md §4.3's eligibility check — doesn't
 * belong to the counterparty, isn't active, is `exclude_from_household`, or
 * is a credit card. Covers "penerima tanpa dompet layak" too: an invalid or
 * stale `toWalletId` fails the exact same check.
 *
 * Deliberately names the counterparty — NOT a general household-error
 * exception (docs/12 §5 H9 "pesan error household tidak pernah memuat nama
 * anggota" governs error paths that could leak a stranger's name; this one
 * can't, because the caller only ever reaches it after already picking that
 * exact person from the eligible-target picker, spec.md's "Penerima tanpa
 * dompet layak → ditolak dengan pesan menyebut namanya").
 */
export class WalletNotEligibleError extends AppError {
  constructor(counterpartyName: string) {
    super(`Dompet ini tidak dapat dipakai untuk mengirim ke ${counterpartyName}`);
  }
}

/**
 * tasks/18-debts-receivables — `OVERPAYMENT`. Thrown by
 * `recordDebtPayment`/`recordReceivablePayment` (src/lib/services/obligations.ts)
 * when a payment's amount exceeds `remaining_amount`, checked against a row
 * locked with `SELECT ... FOR UPDATE` inside the same transaction as the
 * write — docs/06-api-contracts.md §8's own example ends with exactly
 * `throw new OverpaymentError(debt.remainingAmount)`.
 *
 * Message wording follows docs/08-copywriting.md §5.7's exact example
 * verbatim — "Pembayaran melebihi sisa hutang. Sisa Rp2.500.000." (no colon
 * after "Sisa") — not docs/06-api-contracts.md §9's own illustrative table
 * row for the same error ("Sisa: {sisa}."), since docs/08's own header is
 * explicit that it is authoritative for every piece of UI text and wins
 * over any other doc's illustrative wording wherever the two disagree.
 */
export class OverpaymentError extends AppError {
  constructor(remainingAmount: bigint, kind: 'hutang' | 'piutang' = 'hutang') {
    super(`Pembayaran melebihi sisa ${kind}. Sisa ${formatIDR(remainingAmount)}.`);
  }
}

/**
 * tasks/22-settings-sharing-pwa — `OWNER_BLOCKED_DELETION`. Thrown by
 * `deleteAccount` (src/lib/services/settings.ts) when the caller is still
 * `owner` of at least one ACTIVE, non-archived household —
 * docs/12-security-and-auth.md §11: "memerlukan pengalihan kepemilikan atau
 * pengarsipan household lebih dulu. Aplikasi menyatakannya jelas dengan
 * tautan tindakan, bukan sekadar penolakan." Carries the blocking
 * household's id/name so the UI can name it and link straight to
 * `/household/{id}/settings` (transfer ownership / archive) — same
 * "name the specific thing, don't just refuse" discipline as
 * `WalletNotEligibleError`.
 */
export class OwnerBlockedDeletionError extends AppError {
  readonly householdId: string;
  readonly householdName: string;

  constructor(householdId: string, householdName: string) {
    super(`Alihkan kepemilikan atau arsipkan "${householdName}" sebelum menghapus akun`);
    this.householdId = householdId;
    this.householdName = householdName;
  }
}
