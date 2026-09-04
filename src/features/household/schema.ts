/**
 * Zod schemas for the household Server Actions (src/features/household/actions.ts).
 * Structural validation only — role/ownership rules live in
 * src/lib/services/households.ts and src/lib/auth/require-household.ts,
 * same split as src/features/wallets/schema.ts.
 */
import { z } from 'zod';

/** docs/12-security-and-auth.md §6: "Nama household berisi markup — panjang
 * dibatasi 60 karakter." Matches `households_name_not_blank`
 * (src/lib/db/schema/households.ts) on the lower bound. */
export const householdNameSchema = z
  .string()
  .trim()
  .min(1, 'Nama keluarga wajib diisi')
  .max(60, 'Nama keluarga terlalu panjang');

function isValidTimeZone(tz: string): boolean {
  try {
    // Throws RangeError for anything that isn't a real IANA zone name.
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

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
