'use server';

/**
 * Gold Server Actions — thin adapters only (docs/11-tech-architecture.md
 * §2/§3): `requireUser()` first, parse with Zod, convert rupiah strings to
 * `Money` via `fromRupiah`, delegate to src/lib/services/gold.ts,
 * revalidate.
 *
 * All three take a plain typed object and are called directly from a
 * `useTransition` handler — same calling shape as
 * src/features/savings/actions.ts's `contributeAction`/`withdrawAction`
 * (the buy/sell sheets use two plain numeric fields, not a
 * `useActionState`-shaped native form).
 *
 * `exclude_from_household` is NOT re-implemented here — the gold page
 * reuses src/features/sharing/components/exclusion-toggle.tsx with
 * `entityType="asset"` directly, which already calls
 * `setExcludeFromHouseholdAction` (src/features/sharing/actions.ts). That
 * action was built generically for exactly this (its own file's comment:
 * "assets/debts/receivables/savings_goals land in tasks 16-18 ... no
 * service change beyond registering their table").
 */
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { buyGold, recordGoldPrice, sellGold } from '@/lib/services/gold';
import { fromRupiah } from '@/lib/finance/money';
import { AppError, ValidationError } from '@/lib/api/errors';
import { buyGoldSchema, recordGoldPriceSchema, sellGoldSchema } from './schema';

export interface ActionState {
  error: string | null;
}

const OK: ActionState = { error: null };

/** Turns a thrown domain error into a message safe to show the user, per
 * docs/08-copywriting.md §5.7 — same shape as every other feature's actions.ts. */
function toActionError(err: unknown): ActionState {
  if (err instanceof ValidationError) {
    return { error: Object.values(err.fields)[0]?.[0] ?? 'Validasi gagal' };
  }
  if (err instanceof AppError) {
    return { error: err.message };
  }
  throw err;
}

/** Every route a buy/sell/price-update can change the numbers on —
 * docs/06-api-contracts.md §10's "Emas / Deposito" revalidation row, plus
 * `/wallets` (buy/sell moves a wallet balance, same as
 * src/features/savings/actions.ts's `revalidateSavings`). */
function revalidateGold(): void {
  revalidatePath('/');
  revalidatePath('/wealth');
  revalidatePath('/wealth/assets');
  revalidatePath('/wealth/assets/gold');
  revalidatePath('/wealth/net-worth');
  revalidatePath('/wallets');
}

export interface BuyGoldActionInput {
  weightGrams: string;
  /** Decimal rupiah string (e.g. `"1050000"`), parsed via `fromRupiah`. */
  pricePerGram: string;
  walletId: string;
  purchaseDate: Date;
  goldForm: string | null;
  idempotencyKey: string;
}

export interface GoldActionResult extends ActionState {
  id?: string;
}

export async function buyGoldAction(input: BuyGoldActionInput): Promise<GoldActionResult> {
  const user = await requireUser();

  const parsed = buyGoldSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  let pricePerGram: bigint;
  try {
    pricePerGram = fromRupiah(parsed.data.pricePerGram);
  } catch {
    return { error: 'Harga tidak valid' };
  }

  try {
    const lot = await buyGold(user.id, {
      weightGrams: parsed.data.weightGrams,
      pricePerGram,
      walletId: parsed.data.walletId,
      purchaseDate: parsed.data.purchaseDate,
      goldForm: parsed.data.goldForm,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidateGold();
    return { error: null, id: lot.id };
  } catch (err) {
    return toActionError(err);
  }
}

export interface SellGoldActionInput {
  weightGrams: string;
  pricePerGram: string;
  walletId: string;
  saleDate: Date;
  idempotencyKey: string;
}

export async function sellGoldAction(input: SellGoldActionInput): Promise<GoldActionResult> {
  const user = await requireUser();

  const parsed = sellGoldSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  let pricePerGram: bigint;
  try {
    pricePerGram = fromRupiah(parsed.data.pricePerGram);
  } catch {
    return { error: 'Harga tidak valid' };
  }

  try {
    const sale = await sellGold(user.id, {
      weightGrams: parsed.data.weightGrams,
      pricePerGram,
      walletId: parsed.data.walletId,
      saleDate: parsed.data.saleDate,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidateGold();
    return { error: null, id: sale.id };
  } catch (err) {
    return toActionError(err);
  }
}

export interface RecordGoldPriceActionInput {
  priceDate: string;
  sellPerGram: string;
  buybackPerGram: string;
}

export async function recordGoldPriceAction(input: RecordGoldPriceActionInput): Promise<ActionState> {
  const user = await requireUser();

  const parsed = recordGoldPriceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  let sellPerGram: bigint;
  let buybackPerGram: bigint;
  try {
    sellPerGram = fromRupiah(parsed.data.sellPerGram);
    buybackPerGram = fromRupiah(parsed.data.buybackPerGram);
  } catch {
    return { error: 'Harga tidak valid' };
  }

  try {
    await recordGoldPrice(user.id, {
      priceDate: parsed.data.priceDate,
      sellPerGram,
      buybackPerGram,
      source: 'manual',
    });
    revalidateGold();
    return OK;
  } catch (err) {
    return toActionError(err);
  }
}
