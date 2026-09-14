import { PageHeader } from '@/components/layout/page-header';
import { requireUserRecord } from '@/lib/auth/require-user';
import { toLocalDate } from '@/lib/date/timezone';
import { serializeMoney } from '@/lib/finance/money';
import {
  getTotalDebt,
  getTotalReceivable,
  getUserTimezone,
  listCounterpartyCandidates,
  listDebts,
  listReceivables,
  listWalletOptions,
} from '@/features/obligations/queries';
import { toObligationListItemClientData } from '@/features/obligations/client-types';
import { DebtsPageClient } from '@/features/obligations/components/debts-page-client';

/**
 * `/wealth/debts` — tasks/18-debts-receivables. Server Component: fetches
 * everything the tab switcher needs up front (both kinds' full lists, both
 * totals, wallets, counterparty candidates) so switching tabs is instant
 * client-side state, never a refetch — same shape as
 * src/app/(app)/settings/categories/page.tsx's `CategoriesTabs` split.
 *
 * `getUserTimezone` is resolved exactly ONCE here and threaded into both
 * `listDebts`/`listReceivables` (for `overdue`) and the page's `today` prop
 * (for `ObligationRow`'s due-date labels and `DebtsPageClient`'s section
 * partitioning) — see src/features/obligations/queries.ts's file header.
 */
export default async function DebtsPage() {
  const user = await requireUserRecord();
  const now = new Date();
  const tz = await getUserTimezone(user.id);

  const [debtRows, receivableRows, totalDebt, totalReceivable, wallets, counterpartyCandidates] = await Promise.all([
    listDebts(user.id, now, tz),
    listReceivables(user.id, now, tz),
    getTotalDebt(user.id),
    getTotalReceivable(user.id),
    listWalletOptions(user.id),
    listCounterpartyCandidates(user.id),
  ]);

  return (
    <>
      <PageHeader title="Hutang & Piutang" />
      <DebtsPageClient
        debts={debtRows.map(toObligationListItemClientData)}
        receivables={receivableRows.map(toObligationListItemClientData)}
        totalDebt={serializeMoney(totalDebt)}
        totalReceivable={serializeMoney(totalReceivable)}
        today={toLocalDate(now, tz)}
        wallets={wallets}
        defaultWalletId={user.defaultWalletId}
        counterpartyCandidates={counterpartyCandidates}
      />
    </>
  );
}
