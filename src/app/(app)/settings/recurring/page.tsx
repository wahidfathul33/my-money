import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { listRecurringContributions, listRecurringTransactions } from '@/features/recurring/queries';
import { toRecurringContributionClientData, toRecurringTransactionClientData } from '@/features/recurring/client-types';
import { RecurringList } from '@/features/recurring/components/recurring-list';

/**
 * `/settings/recurring` — tasks/24-recurring-transactions/spec.md. Lists
 * every recurring rule (transactions + auto-contributions) the caller
 * owns, combined into one view/pause/resume/delete list. Creating a NEW
 * rule happens from where the money movement itself is set up — the
 * "Ulangi transaksi ini" toggle in the Add Transaction sheet, and
 * "Kontribusi otomatis" on a savings goal's detail page — not from this
 * page, which is management-only.
 */
export default async function RecurringSettingsPage() {
  const user = await requireUser();

  const [transactions, contributions] = await Promise.all([
    listRecurringTransactions(user.id),
    listRecurringContributions(user.id),
  ]);

  return (
    <>
      <PageHeader
        title="Transaksi Rutin"
        description="Kelola transaksi dan kontribusi tabungan yang tercatat otomatis."
      />
      <div className="px-page-x pb-8">
        <RecurringList
          transactions={transactions.map(toRecurringTransactionClientData)}
          contributions={contributions.map(toRecurringContributionClientData)}
        />
      </div>
    </>
  );
}
