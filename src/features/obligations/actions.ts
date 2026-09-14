'use server';

/**
 * Debts/receivables Server Actions — thin adapters only
 * (docs/11-tech-architecture.md §2/§3): `requireUser()` first, parse with
 * Zod, delegate to src/lib/services/obligations.ts, revalidate.
 *
 * Two calling shapes, matching the rest of the codebase:
 *  - `create*Action`/`update*Action` are `useActionState`-shaped
 *    (`(prevState, formData)`) — ordinary text/date form fields, same as
 *    src/features/savings/actions.ts's `createGoalAction`.
 *  - `record*PaymentAction` takes a plain typed object and is called
 *    directly from a `useTransition` handler — the amount comes from
 *    `<AmountKeypad>`, already evaluated client-side, same shape as
 *    `contributeAction`.
 *  - `writeOff*Action` takes a plain id — same shape as `archiveGoalAction`.
 *
 * docs/06-api-contracts.md §5's "Hutang & Piutang" catalog: `createDebtAction`
 * · `recordDebtPaymentAction` · `writeOffDebtAction` · "dan tiga padanannya
 * untuk piutang" — `updateDebtAction`/`updateReceivableAction` are this
 * module's own addition beyond that count, needed because todo.md's Server
 * Action section explicitly lists them too ("updateDebtAction").
 */
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import {
  createDebt,
  createReceivable,
  recordDebtPayment,
  recordReceivablePayment,
  updateDebt,
  updateReceivable,
  writeOffDebt,
  writeOffReceivable,
} from '@/lib/services/obligations';
import { deserializeMoney, fromRupiah } from '@/lib/finance/money';
import { AppError, ValidationError } from '@/lib/api/errors';
import {
  createDebtSchema,
  createReceivableSchema,
  debtIdSchema,
  receivableIdSchema,
  recordDebtPaymentSchema,
  recordReceivablePaymentSchema,
  updateDebtSchema,
  updateReceivableSchema,
} from './schema';

export interface ActionState {
  error: string | null;
  id?: string;
}

export interface PaymentActionResult {
  error: string | null;
  paymentId?: string;
}

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

function toPaymentActionError(err: unknown): PaymentActionResult {
  const { error } = toActionError(err);
  return { error };
}

/** docs/06-api-contracts.md §10's "Hutang / Piutang" row exactly: `/`,
 * `/wealth`, `/wealth/debts`, `/wealth/net-worth` — every mutation here
 * changes net worth (directly for a payment/write-off, or by creating a
 * fresh liability/receivable), and docs §10 is explicit that a net-worth-
 * changing mutation ALWAYS revalidates `/` and `/wealth/net-worth`. */
function revalidateObligations(): void {
  revalidatePath('/');
  revalidatePath('/wealth');
  revalidatePath('/wealth/debts');
  revalidatePath('/wealth/net-worth');
}

function parseMoneyField(raw: string, field: string): bigint {
  try {
    return fromRupiah(raw);
  } catch {
    throw new ValidationError({ [field]: ['Nominal tidak valid'] });
  }
}

// ---------------------------------------------------------------------------
// Debts
// ---------------------------------------------------------------------------

export async function createDebtAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const parsed = createDebtSchema.safeParse({
    creditorName: formData.get('creditorName'),
    counterpartyUserId: (formData.get('counterpartyUserId') as string | null) || null,
    initialAmount: formData.get('initialAmount'),
    startDate: formData.get('startDate'),
    dueDate: (formData.get('dueDate') as string | null) || undefined,
    affectsWallet: formData.get('affectsWallet'),
    walletId: (formData.get('walletId') as string | null) || null,
    note: (formData.get('note') as string | null) ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    const debt = await createDebt(user.id, {
      creditorName: parsed.data.creditorName,
      counterpartyUserId: parsed.data.counterpartyUserId,
      initialAmount: parseMoneyField(parsed.data.initialAmount, 'initialAmount'),
      startDate: parsed.data.startDate,
      dueDate: parsed.data.dueDate,
      affectsWallet: parsed.data.affectsWallet,
      walletId: parsed.data.walletId,
      note: parsed.data.note,
    });
    revalidateObligations();
    return { error: null, id: debt.id };
  } catch (err) {
    return toActionError(err);
  }
}

export async function updateDebtAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const parsed = updateDebtSchema.safeParse({
    debtId: formData.get('debtId'),
    creditorName: formData.get('creditorName'),
    counterpartyUserId: (formData.get('counterpartyUserId') as string | null) || null,
    initialAmount: formData.get('initialAmount'),
    dueDate: (formData.get('dueDate') as string | null) || undefined,
    note: (formData.get('note') as string | null) ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    const debt = await updateDebt(user.id, parsed.data.debtId, {
      creditorName: parsed.data.creditorName,
      counterpartyUserId: parsed.data.counterpartyUserId,
      initialAmount: parseMoneyField(parsed.data.initialAmount, 'initialAmount'),
      dueDate: parsed.data.dueDate,
      note: parsed.data.note,
    });
    revalidateObligations();
    return { error: null, id: debt.id };
  } catch (err) {
    return toActionError(err);
  }
}

export interface RecordDebtPaymentActionInput {
  debtId: string;
  /** Already-evaluated minor-unit digit string — see this module's file header. */
  amount: string;
  walletId: string;
  paymentDate: string;
  note: string | null;
  idempotencyKey: string;
}

export async function recordDebtPaymentAction(input: RecordDebtPaymentActionInput): Promise<PaymentActionResult> {
  const user = await requireUser();

  const parsed = recordDebtPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    const payment = await recordDebtPayment(user.id, parsed.data.debtId, {
      amount: deserializeMoney(parsed.data.amount),
      walletId: parsed.data.walletId,
      paymentDate: parsed.data.paymentDate,
      note: parsed.data.note,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidateObligations();
    return { error: null, paymentId: payment.id };
  } catch (err) {
    return toPaymentActionError(err);
  }
}

export async function writeOffDebtAction(debtId: string): Promise<ActionState> {
  const user = await requireUser();
  const parsed = debtIdSchema.safeParse({ debtId });
  if (!parsed.success) return { error: 'Hutang tidak valid' };

  try {
    const debt = await writeOffDebt(user.id, parsed.data.debtId);
    revalidateObligations();
    return { error: null, id: debt.id };
  } catch (err) {
    return toActionError(err);
  }
}

// ---------------------------------------------------------------------------
// Receivables — exact mirror of the debt actions above.
// ---------------------------------------------------------------------------

export async function createReceivableAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const parsed = createReceivableSchema.safeParse({
    debtorName: formData.get('debtorName'),
    counterpartyUserId: (formData.get('counterpartyUserId') as string | null) || null,
    initialAmount: formData.get('initialAmount'),
    startDate: formData.get('startDate'),
    dueDate: (formData.get('dueDate') as string | null) || undefined,
    affectsWallet: formData.get('affectsWallet'),
    walletId: (formData.get('walletId') as string | null) || null,
    note: (formData.get('note') as string | null) ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    const receivable = await createReceivable(user.id, {
      debtorName: parsed.data.debtorName,
      counterpartyUserId: parsed.data.counterpartyUserId,
      initialAmount: parseMoneyField(parsed.data.initialAmount, 'initialAmount'),
      startDate: parsed.data.startDate,
      dueDate: parsed.data.dueDate,
      affectsWallet: parsed.data.affectsWallet,
      walletId: parsed.data.walletId,
      note: parsed.data.note,
    });
    revalidateObligations();
    return { error: null, id: receivable.id };
  } catch (err) {
    return toActionError(err);
  }
}

export async function updateReceivableAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const parsed = updateReceivableSchema.safeParse({
    receivableId: formData.get('receivableId'),
    debtorName: formData.get('debtorName'),
    counterpartyUserId: (formData.get('counterpartyUserId') as string | null) || null,
    initialAmount: formData.get('initialAmount'),
    dueDate: (formData.get('dueDate') as string | null) || undefined,
    note: (formData.get('note') as string | null) ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    const receivable = await updateReceivable(user.id, parsed.data.receivableId, {
      debtorName: parsed.data.debtorName,
      counterpartyUserId: parsed.data.counterpartyUserId,
      initialAmount: parseMoneyField(parsed.data.initialAmount, 'initialAmount'),
      dueDate: parsed.data.dueDate,
      note: parsed.data.note,
    });
    revalidateObligations();
    return { error: null, id: receivable.id };
  } catch (err) {
    return toActionError(err);
  }
}

export interface RecordReceivablePaymentActionInput {
  receivableId: string;
  amount: string;
  walletId: string;
  paymentDate: string;
  note: string | null;
  idempotencyKey: string;
}

export async function recordReceivablePaymentAction(
  input: RecordReceivablePaymentActionInput,
): Promise<PaymentActionResult> {
  const user = await requireUser();

  const parsed = recordReceivablePaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }

  try {
    const payment = await recordReceivablePayment(user.id, parsed.data.receivableId, {
      amount: deserializeMoney(parsed.data.amount),
      walletId: parsed.data.walletId,
      paymentDate: parsed.data.paymentDate,
      note: parsed.data.note,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidateObligations();
    return { error: null, paymentId: payment.id };
  } catch (err) {
    return toPaymentActionError(err);
  }
}

export async function writeOffReceivableAction(receivableId: string): Promise<ActionState> {
  const user = await requireUser();
  const parsed = receivableIdSchema.safeParse({ receivableId });
  if (!parsed.success) return { error: 'Piutang tidak valid' };

  try {
    const receivable = await writeOffReceivable(user.id, parsed.data.receivableId);
    revalidateObligations();
    return { error: null, id: receivable.id };
  } catch (err) {
    return toActionError(err);
  }
}
