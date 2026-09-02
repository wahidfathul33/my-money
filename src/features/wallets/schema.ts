/**
 * Zod schemas for the wallets Server Actions (src/features/wallets/actions.ts).
 * Structural validation only (shape, presence, string length) — business
 * rules that need `Money` (fromRupiah, sign checks) live in actions.ts,
 * same split as src/app/onboarding/actions.ts.
 */
import { z } from 'zod';

export const walletTypeSchema = z.enum(['cash', 'bank', 'ewallet', 'credit_card'], {
  message: 'Jenis dompet tidak valid',
});

export const walletNameSchema = z
  .string()
  .trim()
  .min(1, 'Nama dompet wajib diisi')
  .max(60, 'Nama dompet terlalu panjang');

export const createWalletSchema = z.object({
  name: walletNameSchema,
  type: walletTypeSchema,
  openingBalance: z.string().trim(),
});

export const updateWalletSchema = z.object({
  walletId: z.uuid('ID dompet tidak valid'),
  name: walletNameSchema,
  icon: z.string().trim().min(1, 'Pilih ikon'),
  color: z.string().trim().min(1, 'Pilih warna'),
});

export const walletIdSchema = z.object({
  walletId: z.uuid('ID dompet tidak valid'),
});

export const adjustWalletBalanceSchema = z.object({
  walletId: z.uuid('ID dompet tidak valid'),
  actualBalance: z.string().trim(),
});

export const reorderWalletsSchema = z.object({
  orderedIds: z.array(z.uuid()).min(1, 'Daftar dompet kosong'),
});

export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type UpdateWalletInput = z.infer<typeof updateWalletSchema>;
export type AdjustWalletBalanceInput = z.infer<typeof adjustWalletBalanceSchema>;
export type ReorderWalletsInput = z.infer<typeof reorderWalletsSchema>;
