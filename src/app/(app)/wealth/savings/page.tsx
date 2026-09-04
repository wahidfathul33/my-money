import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { getTotalSavings, listGoals } from '@/features/savings/queries';
import { toGoalListClientData } from '@/features/savings/client-types';
import { serializeMoney } from '@/lib/finance/money';
import { listUserHouseholds } from '@/features/household/queries';
import { SavingsListClient } from '@/features/savings/components/savings-list-client';

/**
 * `/wealth/savings` — personal + shared goals in one list (tasks/15-savings-goals
 * spec.md acceptance: "CRUD goal pribadi dan bersama"). `listUserHouseholds`
 * feeds the create sheet's "Untuk: Pribadi / <household>" picker — a user
 * with no households sees just "Pribadi", same "reserve now, unlock later"
 * shape as every other household-aware entry point in this app.
 */
export default async function SavingsPage() {
  const user = await requireUser();

  const [goals, totalSaved, households] = await Promise.all([
    listGoals(user.id),
    getTotalSavings(user.id),
    listUserHouseholds(user.id),
  ]);

  return (
    <>
      <PageHeader title="Tabungan" />
      <SavingsListClient
        goals={goals.map(toGoalListClientData)}
        totalSaved={serializeMoney(totalSaved)}
        households={households.map((h) => ({ id: h.id, name: h.name }))}
      />
    </>
  );
}
