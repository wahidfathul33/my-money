import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { listWallets } from '@/features/wallets/queries';
import { toWalletClientData } from '@/features/wallets/client-types';
import { serializeMoney } from '@/lib/finance/money';
import { WalletsPageClient } from '@/features/wallets/components/wallets-page-client';

/**
 * `/wallets` — tasks/05-wallets/spec.md: "Daftar dompet dikelompokkan per
 * jenis, dengan total per kelompok; kartu kredit dikelompokkan terpisah
 * berlabel 'Liabilitas'." Fetches server-side via `listWallets` (dbRead,
 * ownedBy-scoped — src/features/wallets/queries.ts) and hands the interactive
 * parts (create sheet, reorder, archive) to a Client Component boundary,
 * serializing every `Money`/bigint field first (see client-types.ts).
 */
export default async function WalletsPage() {
  const user = await requireUser();
  const { groups, archived, totalCash, totalCreditCardLiability } = await listWallets(user.id);

  return (
    <>
      <PageHeader title="Dompet" />
      <WalletsPageClient
        groups={groups.map((g) => ({
          type: g.type,
          label: g.label,
          wallets: g.wallets.map(toWalletClientData),
          total: serializeMoney(g.total),
        }))}
        archived={archived.map(toWalletClientData)}
        totalCash={serializeMoney(totalCash)}
        totalCreditCardLiability={serializeMoney(totalCreditCardLiability)}
      />
    </>
  );
}
