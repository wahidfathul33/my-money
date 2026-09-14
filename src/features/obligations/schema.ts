/**
 * Zod schemas for the debts/receivables Server Actions
 * (src/features/obligations/actions.ts). Structural validation only —
 * business rules needing `Money` or a DB round trip (wallet ownership,
 * counterparty eligibility, the overpayment ceiling) live in
 * src/lib/services/obligations.ts, same split as every other feature's
 * schema.ts (docs/06-api-contracts.md §8).
 *
 * `startDate`/`dueDate`/`paymentDate` are all plain `YYYY-MM-DD` strings,
 * NOT `z.coerce.date()` — they map to `date` columns (string mode in
 * Drizzle), the same shape as src/features/savings/schema.ts's
 * `targetDateSchema`, not the `timestamptz` shape `transactionDate`/
 * `contributionDate` use elsewhere. `recordPaymentSchema.amount` DOES reuse
 * `moneyAmountSchema` from the transactions feature — the payment sheet
 * uses the same `AmountKeypad`-evaluated digit-string shape as
 * contribute/withdraw, nothing obligation-specific about it.
 */
import { z } from 'zod';
import { idempotencyKeySchema, moneyAmountSchema } from '@/features/transactions/schema';

export const obligationNameSchema = z
  .string()
  .trim()
  .min(1, 'Nama wajib diisi')
  .max(120, 'Nama terlalu panjang');

/** Decimal rupiah string from a plain `Input type="money"` field (parsed
 * with `fromRupiah` in actions.ts) — mirrors
 * src/features/savings/schema.ts's `targetAmountSchema`. */
export const initialAmountSchema = z.string().trim().min(1, 'Nominal wajib diisi');

const dateStrSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid');

export const startDateSchema = dateStrSchema;

/** Blank input becomes `null` (no due date), not a validation error —
 * same shape as savings' `targetDateSchema`. */
export const optionalDueDateSchema = dateStrSchema
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value));

/** A Radix `Switch` isn't a native checkbox — the form mirrors its boolean
 * state into a hidden `<input value="true"|"false">`, same technique as
 * src/features/budgets/schema.ts's `booleanFromStringSchema` (duplicated
 * locally per this codebase's established per-feature convention).
 * Deliberately NOT `z.coerce.boolean()`: `Boolean("false")` is `true`. */
export const booleanFromStringSchema = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Built for a FormData field (`undefined` when simply absent, not `null`)
 * — same shape as src/features/transactions/schema.ts's `noteSchema`. Used
 * ONLY by the create/update schemas below, whose actions read
 * `formData.get('note')`. */
export const obligationNoteSchema = z
  .string()
  .trim()
  .max(280, 'Catatan maksimal 280 karakter')
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value));

/**
 * `recordDebtPaymentSchema`/`recordReceivablePaymentSchema` are called with
 * a plain object (RecordPaymentSheetForm passes `note: null` directly, not
 * a FormData field), where "no note" is naturally `null`, never `undefined`
 * — `obligationNoteSchema`'s bare `.optional()` rejects an explicit `null`
 * outright ("Invalid input: expected string, received null", caught by
 * e2e/debts.spec.ts exercising the REAL Server Action, not just the service
 * function directly). Same fix, same reasoning, as
 * src/features/savings/schema.ts's `contributionNoteSchema` for
 * `contribute`/`withdraw` — see that constant's own doc comment.
 */
export const paymentNoteSchema = z
  .string()
  .trim()
  .max(280, 'Catatan maksimal 280 karakter')
  .nullable()
  .optional()
  .transform((value) => (value === undefined || value === null || value === '' ? null : value));

const dueDateNotBeforeStart = (data: { startDate: string; dueDate: string | null }) =>
  data.dueDate === null || data.dueDate >= data.startDate;
const DUE_DATE_REFINEMENT = {
  message: 'Jatuh tempo tidak boleh sebelum tanggal mulai',
  path: ['dueDate'],
};

export const createDebtSchema = z
  .object({
    creditorName: obligationNameSchema,
    counterpartyUserId: z.uuid('Anggota tidak valid').nullable(),
    initialAmount: initialAmountSchema,
    startDate: startDateSchema,
    dueDate: optionalDueDateSchema,
    affectsWallet: booleanFromStringSchema,
    walletId: z.uuid('Dompet tidak valid').nullable(),
    note: obligationNoteSchema,
  })
  .refine(dueDateNotBeforeStart, DUE_DATE_REFINEMENT);

// `startDate` is deliberately ABSENT from both update schemas below —
// src/lib/services/obligations.ts's `updateDebt`/`updateReceivable` don't
// accept it. `start_date` anchors the disbursement ledger entry's date
// (already posted at creation, for `affectsWallet` obligations); changing
// it after the fact would desync that entry's date from the row with no
// correction mechanism built for it (unlike `initialAmount`, which DOES
// have one — see `updateObligationCore`'s doc comment). Same "locked after
// creation" precedent as `affectsWallet`/`walletId` themselves.
export const updateDebtSchema = z.object({
  debtId: z.uuid('Hutang tidak valid'),
  creditorName: obligationNameSchema,
  counterpartyUserId: z.uuid('Anggota tidak valid').nullable(),
  initialAmount: initialAmountSchema,
  dueDate: optionalDueDateSchema,
  note: obligationNoteSchema,
});

export const createReceivableSchema = z
  .object({
    debtorName: obligationNameSchema,
    counterpartyUserId: z.uuid('Anggota tidak valid').nullable(),
    initialAmount: initialAmountSchema,
    startDate: startDateSchema,
    dueDate: optionalDueDateSchema,
    affectsWallet: booleanFromStringSchema,
    walletId: z.uuid('Dompet tidak valid').nullable(),
    note: obligationNoteSchema,
  })
  .refine(dueDateNotBeforeStart, DUE_DATE_REFINEMENT);

export const updateReceivableSchema = z.object({
  receivableId: z.uuid('Piutang tidak valid'),
  debtorName: obligationNameSchema,
  counterpartyUserId: z.uuid('Anggota tidak valid').nullable(),
  initialAmount: initialAmountSchema,
  dueDate: optionalDueDateSchema,
  note: obligationNoteSchema,
});

export const recordDebtPaymentSchema = z.object({
  debtId: z.uuid('Hutang tidak valid'),
  amount: moneyAmountSchema,
  walletId: z.uuid('Dompet tidak valid'),
  paymentDate: dateStrSchema,
  note: paymentNoteSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const recordReceivablePaymentSchema = z.object({
  receivableId: z.uuid('Piutang tidak valid'),
  amount: moneyAmountSchema,
  walletId: z.uuid('Dompet tidak valid'),
  paymentDate: dateStrSchema,
  note: paymentNoteSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const debtIdSchema = z.object({ debtId: z.uuid('Hutang tidak valid') });
export const receivableIdSchema = z.object({ receivableId: z.uuid('Piutang tidak valid') });

export type CreateDebtActionInput = z.infer<typeof createDebtSchema>;
export type UpdateDebtActionInput = z.infer<typeof updateDebtSchema>;
export type CreateReceivableActionInput = z.infer<typeof createReceivableSchema>;
export type UpdateReceivableActionInput = z.infer<typeof updateReceivableSchema>;
export type RecordDebtPaymentActionInput = z.infer<typeof recordDebtPaymentSchema>;
export type RecordReceivablePaymentActionInput = z.infer<typeof recordReceivablePaymentSchema>;
