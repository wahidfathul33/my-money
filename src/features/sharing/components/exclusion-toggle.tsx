'use client';

/**
 * `exclude_from_household` toggle — docs/03-domain-model.md §5.1's per-item
 * escape hatch, usable on wallets today and on assets/debts/receivables/
 * savings_goals once those features land (tasks 16-18) — same component,
 * different `entityType`/`entityId`. docs/10-ux-states.md §5.1: "Mengecualikan
 * satu item" needs NO confirmation ("Menyempitkan cakupan, tidak
 * melebarkannya") — applied immediately, exactly like turning `share_wealth`
 * OFF (src/features/sharing/components/share-wealth-toggle.tsx).
 *
 * UI copy says "Sembunyikan", never "Kecualikan" — docs/08-copywriting.md
 * §3.2's binding glossary: `exclude_from_household` → "Sembunyikan dari
 * keluarga". "Kecualikan"/"exclude" stays as the internal/code name only
 * (this file's own name included — docs/08 §3.2 draws that line
 * explicitly: spec terms and UI terms are allowed to differ).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { setExcludeFromHouseholdAction } from '../actions';
import type { HouseholdWealthEntityType } from '@/lib/services/sharing';

interface ExclusionToggleProps {
  entityType: HouseholdWealthEntityType;
  entityId: string;
  /** Label describing what's being excluded, e.g. "Dompet ini" — used only
   * for the accessible name, since the switch has no separate visible
   * label element (callers place their own alongside it). */
  label: string;
  excluded: boolean;
}

export function ExclusionToggle({ entityType, entityId, label, excluded }: ExclusionToggleProps) {
  const router = useRouter();
  const [value, setValue] = useState(excluded);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleChange(next: boolean) {
    setValue(next); // optimistic — no confirmation, no loading flicker
    setError(null);
    startTransition(async () => {
      const result = await setExcludeFromHouseholdAction(entityType, entityId, next);
      if (result.error) {
        setValue(!next); // roll back
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Switch label={`Sembunyikan ${label} dari keluarga`} checked={value} onCheckedChange={handleChange} />
      {error && (
        <p role="alert" className="text-negative text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
