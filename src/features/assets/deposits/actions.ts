'use server';

/**
 * Deposits Server Actions — thin adapters only (docs/11-tech-architecture.md
 * §2/§3): `requireUser()` first, parse with Zod, delegate to
 * src/lib/services/deposits.ts, revalidate.
 *
 * Two calling shapes, matching the rest of the codebase:
 *  - `createDepositAction`/`updateDepositAction` are `useActionState`-shaped
 *    (`(prevState, formData)`) — an ordinary multi-field form, same as
 *    src/features/savings/actions.ts's `createGoalAction`.
 *  - `withdrawDepositAction` takes a plain typed object and is called
 *    directly from a `useTransition` handler — there's no amount to TYPE
 *    (principal + net interest is COMPUTED, not entered), so this is closer
 *    to a confirmation action than a keypad flow; same object-in,
 *    object-out shape as src/features/savings/actions.ts's `withdrawAction`
 *    regardless.
 *
 * `exclude_from_household` has NO action here — it's toggled via
 * src/features/sharing/actions.ts's existing `setExcludeFromHouseholdAction`
 * with `entityType: 'asset'`, `entityId: deposit.assetId`
 * (src/lib/services/sharing.ts already registers `asset` as one of its five
 * excludable entity types), through the shared `<ExclusionToggle>`
 * component — see deposit-detail-client.tsx.
 */
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { createDeposit, updateDeposit, withdrawDeposit } from '@/lib/services/deposits';
import { fromRupiah, serializeMoney } from '@/lib/finance/money';
import { AppError, ValidationError } from '@/lib/api/errors';
import { createDepositSchema, depositIdSchema, updateDepositSchema, withdrawDepositSchema } from './schema';

export interface ActionState {
  error: string | null;
  depositId?: string;
}

export interface WithdrawDepositActionResult {
  error: string | null;
  totalCredited?: string;
}

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

/** Every route a deposit mutation can change — docs/06-api-contracts.md
 * §10's "Emas / Deposito" row (`/`, `/wealth`, `/wealth/assets`,
 * `/wealth/net-worth`), plus this feature's own routes, plus `/wallets`
 * whenever a ledger entry actually moved a wallet balance (create funded
 * from a wallet, or withdraw) — the same addition
 * src/features/savings/actions.ts's `revalidateSavings` makes on top of
 * docs/06's own table for the identical reason. */
function revalidateDeposits(depositId: string, walletBalanceChanged: boolean): void {
  revalidatePath('/');
  revalidatePath('/wealth');
  revalidatePath('/wealth/assets');
  revalidatePath('/wealth/assets/deposits');
  revalidatePath(`/wealth/assets/deposits/${depositId}`);
  revalidatePath('/wealth/net-worth');
  if (walletBalanceChanged) revalidatePath('/wallets');
}

function normalizeRate(rate: string): string {
  return Number(rate).toFixed(4);
}

export async function createDepositAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const parsed = createDepositSchema.safeParse({
    bankName: formData.get('bankName'),
    principal: formData.get('principal'),
    interestRateAnnual: formData.get('interestRateAnnual'),
    startDate: formData.get('startDate'),
    maturityDate: formData.get('maturityDate'),
    payoutSchedule: formData.get('payoutSchedule'),
    aroEnabled: formData.get('aroEnabled'),
    aroIncludeInterest: formData.get('aroIncludeInterest'),
    walletId: (formData.get('walletId') as string | null) ?? undefined,
    idempotencyKey: formData.get('idempotencyKey'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  let principal: bigint;
  try {
    principal = fromRupiah(parsed.data.principal);
  } catch {
    return { error: 'Pokok tidak valid' };
  }

  try {
    const deposit = await createDeposit(user.id, {
      bankName: parsed.data.bankName,
      principal,
      interestRateAnnual: normalizeRate(parsed.data.interestRateAnnual),
      startDate: parsed.data.startDate,
      maturityDate: parsed.data.maturityDate,
      payoutSchedule: parsed.data.payoutSchedule,
      aroEnabled: parsed.data.aroEnabled,
      aroIncludeInterest: parsed.data.aroIncludeInterest,
      walletId: parsed.data.walletId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidateDeposits(deposit.id, parsed.data.walletId !== null);
    return { error: null, depositId: deposit.id };
  } catch (err) {
    return toActionError(err);
  }
}

export async function updateDepositAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const parsed = updateDepositSchema.safeParse({
    depositId: formData.get('depositId'),
    bankName: formData.get('bankName'),
    interestRateAnnual: formData.get('interestRateAnnual'),
    maturityDate: formData.get('maturityDate'),
    payoutSchedule: formData.get('payoutSchedule'),
    aroEnabled: formData.get('aroEnabled'),
    aroIncludeInterest: formData.get('aroIncludeInterest'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    const deposit = await updateDeposit(user.id, parsed.data.depositId, {
      bankName: parsed.data.bankName,
      interestRateAnnual: normalizeRate(parsed.data.interestRateAnnual),
      maturityDate: parsed.data.maturityDate,
      payoutSchedule: parsed.data.payoutSchedule,
      aroEnabled: parsed.data.aroEnabled,
      aroIncludeInterest: parsed.data.aroIncludeInterest,
    });
    revalidateDeposits(deposit.id, false);
    return { error: null, depositId: deposit.id };
  } catch (err) {
    return toActionError(err);
  }
}

export interface WithdrawDepositActionInput {
  depositId: string;
  walletId: string;
  withdrawalDate: Date;
  idempotencyKey: string;
}

export async function withdrawDepositAction(input: WithdrawDepositActionInput): Promise<WithdrawDepositActionResult> {
  const user = await requireUser();

  const parsedId = depositIdSchema.safeParse({ depositId: input.depositId });
  const parsed = withdrawDepositSchema.safeParse(input);
  if (!parsedId.success || !parsed.success) {
    return { error: (parsed.error ?? parsedId.error)?.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    const result = await withdrawDeposit(user.id, parsed.data.depositId, {
      walletId: parsed.data.walletId,
      withdrawalDate: parsed.data.withdrawalDate,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidateDeposits(parsed.data.depositId, true);
    return { error: null, totalCredited: serializeMoney(result.totalCredited) };
  } catch (err) {
    const { error } = toActionError(err);
    return { error };
  }
}
