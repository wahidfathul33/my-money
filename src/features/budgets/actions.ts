'use server';

/**
 * Server Actions for the budgets feature. `requireUser()` first in every
 * one (docs/12-security-and-auth.md §3 — `proxy.ts` doesn't protect Server
 * Actions). Each delegates to src/lib/services/budgets.ts, which
 * re-verifies ownership/membership INSIDE its own `dbWrite.transaction(...)`.
 *
 * ONE `upsertBudgetAction` handles both scopes (docs/06-api-contracts.md §5
 * lists no separate household variant) — `scope` in the FormData picks
 * which Zod schema and which service function to call, mirroring
 * `budget_scope_exclusive`'s own either/or.
 */
import { revalidatePath } from 'next/cache';
import { fromRupiah } from '@/lib/finance/money';
import { requireUser } from '@/lib/auth/require-user';
import { AppError, ValidationError } from '@/lib/api/errors';
import { deleteBudget, upsertHouseholdBudget, upsertPersonalBudget } from '@/lib/services/budgets';
import { deleteBudgetSchema, upsertHouseholdBudgetSchema, upsertPersonalBudgetSchema } from './schema';

export interface ActionState {
  error: string | null;
}

const OK: ActionState = { error: null };

/** Turns a thrown domain error into user-facing copy — docs/08-copywriting.md
 * §5.7 ("jangan pernah menampilkan pesan teknis"), same convention as
 * src/features/wallets/actions.ts's `toActionError`. */
function toActionError(err: unknown): ActionState {
  if (err instanceof ValidationError) {
    return { error: Object.values(err.fields)[0]?.[0] ?? 'Validasi gagal' };
  }
  if (err instanceof AppError) {
    return { error: err.message };
  }
  throw err;
}

/** todo.md "Server Action": `revalidatePath('/budgets')`, `'/'`,
 * `'/household/[id]/budgets'`. `'/'` is included even though the dashboard's
 * budget card doesn't exist yet (task 20) — same forward-compatible
 * revalidation src/features/wallets/actions.ts already does for its own
 * still-placeholder dashboard tile. */
function revalidateBudgets(householdId?: string): void {
  revalidatePath('/budgets');
  revalidatePath('/');
  if (householdId) revalidatePath(`/household/${householdId}/budgets`);
}

function parseAmount(raw: string): { amount: bigint } | { error: string } {
  try {
    const amount = fromRupiah(raw);
    return { amount };
  } catch {
    return { error: 'Nominal tidak valid' };
  }
}

async function upsertPersonal(user: { id: string }, formData: FormData): Promise<ActionState> {
  const parsed = upsertPersonalBudgetSchema.safeParse({
    scope: 'personal',
    categoryId: formData.get('categoryId'),
    amount: formData.get('amount'),
    period: formData.get('period'),
    isRecurring: formData.get('isRecurring'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  const amountResult = parseAmount(parsed.data.amount);
  if ('error' in amountResult) return amountResult;

  try {
    await upsertPersonalBudget(user.id, {
      categoryId: parsed.data.categoryId,
      amount: amountResult.amount,
      period: parsed.data.period,
      isRecurring: parsed.data.isRecurring,
    });
  } catch (err) {
    return toActionError(err);
  }

  revalidateBudgets();
  return OK;
}

async function upsertHousehold(user: { id: string }, formData: FormData): Promise<ActionState> {
  const parsed = upsertHouseholdBudgetSchema.safeParse({
    scope: 'household',
    householdId: formData.get('householdId'),
    categoryKey: formData.get('categoryKey'),
    amount: formData.get('amount'),
    period: formData.get('period'),
    isRecurring: formData.get('isRecurring'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  const amountResult = parseAmount(parsed.data.amount);
  if ('error' in amountResult) return amountResult;

  try {
    await upsertHouseholdBudget(user.id, parsed.data.householdId, {
      categoryKey: parsed.data.categoryKey,
      amount: amountResult.amount,
      period: parsed.data.period,
      isRecurring: parsed.data.isRecurring,
    });
  } catch (err) {
    return toActionError(err);
  }

  revalidateBudgets(parsed.data.householdId);
  return OK;
}

export async function upsertBudgetAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  return formData.get('scope') === 'household' ? upsertHousehold(user, formData) : upsertPersonal(user, formData);
}

/** Plain (non-form) action — triggered by a button, same shape as
 * src/features/wallets/actions.ts's `archiveWalletAction`. `householdId` is
 * optional and only present when deleting from the household budgets page,
 * so the extra revalidation only fires there. */
export async function deleteBudgetAction(budgetId: string, householdId?: string): Promise<ActionState> {
  const user = await requireUser();
  const parsed = deleteBudgetSchema.safeParse({ budgetId });
  if (!parsed.success) return { error: 'ID budget tidak valid' };

  try {
    await deleteBudget(user.id, parsed.data.budgetId);
  } catch (err) {
    return toActionError(err);
  }

  revalidateBudgets(householdId);
  return OK;
}
