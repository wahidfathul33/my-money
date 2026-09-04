/**
 * Zod schemas for the savings Server Actions (src/features/savings/actions.ts).
 * Structural validation only — business rules that need `Money`
 * (fromRupiah/deserializeMoney, positivity, wallet/goal ownership) live in
 * src/lib/services/savings.ts, same split as every other feature's schema.ts.
 *
 * `contribute`/`withdraw` reuse `moneyAmountSchema`/`noteSchema`/
 * `idempotencyKeySchema` from the transactions feature rather than
 * redefining them (same reasoning src/features/transfers/schema.ts gives) —
 * they're the AmountKeypad's already-evaluated digit-string shape, nothing
 * savings-specific about it. `createGoal`/`updateGoal`'s `targetAmount`
 * instead mirrors src/features/wallets/schema.ts's `openingBalance` — a
 * plain decimal rupiah string from a regular `Input type="money"` field
 * (parsed with `fromRupiah` in actions.ts), since goal creation is an
 * ordinary form, not a keypad flow.
 */
import { z } from 'zod';
import { idempotencyKeySchema, moneyAmountSchema, noteSchema } from '@/features/transactions/schema';

export const goalNameSchema = z
  .string()
  .trim()
  .min(1, 'Nama goal wajib diisi')
  .max(80, 'Nama goal terlalu panjang');

export const targetAmountSchema = z.string().trim().min(1, 'Nominal target wajib diisi');

/** `YYYY-MM-DD`, matching how `savings_goals.target_date` (a `date` column)
 * round-trips through Drizzle — src/lib/finance/savings.ts's file header.
 * Blank input becomes `null` (no target date), not a validation error. */
export const targetDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid')
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value));

export const createGoalSchema = z.object({
  name: goalNameSchema,
  targetAmount: targetAmountSchema,
  targetDate: targetDateSchema,
  /** `null` => personal goal. A real household id => shared goal. */
  householdId: z.uuid('Keluarga tidak valid').nullable(),
});

export const updateGoalSchema = z.object({
  goalId: z.uuid('Goal tidak valid'),
  name: goalNameSchema,
  targetAmount: targetAmountSchema,
  targetDate: targetDateSchema,
});

export const goalIdSchema = z.object({
  goalId: z.uuid('Goal tidak valid'),
});

export const contributeSchema = z.object({
  goalId: z.uuid('Goal tidak valid'),
  walletId: z.uuid('Dompet tidak valid'),
  amount: moneyAmountSchema,
  contributionDate: z.coerce.date({ message: 'Tanggal tidak valid' }),
  note: noteSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const withdrawSchema = z.object({
  goalId: z.uuid('Goal tidak valid'),
  walletId: z.uuid('Dompet tidak valid'),
  amount: moneyAmountSchema,
  withdrawalDate: z.coerce.date({ message: 'Tanggal tidak valid' }),
  note: noteSchema,
  idempotencyKey: idempotencyKeySchema,
});

export type CreateGoalActionInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalActionInput = z.infer<typeof updateGoalSchema>;
export type ContributeActionInput = z.infer<typeof contributeSchema>;
export type WithdrawActionInput = z.infer<typeof withdrawSchema>;
