'use server';

/**
 * Savings Server Actions — thin adapters only (docs/11-tech-architecture.md
 * §2/§3): `requireUser()` first, parse with Zod, delegate to
 * src/lib/services/savings.ts, revalidate.
 *
 * Two calling shapes, matching the rest of the codebase:
 *  - `createGoalAction`/`updateGoalAction` are `useActionState`-shaped
 *    (`(prevState, formData)`) — ordinary text/date form fields, same as
 *    src/features/wallets/actions.ts's `createWalletAction`.
 *  - `contributeAction`/`withdrawAction` take a plain typed object and are
 *    called directly from a `useTransition` handler — the amount comes from
 *    `<AmountKeypad>`, already evaluated client-side, same shape as
 *    src/features/transfers/actions.ts's `createSelfTransferAction`.
 *  - `archiveGoalAction` takes a plain `goalId` — same shape as
 *    src/features/wallets/actions.ts's `archiveWalletAction`.
 */
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import {
  archiveGoal,
  contribute,
  createGoal,
  updateGoal,
  withdraw,
  type SavingsContributionRow,
} from '@/lib/services/savings';
import { deserializeMoney, fromRupiah } from '@/lib/finance/money';
import { AppError, ValidationError } from '@/lib/api/errors';
import {
  contributeSchema,
  createGoalSchema,
  goalIdSchema,
  updateGoalSchema,
  withdrawSchema,
} from './schema';

export interface ActionState {
  error: string | null;
  goalId?: string;
}

export interface ContributionActionResult {
  error: string | null;
  contribution?: SavingsContributionRow;
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

function toContributionActionError(err: unknown): ContributionActionResult {
  const { error } = toActionError(err);
  return { error };
}

/** Every route whose numbers a contribution/withdrawal/goal edit can
 * change. `householdId` additionally revalidates the shared-goal routes
 * (todo.md: "revalidatePath termasuk rute household untuk goal bersama"). */
function revalidateSavings(goalId: string, householdId: string | null): void {
  revalidatePath('/wealth/savings');
  revalidatePath(`/wealth/savings/${goalId}`);
  revalidatePath('/'); // dashboard savings summary
  revalidatePath('/wallets'); // contribution/withdrawal moves a wallet balance
  if (householdId) {
    revalidatePath(`/household/${householdId}/savings`);
    revalidatePath(`/household/${householdId}`);
  }
}

export async function createGoalAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const parsed = createGoalSchema.safeParse({
    name: formData.get('name'),
    targetAmount: formData.get('targetAmount'),
    targetDate: (formData.get('targetDate') as string | null) || undefined,
    householdId: (formData.get('householdId') as string | null) || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  let targetAmount: bigint;
  try {
    targetAmount = fromRupiah(parsed.data.targetAmount);
  } catch {
    return { error: 'Nominal target tidak valid' };
  }

  try {
    const goal = await createGoal(user.id, {
      name: parsed.data.name,
      targetAmount,
      targetDate: parsed.data.targetDate,
      householdId: parsed.data.householdId,
    });
    revalidateSavings(goal.id, goal.householdId);
    return { error: null, goalId: goal.id };
  } catch (err) {
    return toActionError(err);
  }
}

export async function updateGoalAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const parsed = updateGoalSchema.safeParse({
    goalId: formData.get('goalId'),
    name: formData.get('name'),
    targetAmount: formData.get('targetAmount'),
    targetDate: (formData.get('targetDate') as string | null) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  let targetAmount: bigint;
  try {
    targetAmount = fromRupiah(parsed.data.targetAmount);
  } catch {
    return { error: 'Nominal target tidak valid' };
  }

  try {
    const goal = await updateGoal(user.id, parsed.data.goalId, {
      name: parsed.data.name,
      targetAmount,
      targetDate: parsed.data.targetDate,
    });
    revalidateSavings(goal.id, goal.householdId);
    return { error: null, goalId: goal.id };
  } catch (err) {
    return toActionError(err);
  }
}

export async function archiveGoalAction(goalId: string): Promise<ActionState> {
  const user = await requireUser();
  const parsed = goalIdSchema.safeParse({ goalId });
  if (!parsed.success) return { error: 'Goal tidak valid' };

  try {
    const goal = await archiveGoal(user.id, parsed.data.goalId);
    revalidateSavings(goal.id, goal.householdId);
    return { error: null, goalId: goal.id };
  } catch (err) {
    return toActionError(err);
  }
}

export interface ContributeActionInput {
  goalId: string;
  /** `null` if the goal is personal — the client already knows this from
   * the goal it loaded, sparing a re-fetch just for revalidation. */
  goalHouseholdId: string | null;
  walletId: string;
  /** Already-evaluated minor-unit digit string — see this module's file header. */
  amount: string;
  contributionDate: Date;
  note: string | null;
  idempotencyKey: string;
}

export async function contributeAction(input: ContributeActionInput): Promise<ContributionActionResult> {
  const user = await requireUser();

  const parsed = contributeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    const contribution = await contribute(user.id, parsed.data.goalId, {
      walletId: parsed.data.walletId,
      amount: deserializeMoney(parsed.data.amount),
      contributionDate: parsed.data.contributionDate,
      note: parsed.data.note,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidateSavings(parsed.data.goalId, input.goalHouseholdId);
    return { error: null, contribution };
  } catch (err) {
    return toContributionActionError(err);
  }
}

export interface WithdrawActionInput {
  goalId: string;
  goalHouseholdId: string | null;
  walletId: string;
  amount: string;
  withdrawalDate: Date;
  note: string | null;
  idempotencyKey: string;
}

export async function withdrawAction(input: WithdrawActionInput): Promise<ContributionActionResult> {
  const user = await requireUser();

  const parsed = withdrawSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    const withdrawal = await withdraw(user.id, parsed.data.goalId, {
      walletId: parsed.data.walletId,
      amount: deserializeMoney(parsed.data.amount),
      withdrawalDate: parsed.data.withdrawalDate,
      note: parsed.data.note,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidateSavings(parsed.data.goalId, input.goalHouseholdId);
    return { error: null, contribution: withdrawal };
  } catch (err) {
    return toContributionActionError(err);
  }
}
