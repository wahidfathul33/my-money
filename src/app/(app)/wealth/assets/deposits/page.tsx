import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { getTotalDepositValue, listDeposits, listWalletOptions } from '@/features/assets/deposits/queries';
import { toDepositListClientData } from '@/features/assets/deposits/client-types';
import { resolveDefaultWalletId } from '@/features/transactions/queries';
import { serializeMoney } from '@/lib/finance/money';
import { DepositsListClient } from '@/features/assets/deposits/components/deposits-list-client';

/**
 * `/wealth/assets/deposits` — tasks/17-assets-deposits spec.md acceptance:
 * "daftar kartu + total pokok". `getTotalDepositValue` sums PRINCIPAL of
 * `active` deposits only (docs/03 §14.1) — never accrued interest, per
 * ADR-013.
 */
export default async function DepositsPage() {
  const user = await requireUser();

  const [deposits, totalPrincipal, wallets, defaultWalletId] = await Promise.all([
    listDeposits(user.id),
    getTotalDepositValue(user.id),
    listWalletOptions(user.id),
    resolveDefaultWalletId(user.id),
  ]);

  return (
    <>
      <PageHeader title="Deposito" />
      <DepositsListClient
        deposits={deposits.map(toDepositListClientData)}
        totalPrincipal={serializeMoney(totalPrincipal)}
        wallets={wallets}
        defaultWalletId={defaultWalletId}
      />
    </>
  );
}
