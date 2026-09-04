'use client';

/**
 * The (global, not per-household — docs/03-domain-model.md §5.1's known
 * limitation) exclusion list on `/settings/sharing` (docs/09-screen-specs.md
 * §17's "Dikecualikan (2)" row — UI text here says "Disembunyikan" instead:
 * docs/08-copywriting.md §3.2's binding glossary maps `exclude_from_household`
 * to "Sembunyikan dari keluarga", and per this codebase's own established
 * precedent (src/app/(app)/transactions/page.tsx's header comment), 08's
 * copy supersedes 09's mockup text wherever the two differ). Each item's
 * own toggle lives on its detail page
 * (src/features/wallets/components/wallet-detail-actions.tsx for wallets
 * today); this list exists so an item can ALSO be un-hidden straight from
 * the one-screen sharing summary, without navigating away.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { Icon } from '@/lib/icons';
import { setExcludeFromHouseholdAction } from '../actions';
import type { SharingExclusionItem } from '../queries';

interface ExclusionListProps {
  exclusions: SharingExclusionItem[];
}

export function ExclusionList({ exclusions }: ExclusionListProps) {
  const [items, setItems] = useState(exclusions);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-text text-sm font-medium">Disembunyikan ({items.length})</p>
      <ul className="flex flex-col">
        {items.map((item) => (
          <ExclusionRow key={`${item.entityType}:${item.entityId}`} item={item} onRemoved={() => {
            setItems((prev) => prev.filter((i) => i.entityId !== item.entityId));
          }} />
        ))}
      </ul>
    </div>
  );
}

function ExclusionRow({ item, onRemoved }: { item: SharingExclusionItem; onRemoved: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleUndo() {
    setError(null);
    startTransition(async () => {
      const result = await setExcludeFromHouseholdAction(item.entityType, item.entityId, false);
      if (result.error) {
        setError(result.error);
        return;
      }
      onRemoved();
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-3 py-2">
      <Icon name={item.icon} className="text-text-muted size-4 shrink-0" aria-hidden="true" />
      <span className="text-text flex-1 truncate text-sm">{item.name}</span>
      <button
        type="button"
        onClick={handleUndo}
        disabled={isPending}
        aria-label={`Tampilkan ${item.name} di keluarga lagi`}
        className="pressable-tint rounded-inner text-text-muted flex size-8 items-center justify-center disabled:opacity-50"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      {error && (
        <p role="alert" className="text-negative text-xs">
          {error}
        </p>
      )}
    </li>
  );
}
