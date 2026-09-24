'use client';

/**
 * "Chip filter Anggota" (todo.md) — narrows the household expenses list to
 * one member's own transactions via the `?memberId=` URL param (matching
 * docs/06-api-contracts.md §6's documented param name for
 * `GET /api/households/[id]/transactions`), mirroring
 * src/features/transactions/components/filter-bar.tsx's chip-into-URL
 * pattern (`router.replace`, never `push`, so toggling a filter doesn't
 * pollute back-button history).
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { Chip } from '@/components/ui/chip';

export interface MemberFilterOption {
  userId: string;
  name: string;
}

interface MemberFilterChipsProps {
  members: MemberFilterOption[];
  selectedUserId?: string;
}

export function MemberFilterChips({ members, selectedUserId }: MemberFilterChipsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function select(userId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (userId) params.set('memberId', userId);
    else params.delete('memberId');
    const qs = params.toString();
    // startTransition + isPending below — same reasoning as
    // src/features/transactions/use-history-filters.ts: this navigation
    // re-fetches the list from the server, and without SOME feedback the
    // tap just looks ignored until the page suddenly swaps.
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto px-page-x pb-1"
      role="group"
      aria-label="Filter anggota"
      aria-busy={isPending || undefined}
    >
      <Chip variant="filter" selected={!selectedUserId} onClick={() => select(null)} disabled={isPending}>
        Semua
      </Chip>
      {members.map((member) => (
        <Chip
          key={member.userId}
          variant="filter"
          selected={selectedUserId === member.userId}
          onClick={() => select(member.userId)}
          disabled={isPending}
        >
          {member.name}
        </Chip>
      ))}
      {isPending && (
        <Loader2 className="text-text-muted size-4 shrink-0 animate-spin" aria-hidden="true" />
      )}
    </div>
  );
}
