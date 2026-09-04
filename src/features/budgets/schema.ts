/**
 * Zod schemas for the budgets Server Actions (src/features/budgets/actions.ts).
 * Structural validation only (shape, presence, format) — business rules that
 * need `Money` (fromRupiah) or a DB round trip (category ownership, catalog
 * membership, household role) live in src/lib/services/budgets.ts, same
 * split as src/features/wallets/schema.ts / actions.ts.
 *
 * `scope` discriminates ONE `upsertBudgetAction` (docs/06-api-contracts.md
 * §5: "Budget: upsertBudgetAction · deleteBudgetAction" — no separate
 * household variant) between the personal (`category_id`) and household
 * (`category_key`) shape, matching `budget_scope_exclusive`'s own either/or
 * (src/lib/db/schema/budgets.ts).
 */
import { z } from 'zod';

export const budgetPeriodSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, 'Periode tidak valid');

/** A Radix `Switch` isn't a native checkbox — the form mirrors its boolean
 * state into a hidden `<input value="true"|"false">` (see budget-sheet.tsx),
 * so this parses that exact string pair. Deliberately NOT `z.coerce.boolean()`:
 * `Boolean("false")` is `true` — a classic FormData footgun. */
export const booleanFromStringSchema = z.enum(['true', 'false']).transform((v) => v === 'true');

const amountSchema = z.string().trim().min(1, 'Nominal wajib diisi');

export const upsertPersonalBudgetSchema = z.object({
  scope: z.literal('personal'),
  categoryId: z.uuid('Kategori tidak valid'),
  amount: amountSchema,
  period: budgetPeriodSchema,
  isRecurring: booleanFromStringSchema,
});

export const upsertHouseholdBudgetSchema = z.object({
  scope: z.literal('household'),
  householdId: z.uuid('Keluarga tidak valid'),
  categoryKey: z.string().trim().min(1, 'Kategori wajib dipilih'),
  amount: amountSchema,
  period: budgetPeriodSchema,
  isRecurring: booleanFromStringSchema,
});

export const deleteBudgetSchema = z.object({
  budgetId: z.uuid('ID anggaran tidak valid'),
});

export type UpsertPersonalBudgetFormInput = z.infer<typeof upsertPersonalBudgetSchema>;
export type UpsertHouseholdBudgetFormInput = z.infer<typeof upsertHouseholdBudgetSchema>;
export type DeleteBudgetFormInput = z.infer<typeof deleteBudgetSchema>;
