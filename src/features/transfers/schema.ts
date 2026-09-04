/**
 * Zod schemas for the transfers Server Actions (src/features/transfers/actions.ts).
 * Structural validation only — business rules that need `Money`
 * (deserializeMoney, sign, positivity) or DB ownership/archived checks live
 * in src/lib/services/transfers.ts, same split as
 * src/features/transactions/schema.ts.
 *
 * Re-exports `moneyAmountSchema` / `noteSchema` / `idempotencyKeySchema`
 * from the transactions feature rather than redefining them — they're
 * structural primitives (a digit-string amount, an optional 280-char note, a
 * UUID key) with nothing record-specific about them, so duplicating them
 * here would just be two copies to keep in sync.
 */
import { z } from 'zod';
import { idempotencyKeySchema, moneyAmountSchema, noteSchema } from '@/features/transactions/schema';

export const createSelfTransferSchema = z
  .object({
    fromWalletId: z.uuid('Dompet asal tidak valid'),
    toWalletId: z.uuid('Dompet tujuan tidak valid'),
    amount: moneyAmountSchema,
    transactionDate: z.coerce.date({ message: 'Tanggal tidak valid' }),
    note: noteSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  // Same-wallet rejection at the schema level (spec.md "Validasi menolak:
  // dompet asal = tujuan") — the service re-checks this too, since a Server
  // Action boundary is not the only caller (defense in depth, same as
  // ownership checks living both at the boundary and inside the transaction).
  .refine((data) => data.fromWalletId !== data.toWalletId, {
    message: 'Dompet tujuan harus berbeda dari dompet asal',
    path: ['toWalletId'],
  });

export const transferIdSchema = z.object({
  transactionId: z.uuid('Transfer tidak valid'),
});

export type CreateSelfTransferActionInput = z.infer<typeof createSelfTransferSchema>;
