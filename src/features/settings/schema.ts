import { z } from 'zod';
import { isValidTimeZone } from '@/lib/date/timezone';

export const updatePreferencesSchema = z.object({
  countReceivablesAsAsset: z.boolean(),
  timezone: z
    .string()
    .trim()
    .min(1, 'Zona waktu wajib diisi')
    .refine(isValidTimeZone, 'Zona waktu tidak valid'),
  defaultWalletId: z.uuid('Dompet tidak valid').nullable(),
});

export type UpdatePreferencesActionInput = z.infer<typeof updatePreferencesSchema>;

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nama wajib diisi')
    .max(80, 'Nama terlalu panjang'),
});

export type UpdateProfileActionInput = z.infer<typeof updateProfileSchema>;

/** `/settings/data`'s "type your email to confirm" dialog — structural
 * validation only (non-empty); the actual "does this match the caller's
 * OWN email" comparison happens in the Server Action, which knows the
 * caller's real email from `requireUser()`, never from client input. */
export const deleteAccountSchema = z.object({
  confirmEmail: z.string().trim().min(1, 'Ketik email Anda untuk konfirmasi'),
});

export type DeleteAccountActionInput = z.infer<typeof deleteAccountSchema>;
