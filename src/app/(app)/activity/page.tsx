import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { listActivity, listOwnWalletOptions } from '@/features/activity/queries';
import { toActivityClientItem } from '@/features/activity/client-types';
import { ActivityList } from '@/features/activity/components/activity-list';
import { listUserHouseholds } from '@/features/household/queries';

/**
 * `/activity` — docs/09-screen-specs.md §14, tasks/13-transfers-member.
 * todo.md "Halaman & lencana tersembunyi bila user tanpa household" — NOT
 * just the nav entry (src/components/layout/nav-items.ts): direct
 * navigation here without a household 404s too, same convention as every
 * other household-gated route (`notFound()`, never a bare redirect —
 * docs/12-security-and-auth.md §3's "NotFoundError, never ForbiddenError"
 * reasoning applies here too, even though this page isn't scoped to one
 * specific household the way `/household/[id]/**` is: `listActivity` is
 * userId-scoped regardless, so this guard is about matching the OTHER
 * household surfaces' behavior, not about hiding a real data leak.
 */
export default async function ActivityPage() {
  const user = await requireUser();

  const households = await listUserHouseholds(user.id);
  if (households.length === 0) notFound();

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
