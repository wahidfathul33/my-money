/**
 * Wire-safe savings shapes for crossing the Server → Client Component
 * boundary — same reasoning as src/features/wallets/client-types.ts's file
 * header: RSC flight serialization can't carry a raw `bigint`, so every
 * `Money` field here is a `serializeMoney`'d string, and every client
 * component in this feature takes one of these, never the raw row types
 * from src/features/savings/queries.ts.
 */
import { serializeMoney } from '@/lib/finance/money';
import type {
  ContributionHistoryItem,
  MemberContributionTotal,
  SavingsGoalDetail,
  SavingsGoalListItem,
} from './queries';

export interface SavingsGoalListItemClientData {
  id: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string | null;
  status: 'active' | 'completed' | 'archived';
  icon: string;
  color: string;
  householdId: string | null;
  householdName: string | null;
}

export function toGoalListClientData(goal: SavingsGoalListItem): SavingsGoalListItemClientData {
  return {
    ...goal,
    targetAmount: serializeMoney(goal.targetAmount),
    currentAmount: serializeMoney(goal.currentAmount),
  };
}

export interface SavingsGoalDetailClientData {
  id: string;
  userId: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string | null;
  status: 'active' | 'completed' | 'archived';
  icon: string;
  color: string;
  householdId: string | null;
  householdName: string | null;
  activeMemberCount: number | null;
}

export function toGoalDetailClientData(goal: SavingsGoalDetail): SavingsGoalDetailClientData {
  return {
    ...goal,
    targetAmount: serializeMoney(goal.targetAmount),
    currentAmount: serializeMoney(goal.currentAmount),
  };
}

export interface ContributionHistoryItemClientData {
  id: string;
  userId: string;
  contributorName: string | null;
  contributorImage: string | null;
  amount: string;
  contributionDate: string; // ISO — Date also isn't RSC-safe as a plain prop across some boundaries; string is unambiguous.
  note: string | null;
  walletId: string;
}

export function toContributionClientData(row: ContributionHistoryItem): ContributionHistoryItemClientData {
  return {
    ...row,
    amount: serializeMoney(row.amount),
    contributionDate: row.contributionDate.toISOString(),
  };
}

export interface MemberContributionTotalClientData {
  userId: string;
  name: string | null;
  image: string | null;
  total: string;
}

export function toMemberTotalClientData(row: MemberContributionTotal): MemberContributionTotalClientData {
  return { ...row, total: serializeMoney(row.total) };
}
