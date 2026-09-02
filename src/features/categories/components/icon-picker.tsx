'use client';

import { Search } from 'lucide-react';
import { useState } from 'react';
import { ICON_GROUPS, Icon, searchIcons, type IconName } from '@/lib/icons';
import { cn } from '@/lib/utils';

interface PickerIconDef {
  name: string;
  label: string;
}

interface IconPickerProps {
  value: string;
  onChange: (icon: IconName) => void;
}

/**
 * Searchable grid over `src/lib/icons.ts`'s curated ~60 — tasks/06-categories/
 * spec.md "Pemilih ikon menampilkan ~60 ikon terkurasi dengan pencarian."
 * Grouped thematically when the search box is empty, flat results otherwise.
 */
export function IconPicker({ value, onChange }: IconPickerProps) {
  const [query, setQuery] = useState('');
  const results = query.trim() ? searchIcons(query) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          className="text-text-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari ikon…"
          aria-label="Cari ikon"
          className={cn(
            'rounded-input bg-surface text-body text-text border-border h-11 w-full border pr-3 pl-9',
            'placeholder:text-text-subtle',
            'focus-visible:outline-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
          )}
        />
      </div>

      <div className="max-h-64 overflow-y-auto pr-1">
        {results ? (
          results.length === 0 ? (
            <p className="text-text-muted py-6 text-center text-sm">Ikon tidak ditemukan</p>
          ) : (
            <IconGrid icons={results} value={value} onChange={onChange} />
          )
        ) : (
          <div className="flex flex-col gap-4">
            {ICON_GROUPS.map((group) => (
              <div key={group.group}>
                <p className="text-text-subtle mb-2 text-xs font-medium tracking-wide uppercase">
                  {group.label}
                </p>
                <IconGrid icons={group.icons} value={value} onChange={onChange} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IconGrid({
  icons,
  value,
  onChange,
}: {
  icons: readonly PickerIconDef[];
  value: string;
  onChange: (icon: IconName) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {icons.map((def) => {
        const selected = def.name === value;
        return (
          <button
            key={def.name}
            type="button"
            onClick={() => onChange(def.name as IconName)}
            aria-pressed={selected}
            aria-label={def.label}
            title={def.label}
            className={cn(
              'pressable flex size-11 items-center justify-center rounded-full border',
              selected
                ? 'border-brand bg-brand-subtle text-brand-readable'
                : 'border-border bg-surface text-text-muted hover:bg-surface-raised',
            )}
          >
            <Icon name={def.name} aria-label={def.label} className="size-5" />
          </button>
        );
      })}
    </div>
  );
}
