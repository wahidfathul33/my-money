/**
 * Recurring reads — `dbRead` only (docs/11-tech-architecture.md §2).
 * tasks/24-recurring-transactions/spec.md. Every function here is scoped to
 * rows OWNED by `userId` — a recurring rule is never household-shared (see
 * src/lib/services/recurring-transactions.ts's file header), so unlike
 * savings there is no separate "shared, visible to any active member" case
 * to account for.
 */
import { and, asc, eq } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { categories, recurringSavingsContributions, recurringTransactions, savingsGoals, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import type { RecurringFrequency } from '@/lib/date/recurring';
import type { Money } from '@/lib/finance/money';

export type RecurringStatus = 'active' | 'paused' | 'ended';

export interface RecurringTransactionListRow {
  id: string;
  type: 'income' | 'expense';
  amount: Money;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  walletName: string;
  frequency: RecurringFrequency;
  nextRunDate: string;
  endDate: string | null;
  status: RecurringStatus;
}

/** Every recurring transaction rule `userId` owns, for the `/settings/recurring`
 * management list — active rules first, then paused, then ended, soonest
 * `next_run_date` first within each group. */
export async function listRecurringTransactions(userId: string): Promise<RecurringTransactionListRow[]> {
  return dbRead
    .select({
      id: recurringTransactions.id,
      type: recurringTransactions.type,
      amount: recurringTransactions.amount,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      walletName: wallets.name,
      frequency: recurringTransactions.frequency,
      nextRunDate: recurringTransactions.nextRunDate,
      endDate: recurringTransactions.endDate,
      status: recurringTransactions.status,
    })
    .from(recurringTransactions)
    .innerJoin(categories, eq(categories.id, recurringTransactions.categoryId))
    .innerJoin(wallets, eq(wallets.id, recurringTransactions.walletId))
    .where(ownedBy(recurringTransactions, userId))
    .orderBy(asc(recurringTransactions.status), asc(recurringTransactions.nextRunDate));
}

export interface RecurringContributionListRow {
  id: string;
  amount: Money;
  goalId: string;
  goalName: string;
  goalIcon: string;
  goalColor: string;
  walletName: string;
  frequency: RecurringFrequency;
  nextRunDate: string;
  endDate: string | null;
  status: RecurringStatus;
}

/** Every auto-contribution rule `userId` owns (their own rules only — a
 * shared goal's OTHER member, if they also auto-contribute, has their own
 * separate row, invisible here). */
export async function listRecurringContributions(userId: string): Promise<RecurringContributionListRow[]> {
  return dbRead
    .select({
      id: recurringSavingsContributions.id,
      amount: recurringSavingsContributions.amount,
      goalId: recurringSavingsContributions.goalId,
      goalName: savingsGoals.name,
      goalIcon: savingsGoals.icon,
      goalColor: savingsGoals.color,
      walletName: wallets.name,
      frequency: recurringSavingsContributions.frequency,
      nextRunDate: recurringSavingsContributions.nextRunDate,
      endDate: recurringSavingsContributions.endDate,
      status: recurringSavingsContributions.status,
    })
    .from(recurringSavingsContributions)
    .innerJoin(savingsGoals, eq(savingsGoals.id, recurringSavingsContributions.goalId))
    .innerJoin(wallets, eq(wallets.id, recurringSavingsContributions.walletId))
    .where(ownedBy(recurringSavingsContributions, userId))
    .orderBy(asc(recurringSavingsContributions.status), asc(recurringSavingsContributions.nextRunDate));
}

/**
 * `userId`'s own ACTIVE auto-contribution rule for ONE goal, if any — backs
 * the "Kontribusi otomatis" toggle on the savings goal detail page
 * (src/features/savings/components/goal-detail-client.tsx). `null` when
 * there is none, the only rows are `ended`, or a rule exists but is
 * currently `paused` — the toggle only ever represents "currently
 * materializing"; a paused rule is managed from `/settings/recurring`
 * instead (resuming it there, rather than re-toggling here and creating a
 * second, separate rule).
 */
export async function getActiveRecurringContributionForGoal(
  userId: string,
  goalId: string,
): Promise<RecurringContributionListRow | null> {
  const [row] = await dbRead
    .select({
      id: recurringSavingsContributions.id,
      amount: recurringSavingsContributions.amount,
      goalId: recurringSavingsContributions.goalId,
      goalName: savingsGoals.name,
      goalIcon: savingsGoals.icon,
      goalColor: savingsGoals.color,
      walletName: wallets.name,
      frequency: recurringSavingsContributions.frequency,
      nextRunDate: recurringSavingsContributions.nextRunDate,
      endDate: recurringSavingsContributions.endDate,
      status: recurringSavingsContributions.status,
    })
    .from(recurringSavingsContributions)
    .innerJoin(savingsGoals, eq(savingsGoals.id, recurringSavingsContributions.goalId))
    .innerJoin(wallets, eq(wallets.id, recurringSavingsContributions.walletId))
    .where(
      and(
        eq(recurringSavingsContributions.goalId, goalId),
        ownedBy(recurringSavingsContributions, userId),
        eq(recurringSavingsContributions.status, 'active'),
      ),
    )
    .limit(1);

  return row ?? null;
}
