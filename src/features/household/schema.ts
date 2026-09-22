/**
 * Zod schemas for the household Server Actions (src/features/household/actions.ts).
 * Structural validation only — role/ownership rules live in
 * src/lib/services/households.ts and src/lib/auth/require-household.ts,
 * same split as src/features/wallets/schema.ts.
 */
import { z } from 'zod';
import { isValidTimeZone } from '@/lib/date/timezone';

/** docs/12-security-and-auth.md §6: "Nama household berisi markup — panjang
 * dibatasi 60 karakter." Matches `households_name_not_blank`
 * (src/lib/db/schema/households.ts) on the lower bound. */
export const householdNameSchema = z
  .string()
  .trim()
  .min(1, 'Nama keluarga wajib diisi')
  .max(60, 'Nama keluarga terlalu panjang');

export const timezoneSchema = z
  .string()
  .trim()
  .min(1, 'Zona waktu wajib diisi')
  .refine(isValidTimeZone, 'Zona waktu tidak valid');

export const createHouseholdSchema = z.object({
  name: householdNameSchema,
  timezone: timezoneSchema,
});

export const updateHouseholdSchema = z.object({
  householdId: z.uuid('ID keluarga tidak valid'),
  name: householdNameSchema,
  timezone: timezoneSchema,
});

export const householdIdSchema = z.object({
  householdId: z.uuid('ID keluarga tidak valid'),
});

export type CreateHouseholdFormInput = z.infer<typeof createHouseholdSchema>;
export type UpdateHouseholdFormInput = z.infer<typeof updateHouseholdSchema>;

/**
 * tasks/11-household-membership. Lowercased + trimmed here (not just at the
 * service layer) so the value a `ValidationError` echoes back to the form
 * matches what actually gets compared against `household_invitations.email`
 * (`hi_email_lower` CHECK, src/lib/db/schema/households.ts) and against
 * `users.email` in `acceptInvitation`.
 */
export const invitationEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email wajib diisi')
  .email('Masukkan alamat email yang valid')
  .max(254, 'Email terlalu panjang');

export const inviteMemberSchema = z.object({
  householdId: z.uuid('ID keluarga tidak valid'),
  email: invitationEmailSchema,
});

export const invitationIdSchema = z.object({
  householdId: z.uuid('ID keluarga tidak valid'),
  invitationId: z.uuid('ID undangan tidak valid'),
});

export const acceptInvitationSchema = z.object({
  // Base64url, 32 raw bytes — see src/lib/auth/invitation-token.ts. Not a
  // UUID; validated only for shape (non-empty, no path-breaking characters)
  // since the real check is the database lookup by hash, which either
  // finds a row or doesn't.
  token: z
    .string()
    .trim()
    .min(1, 'Token tidak valid')
    .regex(/^[A-Za-z0-9_-]+$/, 'Token tidak valid'),
});

/** docs/03 §4.4: "keep" (default) preserves historical household reports;
 * "release" clears `household_id` on the leaving/removed user's own tagged
 * transactions. No third option — see src/lib/services/memberships.ts's
 * `revokeSharingFor`. */
export const transactionTagChoiceSchema = z.enum(['keep', 'release']);

export const removeMemberSchema = z.object({
  householdId: z.uuid('ID keluarga tidak valid'),
  userId: z.uuid('ID anggota tidak valid'),
  tagChoice: transactionTagChoiceSchema,
});

export const leaveHouseholdSchema = z.object({
  householdId: z.uuid('ID keluarga tidak valid'),
  tagChoice: transactionTagChoiceSchema,
});

export const transferOwnershipSchema = z.object({
  householdId: z.uuid('ID keluarga tidak valid'),
  newOwnerUserId: z.uuid('ID anggota tidak valid'),
});
