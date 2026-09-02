/**
 * Zod schemas for the transactions Server Actions (src/features/transactions/actions.ts).
 * Structural validation only — business rules that need `Money`
 * (deserializeMoney, sign, positivity) or DB ownership checks live in
 * src/lib/services/transactions.ts, same split as src/features/wallets/schema.ts.
 *
 * `amount` crosses the boundary as a plain-digit string, not a decimal
 * rupiah string like the wallets forms use — the keypad already evaluates
 * its `+`/`−` expression into a final `Money` client-side
 * (src/features/transactions/amount-math.ts), and `serializeMoney`
 * (src/lib/finance/money.ts) turns that into exactly this shape. No
 * decimal point, no sign — sign lives on the ledger (docs/05 §4).
 */
import { z } from 'zod';

export const transactionTypeSchema = z.enum(['income', 'expense'], {
  message: 'Jenis transaksi tidak valid',
});

export const moneyAmountSchema = z.string().trim().regex(/^\d+$/, 'Jumlah tidak valid');

export const noteSchema = z
  .string()
  .trim()
  .max(280, 'Catatan maksimal 280 karakter')
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value));

export const idempotencyKeySchema = z.uuid('Kunci idempotensi tidak valid');

const baseTransactionFields = {
  type: transactionTypeSchema,
  amount: moneyAmountSchema,
  categoryId: z.uuid('Kategori tidak valid'),
  walletId: z.uuid('Dompet tidak valid'),
  transactionDate: z.coerce.date({ message: 'Tanggal tidak valid' }),
  note: noteSchema,
};

export const createTransactionSchema = z.object({
  ...baseTransactionFields,
  idempotencyKey: idempotencyKeySchema,
});

export const updateTransactionSchema = z.object({
  transactionId: z.uuid('Transaksi tidak valid'),
  ...baseTransactionFields,
});

export const transactionIdSchema = z.object({
  transactionId: z.uuid('Transaksi tidak valid'),
});

export type CreateTransactionActionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionActionInput = z.infer<typeof updateTransactionSchema>;
