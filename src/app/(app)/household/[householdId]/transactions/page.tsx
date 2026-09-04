import { Receipt } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/require-user';
import { listActiveMembers } from '@/features/household/queries';
import {
  hasAnyHouseholdTransaction,
  listHouseholdTransactionsPage,
} from '@/features/sharing/household-transactions-queries';
import { toHouseholdTransactionClientItem } from '@/features/sharing/household-transactions-client-types';
import { MemberFilterChips } from '@/features/sharing/components/member-filter-chips';
import { HouseholdTransactionList } from '@/features/sharing/components/household-transaction-list';

/**
 * `/household/[id]/transactions` — the household expenses page,
 * tasks/12-sharing-and-privacy spec.md: "Halaman pengeluaran keluarga
 * menampilkan transaksi bertanda dari semua anggota, dengan nama pembayar"
 * and "Halaman itu TIDAK menampilkan saldo dompet siapa pun."
 *
 * Doesn't re-verify membership itself — the layout above this segment
 * (src/app/(app)/household/[householdId]/layout.tsx) already 404s a
 * non-member before this page ever renders, same convention as every other
 * page under `/household/[id]/**`. `GET /api/households/[id]/transactions`
 * (used by the infinite-scroll continuation) re-verifies independently,
 * since nothing guards routes under `/api/**`.
 */
interface HouseholdTransactionsPageProps {
  params: Promise<{ householdId: string }>;
  // `memberId` — docs/06-api-contracts.md §6's documented param name for
  // this same filter on GET /api/households/[id]/transactions; kept
  // identical here so the URL a user can bookmark/share matches what the
  // "load more" continuation (same param, client-side) already sends.
  searchParams: Promise<{ memberId?: string }>;
}

export default async function HouseholdTransactionsPage({
  params,
  searchParams,
}: HouseholdTransactionsPageProps) {
  const { householdId } = await params;
  const { memberId } = await searchParams;
  await requireUser();

  const [members, { items, nextCursor }, hasAny] = await Promise.all([
    listActiveMembers(householdId),
    listHouseholdTransactionsPage(householdId, { memberUserId: memberId }),
    hasAnyHouseholdTransaction(householdId),
  ]);

  const memberOptions = members.map((m) => ({ userId: m.userId, name: m.name ?? m.email }));

  return (
    <>
      <PageHeader title="Pengeluaran Keluarga" />
      <div className="flex flex-col gap-3 pb-8">
        <MemberFilterChips members={memberOptions} selectedUserId={memberId} />

        {items.length === 0 ? (
          !hasAny ? (
            <EmptyState
              icon={Receipt}
              title="Belum ada pengeluaran keluarga"
              description="Tandai transaksi dengan 🏠 saat mencatat, atau tandai transaksi lama yang sudah ada."
              action={
                <Button variant="secondary" asChild>
                  <Link href="/transactions">Tandai transaksi lama</Link>
                </Button>
              }
              className="px-page-x"
            />
          ) : (
            <EmptyState
              icon={Receipt}
              title="Tidak ada transaksi"
              description="Anggota ini belum menandai pengeluaran ke keluarga."
              className="px-page-x"
            />
          )
        ) : (
          <div className="px-page-x">
            <HouseholdTransactionList
              householdId={householdId}
              initialItems={items.map(toHouseholdTransactionClientItem)}
              initialNextCursor={nextCursor}
              memberUserId={memberId}
            />
          </div>
        )}
      </div>
    </>
  );
}
