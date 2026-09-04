'use client';

/**
 * The 🏠 toggle for the transaction sheet's meta row — docs/03-domain-model.md
 * §5 mechanism #1 ("Toggle 🏠 saat mencatat"), tasks/12-sharing-and-privacy
 * spec.md's meta-row acceptance criteria. Rendered by
 * src/features/transactions/components/transaction-editor.tsx ONLY when
 * `households` is non-empty — an account with no household never mounts
 * this at all, so the meta row stays byte-for-byte what it was before this
 * task for everyone else (todo.md "akun tanpa household melihat baris meta
 * persis seperti sebelumnya").
 *
 * One household: a direct binary tap, no picker (todo.md "Pemilih household
 * BILA punya lebih dari satu" — a picker only exists when there's an actual
 * choice). Multiple: tapping always opens the picker, which also offers
 * turning the tag off — so switching between households, or clearing the
 * tag, is always one sheet away regardless of the current state.
 */
import { Home } from 'lucide-react';
import { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface HouseholdOption {
  id: string;
  name: string;
}

export interface HouseholdToggleProps {
  households: HouseholdOption[];
  /** The currently-selected household, or `null` for "not tagged". */
  value: string | null;
  onChange: (householdId: string | null) => void;
}

export function HouseholdToggle({ households, value, onChange }: HouseholdToggleProps) {
  const [open, setOpen] = useState(false);
  const active = value !== null;
  const activeName = households.find((h) => h.id === value)?.name;

  function handleTap() {
    if (households.length <= 1) {
      const only = households[0];
      if (only) onChange(active ? null : only.id);
      return;
    }
    setOpen(true);
  }

  function select(id: string | null) {
    onChange(id);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleTap}
        aria-label={activeName ? `Ditandai ke ${activeName}` : 'Tandai ke keluarga'}
        aria-pressed={active}
        className={cn(
          'pressable-tint rounded-inner flex size-11 items-center justify-center',
          active ? 'text-brand-readable' : 'text-text-muted',
        )}
      >
        <Home className="size-4" aria-hidden="true" />
      </button>

      {households.length > 1 && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent title="Tandai ke keluarga">
            <ul className="flex flex-col">
              <li>
                <button
                  type="button"
                  onClick={() => select(null)}
                  aria-pressed={value === null}
                  className={cn(
                    'pressable-tint rounded-inner flex h-12 w-full items-center px-2 text-left text-sm',
                    value === null ? 'text-brand-readable bg-brand-subtle' : 'text-text',
                  )}
                >
                  Jangan tandai
                </button>
              </li>
              {households.map((household) => (
                <li key={household.id}>
                  <button
                    type="button"
                    onClick={() => select(household.id)}
                    aria-pressed={household.id === value}
                    className={cn(
                      'pressable-tint rounded-inner flex h-12 w-full items-center gap-3 px-2 text-left text-sm',
                      household.id === value ? 'text-brand-readable bg-brand-subtle' : 'text-text',
                    )}
                  >
                    <Home className="size-4 shrink-0" aria-hidden="true" />
                    {household.name}
                  </button>
                </li>
              ))}
            </ul>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
