import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { getDeposit, listWalletOptions } from '@/features/assets/deposits/queries';
import { toDepositDetailClientData } from '@/features/assets/deposits/client-types';
import { DepositDetailClient } from '@/features/assets/deposits/components/deposit-detail-client';

/**
 * `/wealth/assets/deposits/[id]` — `getDeposit` already scopes visibility to
 * the caller (src/features/assets/deposits/queries.ts), so this page just
 * 404s on `null` — same "not found, never forbidden" shape as every other
 * detail page in this codebase (e.g. `/wealth/savings/[id]`).
 */
export default async function DepositDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const deposit = await getDeposit(user.id, id);
  if (!deposit) notFound();

  const wallets = await listWalletOptions(user.id);

  return (
    <>
      <PageHeader title={deposit.bankName} />
      <DepositDetailClient deposit={toDepositDetailClientData(deposit)} wallets={wallets} />
    </>
  );
}
