/**
 * Wire-safe budget shapes for crossing the Server → Client Component
 * boundary — same rationale as src/features/wallets/client-types.ts: RSC
 * flight serialization doesn't support `bigint`, so every `Money` field is
 * serialized to a string before being handed to a `'use client'` component.
 */
import { serializeMoney } from '@/lib/finance/money';
import type { BudgetStatus } from '@/lib/finance/budget';
import type { HouseholdBudgetView, MemberSpentView, PersonalBudgetView } from './queries';

export interface PersonalBudgetClientData {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  amount: string;
  spent: string;
  status: BudgetStatus;
  percent: number;
  isRecurring: boolean;
}

export function toPersonalBudgetClientData(budget: PersonalBudgetView): PersonalBudgetClientData {
  return {
    id: budget.id,
    categoryId: budget.categoryId,
    categoryName: budget.categoryName,
    categoryIcon: budget.categoryIcon,
    categoryColor: budget.categoryColor,
    amount: serializeMoney(budget.amount),
    spent: serializeMoney(budget.spent),
    status: budget.status,
    percent: budget.percent,
    isRecurring: budget.isRecurring,
  };
}

export interface MemberSpentClientData {
  userId: string;
  name: string;
  spent: string;
}

function toMemberSpentClientData(member: MemberSpentView): MemberSpentClientData {
  return { userId: member.userId, name: member.name, spent: serializeMoney(member.spent) };
}

export interface HouseholdBudgetClientData {
  id: string;
  categoryKey: string;
  categoryLabel: string;
  categoryIcon: string;
  categoryColor: string;
  amount: string;
  spent: string;
  status: BudgetStatus;
  percent: number;
  isRecurring: boolean;
  byMember: MemberSpentClientData[];
}

export function toHouseholdBudgetClientData(budget: HouseholdBudgetView): HouseholdBudgetClientData {
  return {
    id: budget.id,
    categoryKey: budget.categoryKey,
    categoryLabel: budget.categoryLabel,
    categoryIcon: budget.categoryIcon,
    categoryColor: budget.categoryColor,
    amount: serializeMoney(budget.amount),
    spent: serializeMoney(budget.spent),
    status: budget.status,
    percent: budget.percent,
    isRecurring: budget.isRecurring,
    byMember: budget.byMember.map(toMemberSpentClientData),
  };
}
