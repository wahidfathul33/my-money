/**
 * Zod schemas for the recurring Server Actions (src/features/recurring/actions.ts).
 * Structural validation only — business rules (Money positivity, wallet/
 * category/goal ownership, `computeNextRunDate`) live in
 * src/lib/services/recurring-transactions.ts / recurring-savings.ts, same
 * split as every other feature's schema.ts.
 *
 * `amount`/`note`/`idempotencyKey` reuse the transactions feature's own
 * schemas (same reasoning src/features/savings/schema.ts already gives) —
 * they're the AmountKeypad's already-evaluated digit-string shape, nothing
 * recurring-specific about it.
 */
import { z } from 'zod';
import { moneyAmountSchema, noteSchema, transactionTypeSchema } from '@/features/transactions/schema';

export const recurringFrequencySchema = z.enum(['daily', 'weekly', 'monthly'], {
  message: 'Frekuensi tidak valid',
});

const dateStrSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid');

/** Blank/omitted → `null` (no end date), same "optional means unbounded" shape as savings goals' own `targetDateSchema`. */
const endDateStrSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid')
  .nullable()
  .optional()
  .transform((value) => (value === undefined || value === null || value === '' ? null : value));

export const createRecurringTransactionSchema = z.object({
  type: transactionTypeSchema,
  amount: moneyAmountSchema,
  categoryId: z.uuid('Kategori tidak valid'),
  walletId: z.uuid('Dompet tidak valid'),
  note: noteSchema,
  frequency: recurringFrequencySchema,
  startDate: dateStrSchema,
  endDate: endDateStrSchema,
  householdId: z.uuid('Household tidak valid').nullable().optional(),
});

export const recurringTransactionIdSchema = z.object({
  id: z.uuid('Transaksi rutin tidak valid'),
});

export const createRecurringContributionSchema = z.object({
  goalId: z.uuid('Target tidak valid'),
  walletId: z.uuid('Dompet tidak valid'),
  amount: moneyAmountSchema,
  frequency: recurringFrequencySchema,
  startDate: dateStrSchema,
  endDate: endDateStrSchema,
});

export const recurringContributionIdSchema = z.object({
  id: z.uuid('Kontribusi rutin tidak valid'),
});

export type CreateRecurringTransactionActionInput = z.infer<typeof createRecurringTransactionSchema>;
export type CreateRecurringContributionActionInput = z.infer<typeof createRecurringContributionSchema>;
