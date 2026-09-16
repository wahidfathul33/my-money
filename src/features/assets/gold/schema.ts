/**
 * Zod schemas for the gold Server Actions (./actions.ts). Structural
 * validation only — business rules that need `Money`/`Grams`
 * (fromRupiah, positivity, wallet ownership, FOR UPDATE overselling guard,
 * buyback <= sell) live in src/lib/services/gold.ts, same split as every
 * other feature's schema.ts.
 *
 * `pricePerGram` mirrors src/features/wallets/schema.ts's `openingBalance` /
 * src/features/savings/schema.ts's `targetAmountSchema` — a plain decimal
 * rupiah string from an ordinary `Input type="money"` field (parsed with
 * `fromRupiah` in actions.ts), NOT the transactions feature's
 * `moneyAmountSchema` (an already-evaluated minor-unit digit string from
 * `<AmountKeypad>`) — the buy/sell sheets use two plain numeric fields
 * (weight, price), not a keypad.
 */
import { z } from 'zod';
import { idempotencyKeySchema } from '@/features/transactions/schema';

/** Matches `parseGrams` (src/lib/finance/gold.ts) — a non-negative decimal
 * with at most 4 fractional digits, matching `NUMERIC(18,4)`. */
export const gramsSchema = z
  .string()
  .trim()
  .min(1, 'Berat wajib diisi')
  .regex(/^\d+(\.\d{1,4})?$/, 'Berat tidak valid (maksimal 4 desimal)');

export const priceAmountSchema = z.string().trim().min(1, 'Harga wajib diisi');

/**
 * `buyGoldAction` is called with a plain object, not `FormData` (this
 * module's file header) — "no gold form specified" arrives as a literal
 * `null`, not an absent key. A bare `.optional()` (which accepts
 * `undefined` but rejects `null`) is exactly the pitfall
 * src/features/savings/schema.ts's `contributionNoteSchema` documents at
 * length; `.nullable().optional()` accepts both shapes.
 */
const goldFormSchema = z
  .string()
  .trim()
  .max(80, 'Bentuk emas terlalu panjang')
  .nullable()
  .optional()
  .transform((value) => (value === undefined || value === null || value === '' ? null : value));

export const buyGoldSchema = z.object({
  weightGrams: gramsSchema,
  pricePerGram: priceAmountSchema,
  walletId: z.uuid('Dompet tidak valid'),
  purchaseDate: z.coerce.date({ message: 'Tanggal tidak valid' }),
  goldForm: goldFormSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const sellGoldSchema = z.object({
  weightGrams: gramsSchema,
  pricePerGram: priceAmountSchema,
  walletId: z.uuid('Dompet tidak valid'),
  saleDate: z.coerce.date({ message: 'Tanggal tidak valid' }),
  idempotencyKey: idempotencyKeySchema,
});

/** `YYYY-MM-DD` — matches how `gold_prices.price_date` (a `date` column)
 * round-trips through Drizzle, same convention as
 * src/features/savings/schema.ts's `targetDateSchema`. */
export const priceDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid');

export const recordGoldPriceSchema = z.object({
  priceDate: priceDateSchema,
  sellPerGram: priceAmountSchema,
  buybackPerGram: priceAmountSchema,
});

export type BuyGoldActionInput = z.infer<typeof buyGoldSchema>;
export type SellGoldActionInput = z.infer<typeof sellGoldSchema>;
export type RecordGoldPriceActionInput = z.infer<typeof recordGoldPriceSchema>;
