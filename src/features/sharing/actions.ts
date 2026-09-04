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
 *
 * docs/06-api-contracts.md §5's "Berbagi" catalog lists three actions —
 * `setShareWealthAction`, `setExcludeFromHouseholdAction`, and a read-only
 * `getSharingSummaryAction` — and stresses "hanya tiga, dan tidak ada satu
 * pun yang memberi akses kepada orang tertentu" (ADR-024's no-per-person-
 * grant principle). Reconciled here as follows:
 *   - `getSharingSummaryAction` isn't a Server Action in this codebase —
 *     it's `getSharingSummary` (../queries.ts), called directly from the
 *     Server Component `/settings/sharing` page, matching docs/06 §1's own
 *     "baca data awal halaman → Server Component" rule and every other
 *     feature's established split (e.g. src/features/household/queries.ts's
 *     `getHouseholdWithRole`, never wrapped as an action either).
 *   - `stopSharingEverythingAction` (below) is a fourth action beyond that
 *     count, added because spec.md requires it as ONE user action with ONE
 *     confirmation ("Berhenti berbagi semuanya"). It still only ever
 *     touches the CALLER's own `share_wealth` rows — no new grant surface,
 *     just a bulk convenience over the same `setShareWealth` mechanism.
 *   - `setTransactionHouseholdAction` and `bulkTagTransactionsAction`
 *     belong to docs/06 §5's separate "Transaksi" catalog (which already
 *     lists `setTransactionHouseholdAction`), not "Berbagi" — kept here
 *     rather than in transactions/actions.ts because they're pure
 *     thin wrappers over src/lib/services/transactions.ts's tagging
 *     functions with no transaction-editing concerns of their own.
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
