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

  function select(userId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (userId) params.set('memberId', userId);
    else params.delete('memberId');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex gap-2 overflow-x-auto px-page-x pb-1" role="group" aria-label="Filter anggota">
      <Chip variant="filter" selected={!selectedUserId} onClick={() => select(null)}>
        Semua
      </Chip>
      {members.map((member) => (
        <Chip
          key={member.userId}
          variant="filter"
          selected={selectedUserId === member.userId}
          onClick={() => select(member.userId)}
        >
          {member.name}
        </Chip>
      ))}
    </div>
  );
}
