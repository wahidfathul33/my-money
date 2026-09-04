'use server';

/**
 * Server Actions for the sharing feature. `requireUser()` first in every
 * one (docs/12-security-and-auth.md §3 — `proxy.ts` only protects pages,
 * not Server Actions). Each delegates to src/lib/services/sharing.ts or
 * src/lib/services/transactions.ts, which re-verify ownership/membership
 * again inside their own `dbWrite.transaction(...)` — this layer only fails
 * fast and cheaply before opening a connection.
 *
 * Plain (non-form) actions throughout — every caller here is a button/toggle
 * in a Client Component, not a native `<form>`, same shape as
 * src/features/wallets/actions.ts's "Plain actions" section.
 */
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import {
  bulkTagTransactions,
  setTransactionHousehold,
  type BulkTagResult,
} from '@/lib/services/transactions';
import { setExcludeFromHousehold, setShareWealth, stopSharingEverything } from '@/lib/services/sharing';
import { AppError, ValidationError } from '@/lib/api/errors';
import {
  bulkTagTransactionsSchema,
  setExcludeFromHouseholdSchema,
  setShareWealthSchema,
  setTransactionHouseholdSchema,
} from './schema';

export interface ActionState {
  error: string | null;
}

const OK: ActionState = { error: null };

/** Same mapping every other feature's actions.ts uses — docs/08-copywriting.md §5.7. */
function toActionError(err: unknown): ActionState {
  if (err instanceof ValidationError) {
    return { error: Object.values(err.fields)[0]?.[0] ?? 'Validasi gagal' };
  }
  if (err instanceof AppError) {
    return { error: err.message };
  }
  throw err;
}

/** Sharing state fans out across the app shell (switcher/nav badges, future
 * net-worth pages) the same way household create/archive already does —
 * see src/features/household/actions.ts's `createHouseholdAction` comment. */
function revalidateSharing(): void {
  revalidatePath('/', 'layout');
}

export async function setShareWealthAction(householdId: string, share: boolean): Promise<ActionState> {
  const user = await requireUser();
  const parsed = setShareWealthSchema.safeParse({ householdId, share });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };

  try {
    await setShareWealth(user.id, parsed.data.householdId, parsed.data.share);
  } catch (err) {
    return toActionError(err);
  }

  revalidateSharing();
  return OK;
}

export interface StopSharingResult extends ActionState {
  affectedCount?: number;
}

/** spec.md's "Berhenti berbagi semuanya" — flips EVERY membership's
 * `share_wealth` off. No id to validate: it always targets the caller's own
 * memberships, nothing else. */
export async function stopSharingEverythingAction(): Promise<StopSharingResult> {
  const user = await requireUser();

  let affectedCount: number;
  try {
    ({ affectedCount } = await stopSharingEverything(user.id));
  } catch (err) {
    return toActionError(err);
  }

  revalidateSharing();
  return { error: null, affectedCount };
}

export async function setExcludeFromHouseholdAction(
  entityType: string,
  entityId: string,
  exclude: boolean,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = setExcludeFromHouseholdSchema.safeParse({ entityType, entityId, exclude });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };

  try {
    await setExcludeFromHousehold(user.id, parsed.data.entityType, parsed.data.entityId, parsed.data.exclude);
  } catch (err) {
    return toActionError(err);
  }

  revalidateSharing();
  return OK;
}

/** Every route a transaction's household tag can change the numbers on —
 * same set as src/features/transactions/actions.ts's `revalidateTransactions`,
 * plus the household's own expenses page. */
function revalidateHouseholdTag(householdId: string | null): void {
  revalidatePath('/transactions');
  revalidatePath('/');
  if (householdId) revalidatePath(`/household/${householdId}/transactions`);
}

export async function setTransactionHouseholdAction(
  transactionId: string,
  householdId: string | null,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = setTransactionHouseholdSchema.safeParse({ transactionId, householdId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };

  try {
    await setTransactionHousehold(user.id, parsed.data.transactionId, parsed.data.householdId);
  } catch (err) {
    return toActionError(err);
  }

  revalidateHouseholdTag(parsed.data.householdId);
  return OK;
}

export interface BulkTagActionResult extends ActionState {
  taggedCount?: number;
}

export async function bulkTagTransactionsAction(
  transactionIds: string[],
  householdId: string,
): Promise<BulkTagActionResult> {
  const user = await requireUser();
  const parsed = bulkTagTransactionsSchema.safeParse({ transactionIds, householdId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };

  let result: BulkTagResult;
  try {
    result = await bulkTagTransactions(user.id, parsed.data.transactionIds, parsed.data.householdId);
  } catch (err) {
    return toActionError(err);
  }

  revalidateHouseholdTag(parsed.data.householdId);
  return { error: null, taggedCount: result.taggedCount };
}
