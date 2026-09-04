import { Inbox } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import type { ActivityClientItem } from '../client-types';
import type { OwnWalletOption } from '../queries';
import { PreviousActivityRow, UnreviewedActivityCard } from './activity-card';

interface ActivityListProps {
  items: ActivityClientItem[];
  ownWallets: OwnWalletOption[];
}

/**
 * `/activity` body — docs/09-screen-specs.md §14: "Belum ditinjau" and
 * "Sebelumnya" sections, split from ONE already-fetched list
 * (`item.acknowledgedAt === null`) rather than two separate queries — it's
 * the same predicate either way (src/features/activity/queries.ts).
 */
export function ActivityList({ items, ownWallets }: ActivityListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Belum ada aktivitas"
        description="Transfer yang dicatat anggota keluarga untuk Anda akan muncul di sini."
      />
    );
  }

  const unreviewed = items.filter((item) => item.acknowledgedAt === null);
  const previous = items.filter((item) => item.acknowledgedAt !== null);

  return (
    <div className="flex flex-col gap-6">
      {unreviewed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-text-muted text-sm font-semibold">Belum ditinjau ({unreviewed.length})</h2>
          <ul className="flex flex-col gap-2">
            {unreviewed.map((item) => (
              <UnreviewedActivityCard key={item.id} item={item} ownWallets={ownWallets} />
            ))}
          </ul>
        </section>
      )}

      {previous.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="text-text-muted text-sm font-semibold">Sebelumnya</h2>
          <ul className="border-border divide-border rounded-card divide-y border px-2">
            {previous.map((item) => (
              <PreviousActivityRow key={item.id} item={item} ownWallets={ownWallets} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
