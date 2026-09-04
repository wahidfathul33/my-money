/**
 * Zod schemas for the sharing Server Actions (src/features/sharing/actions.ts).
 * Structural validation only — ownership/membership rules live in
 * src/lib/services/sharing.ts and src/lib/services/transactions.ts, same
 * split as every other feature's schema.ts.
 */
import { z } from 'zod';
import { HOUSEHOLD_WEALTH_ENTITY_TYPES } from '@/lib/services/sharing';
import { BULK_TAG_MAX } from '@/lib/services/transactions';

export const setShareWealthSchema = z.object({
  householdId: z.uuid('ID keluarga tidak valid'),
  share: z.boolean(),
});

export const setExcludeFromHouseholdSchema = z.object({
  entityType: z.enum(HOUSEHOLD_WEALTH_ENTITY_TYPES, { message: 'Jenis data tidak valid' }),
  entityId: z.uuid('ID tidak valid'),
  exclude: z.boolean(),
});

export const setTransactionHouseholdSchema = z.object({
  transactionId: z.uuid('Transaksi tidak valid'),
  householdId: z.uuid('ID keluarga tidak valid').nullable(),
});

export const bulkTagTransactionsSchema = z.object({
  transactionIds: z
    .array(z.uuid('ID transaksi tidak valid'))
    .min(1, 'Pilih minimal satu transaksi')
    .max(BULK_TAG_MAX, `Maksimal ${BULK_TAG_MAX} transaksi per penandaan massal`),
  householdId: z.uuid('ID keluarga tidak valid'),
});

export type SetShareWealthInput = z.infer<typeof setShareWealthSchema>;
export type SetExcludeFromHouseholdInput = z.infer<typeof setExcludeFromHouseholdSchema>;
export type SetTransactionHouseholdInput = z.infer<typeof setTransactionHouseholdSchema>;
export type BulkTagTransactionsInput = z.infer<typeof bulkTagTransactionsSchema>;
