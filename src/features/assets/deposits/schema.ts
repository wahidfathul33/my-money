/**
 * Zod schemas for the deposits Server Actions (src/features/assets/deposits/actions.ts).
 * Structural validation only — business rules that need `Money` or a DB
 * lookup (positivity beyond shape, wallet ownership, `status = 'active'`
 * gating) live in src/lib/services/deposits.ts, same split as every other
 * feature's schema.ts (see e.g. src/features/savings/schema.ts's own file
 * header).
 *
 * `idempotencyKey` reuses src/features/transactions/schema.ts's
 * `idempotencyKeySchema` — same reasoning src/features/savings/schema.ts
 * gives for doing the same: it's just a UUID shape check, nothing
 * transaction-specific about it.
 */
import { z } from 'zod';
import { idempotencyKeySchema } from '@/features/transactions/schema';

export const bankNameSchema = z.string().trim().min(1, 'Nama bank wajib diisi').max(80, 'Nama bank terlalu panjang');

/** Plain decimal rupiah string from a regular `Input type="money"` field
 * (parsed with `fromRupiah` in actions.ts) — mirrors
 * src/features/savings/schema.ts's `targetAmountSchema` exactly; deposit
 * creation is an ordinary form, not a keypad flow. */
export const principalAmountSchema = z.string().trim().min(1, 'Pokok wajib diisi');

/** Up to 3 integer digits and 4 decimal digits, matching
 * `interest_rate_annual NUMERIC(7,4)` — range-checked against 0–100
 * (`deposit_rate_sane`) here too, so a plainly-invalid rate never reaches
 * the service layer at all. */
export const interestRateSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,4})?$/, 'Suku bunga tidak valid')
  .refine((value) => Number(value) <= 100, 'Suku bunga harus antara 0 dan 100');

/** `YYYY-MM-DD`, matching how `deposits.start_date`/`maturity_date` (DATE
 * columns) round-trip through Drizzle — same convention
 * src/features/savings/schema.ts's `targetDateSchema` documents, minus the
 * optional/blank-to-null transform: both dates are REQUIRED for a deposit. */
export const dateStringSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid');

export const payoutScheduleSchema = z.enum(['at_maturity', 'monthly'], { message: 'Jadwal tidak valid' });

/** Hidden `<input>` fields synced from a `<Switch>` (see
 * deposit-form-sheet.tsx) carry the literal string `"true"`/`"false"` —
 * NEVER `z.coerce.boolean()`, whose `Boolean("false") === true` gotcha
 * would silently treat an OFF switch as ON. */
export const switchFieldSchema = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Empty string (no wallet picked) becomes `null` — a deposit can be
 * recorded without a funding wallet (todo.md; see
 * src/lib/services/deposits.ts's `CreateDepositInput.walletId` doc
 * comment). */
export const optionalWalletIdSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value))
  .pipe(z.uuid('Dompet tidak valid').nullable());

export const createDepositSchema = z
  .object({
    bankName: bankNameSchema,
    principal: principalAmountSchema,
    interestRateAnnual: interestRateSchema,
    startDate: dateStringSchema,
    maturityDate: dateStringSchema,
    payoutSchedule: payoutScheduleSchema,
    aroEnabled: switchFieldSchema,
    aroIncludeInterest: switchFieldSchema,
    walletId: optionalWalletIdSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .refine((data) => data.maturityDate > data.startDate, {
    message: 'Tanggal jatuh tempo harus setelah tanggal mulai',
    path: ['maturityDate'],
  })
  .refine((data) => data.payoutSchedule !== 'monthly' || data.walletId !== null, {
    message: 'Jadwal bulanan memerlukan dompet tujuan bunga',
    path: ['walletId'],
  });

export const updateDepositSchema = z.object({
  depositId: z.uuid('Deposito tidak valid'),
  bankName: bankNameSchema,
  interestRateAnnual: interestRateSchema,
  maturityDate: dateStringSchema,
  payoutSchedule: payoutScheduleSchema,
  aroEnabled: switchFieldSchema,
  aroIncludeInterest: switchFieldSchema,
});

export const depositIdSchema = z.object({ depositId: z.uuid('Deposito tidak valid') });

export const withdrawDepositSchema = z.object({
  depositId: z.uuid('Deposito tidak valid'),
  walletId: z.uuid('Dompet tidak valid'),
  withdrawalDate: z.coerce.date({ message: 'Tanggal tidak valid' }),
  idempotencyKey: idempotencyKeySchema,
});

export type CreateDepositActionInput = z.infer<typeof createDepositSchema>;
export type UpdateDepositActionInput = z.infer<typeof updateDepositSchema>;
export type WithdrawDepositActionInput = z.infer<typeof withdrawDepositSchema>;
