import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { listActivity, listOwnWalletOptions } from '@/features/activity/queries';
import { toActivityClientItem } from '@/features/activity/client-types';
import { ActivityList } from '@/features/activity/components/activity-list';

/**
 * `/activity` — docs/09-screen-specs.md §14, tasks/13-transfers-member.
 * Not gated behind a household guard the way `/household/[id]/**` is: this
 * page isn't scoped to any ONE household, and `listActivity` naturally
 * returns an empty list for a user with no household at all (nobody could
 * have written into their ledger) — the empty state IS the "you don't have
 * this" response, same as `/transactions` for a brand new user. What DOES
 * stay conditional is the nav entry pointing here at all
 * (src/components/layout/nav-items.ts, docs/09 §14: "Halaman ini tidak
 * muncul di navigasi bila pengguna tidak punya household").
 */
export default async function ActivityPage() {
  const user = await requireUser();

  const [items, ownWallets] = await Promise.all([listActivity(user.id), listOwnWalletOptions(user.id)]);

  return (
    <>
      <PageHeader title="Aktivitas" />
      <div className="px-page-x pb-8">
        <ActivityList items={items.map(toActivityClientItem)} ownWallets={ownWallets} />
      </div>
    </>
  );
}
